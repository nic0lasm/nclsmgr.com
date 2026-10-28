#!/bin/sh
# Met en place les sauvegardes chiffrées et la sonde de disponibilité. À lancer en root, depuis ce
# dossier :
#   sudo sh installer-sauvegarde.sh
# Demande l'adresse du dépôt S3 (par exemple s3:https://<compte>.r2.cloudflarestorage.com/<bucket>),
# une clé d'accès limitée à ce bucket et les deux adresses de sonde du service de surveillance. Rien
# n'est affiché à la saisie des secrets. Idempotent : les réponses déjà enregistrées ne sont pas
# redemandées.
set -eu

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
cd "$(dirname "$0")"

apt-get update -qq
apt-get install -y -qq restic sqlite3 > /dev/null
install -m 755 -o root -g root sauvegarde.sh /usr/local/sbin/nclsmgr-sauvegarde
install -m 755 -o root -g root verifier-restauration.sh /usr/local/sbin/nclsmgr-verif-restauration
install -m 755 -o root -g root restaurer-frontfall.sh /usr/local/sbin/nclsmgr-restaurer-frontfall
install -m 755 -o root -g root sonde-disponibilite.sh /usr/local/sbin/nclsmgr-sonde
# Ne pas toucher aux droits d'un dossier existant : le déployeur (compte deploy) et le service
# courrier y lisent leurs fichiers, comme le prévoit configurer-smtp.sh.
[ -d /etc/nclsmgr ] || install -d -m 755 -o root -g root /etc/nclsmgr

ENV=/etc/nclsmgr/sauvegarde.env
SONDE=/etc/nclsmgr/sonde.env
MDP=/etc/nclsmgr/restic.motdepasse
# Adresse de sonde : obligatoire, sans quoi les alertes seraient muettes.
demander_sonde() {
  while :; do
    printf '%s (https://hc-ping.com/…) : ' "$1" >&2; read -r url
    case $url in https://?*) printf '%s' "$url"; return ;; esac
    echo "Adresse https:// attendue." >&2
  done
}
umask 077
if [ ! -f "$ENV" ]; then
  printf 'Dépôt restic (s3:https://…/bucket) : '; read -r depot
  printf 'Identifiant de la clé d'"'"'accès : '; read -r cle
  printf 'Secret de la clé d'"'"'accès : '; stty -echo; read -r secret; stty echo; echo
  signal=$(demander_sonde "Adresse de sonde des sauvegardes")
  cat > "$ENV" <<FIN
RESTIC_REPOSITORY=$depot
RESTIC_PASSWORD_FILE=$MDP
RESTIC_CACHE_DIR=/var/cache/nclsmgr-restic
AWS_ACCESS_KEY_ID=$cle
AWS_SECRET_ACCESS_KEY=$secret
AWS_DEFAULT_REGION=auto
SIGNAL_URL=$signal
FIN
fi
if [ ! -f "$SONDE" ]; then
  sonde=$(demander_sonde "Adresse de sonde du site")
  printf 'SONDE_URL=%s\n' "$sonde" > "$SONDE"
fi
if [ ! -f "$MDP" ]; then
  openssl rand -base64 32 > "$MDP"
  echo
  echo "Mot de passe de chiffrement des sauvegardes (à ranger dans ton gestionnaire de mots de passe :"
  echo "sans lui, aucune restauration n'est possible si le serveur est perdu) :"
  cat "$MDP"
  echo
fi
# Secrets de la sauvegarde : lisibles par root seul, quel que soit l'état laissé par une version antérieure.
chown root:root "$ENV" "$SONDE" "$MDP"
chmod 600 "$ENV" "$SONDE" "$MDP"

umask 022
set -a; . "$ENV"; set +a
restic cat config > /dev/null 2>&1 || restic init

unite() { # nom, description, calendrier, délai aléatoire, lignes [Service] supplémentaires
  cat > "/etc/systemd/system/nclsmgr-$1.service" <<FIN
[Unit]
Description=$2
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/nclsmgr-$1
PrivateTmp=true
NoNewPrivileges=true
ProtectHome=true
ProtectSystem=strict
$5
FIN
  cat > "/etc/systemd/system/nclsmgr-$1.timer" <<FIN
[Unit]
Description=$2

[Timer]
OnCalendar=$3
RandomizedDelaySec=$4
Persistent=true

[Install]
WantedBy=timers.target
FIN
}
RESTIC="EnvironmentFile=$ENV
CacheDirectory=nclsmgr-restic"
# La copie SQLite écrit à côté de la base ; le test de restauration n'y touche pas.
unite sauvegarde "Sauvegarde chiffrée hors site" "*-*-* 03:30" 30min "$RESTIC
StateDirectory=nclsmgr-sauvegarde
StateDirectoryMode=0700
ReadWritePaths=-/var/lib/docker/volumes/nclsmgr_base/_data"
unite verif-restauration "Test de restauration des sauvegardes" "*-*-01 05:00" 30min "$RESTIC"
# La sonde n'a besoin d'aucun droit : compte éphémère, aucune écriture.
unite sonde "Sonde de disponibilité du site" "*:0/5" 0 "EnvironmentFile=$SONDE
DynamicUser=true"

systemctl daemon-reload
systemctl enable --now nclsmgr-sauvegarde.timer nclsmgr-verif-restauration.timer nclsmgr-sonde.timer > /dev/null
echo "Sonde du site…"
systemctl start nclsmgr-sonde.service || echo "Sonde en échec : journalctl -u nclsmgr-sonde" >&2
echo "Première sauvegarde…"
systemctl start nclsmgr-sauvegarde.service
systemctl start nclsmgr-verif-restauration.service
journalctl -u nclsmgr-sauvegarde.service -u nclsmgr-verif-restauration.service --since -2h --no-pager -o cat \
  | grep -E '^(Sauvegarde envoyée|Restauration vérifiée)' | tail -n 2
restic snapshots --host nclsmgr --compact
systemctl list-timers 'nclsmgr-*' --no-pager
