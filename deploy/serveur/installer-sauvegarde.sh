#!/bin/sh
# Met en place les sauvegardes chiffrées. À lancer une fois, en root, depuis ce dossier :
#   sudo sh installer-sauvegarde.sh
# Demande l'adresse du dépôt S3 (par exemple s3:https://<compte>.r2.cloudflarestorage.com/<bucket>)
# et une clé d'accès limitée à ce bucket. Rien n'est affiché à la saisie des secrets.
set -eu

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
cd "$(dirname "$0")"

apt-get update -qq
apt-get install -y -qq restic sqlite3 > /dev/null
install -m 755 -o root -g root sauvegarde.sh /usr/local/sbin/nclsmgr-sauvegarde
install -m 755 -o root -g root verifier-restauration.sh /usr/local/sbin/nclsmgr-verif-restauration
install -d -m 700 -o root -g root /etc/nclsmgr

ENV=/etc/nclsmgr/sauvegarde.env
MDP=/etc/nclsmgr/restic.motdepasse
if [ ! -f "$ENV" ]; then
  printf 'Dépôt restic (s3:https://…/bucket) : '; read -r depot
  printf 'Identifiant de la clé d'"'"'accès : '; read -r cle
  printf 'Secret de la clé d'"'"'accès : '; stty -echo; read -r secret; stty echo; echo
  printf 'URL de sonde (facultative, Entrée pour ignorer) : '; read -r sonde
  umask 077
  cat > "$ENV" <<FIN
RESTIC_REPOSITORY=$depot
RESTIC_PASSWORD_FILE=$MDP
RESTIC_CACHE_DIR=/var/cache/nclsmgr-restic
AWS_ACCESS_KEY_ID=$cle
AWS_SECRET_ACCESS_KEY=$secret
SIGNAL_URL=$sonde
FIN
fi
if [ ! -f "$MDP" ]; then
  umask 077
  openssl rand -base64 32 > "$MDP"
  echo
  echo "Mot de passe de chiffrement des sauvegardes (à ranger dans ton gestionnaire de mots de passe :"
  echo "sans lui, aucune restauration n'est possible si le serveur est perdu) :"
  cat "$MDP"
  echo
fi

set -a; . "$ENV"; set +a
restic cat config > /dev/null 2>&1 || restic init

for nom in sauvegarde verif-restauration; do
  case $nom in
    sauvegarde) quand="*-*-* 03:30"; desc="Sauvegarde chiffrée hors site" ;;
    verif-restauration) quand="*-*-01 05:00"; desc="Test de restauration des sauvegardes" ;;
  esac
  cat > "/etc/systemd/system/nclsmgr-$nom.service" <<FIN
[Unit]
Description=$desc
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=$ENV
ExecStart=/usr/local/sbin/nclsmgr-$nom
StateDirectory=nclsmgr-sauvegarde
StateDirectoryMode=0700
CacheDirectory=nclsmgr-restic
PrivateTmp=true
NoNewPrivileges=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=-/var/lib/docker/volumes/nclsmgr_base/_data
FIN
  cat > "/etc/systemd/system/nclsmgr-$nom.timer" <<FIN
[Unit]
Description=$desc

[Timer]
OnCalendar=$quand
RandomizedDelaySec=30min
Persistent=true

[Install]
WantedBy=timers.target
FIN
done

systemctl daemon-reload
systemctl enable --now nclsmgr-sauvegarde.timer nclsmgr-verif-restauration.timer > /dev/null
echo "Première sauvegarde…"
systemctl start nclsmgr-sauvegarde.service
systemctl start nclsmgr-verif-restauration.service
journalctl -u nclsmgr-verif-restauration.service -n 1 --no-pager -o cat
systemctl list-timers 'nclsmgr-*' --no-pager
