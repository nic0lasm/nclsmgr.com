#!/bin/sh
# Prépare le serveur au déploiement automatique du jeu Frontfall. À lancer une fois, en root,
# depuis ce dossier, après un déploiement de nclsmgr.com qui a créé le réseau frontfall :
#   sudo sh installer-frontfall.sh "ssh-ed25519 AAAA... deploiement-frontfall"
# L'argument est la clé PUBLIQUE de déploiement du jeu. La clé privée ne va que dans les secrets
# du dépôt nic0lasm/frontfall. Relancer le script met à jour la commande et le fichier Compose.
set -eu

CLE_PUBLIQUE="${1:-}"
case "$CLE_PUBLIQUE" in
  ssh-ed25519\ *) ;;
  *) echo "Usage : sudo sh $0 \"ssh-ed25519 AAAA... commentaire\"" >&2; exit 1 ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
cd "$(dirname "$0")"

# Compte distinct du déploiement du site : une clé compromise d'un côté ne publie pas l'autre.
if ! id frontfall > /dev/null 2>&1; then
  useradd --create-home --shell /bin/sh frontfall
fi
passwd -l frontfall > /dev/null
usermod -aG docker frontfall

install -m 755 -o root -g root deployer-frontfall.sh /usr/local/sbin/frontfall-deployer

install -d -m 755 -o root -g root /home/frontfall/.ssh
printf 'restrict,command="/usr/local/sbin/frontfall-deployer" %s\n' "$CLE_PUBLIQUE" > /home/frontfall/.ssh/authorized_keys
chmod 644 /home/frontfall/.ssh/authorized_keys
chown root:root /home/frontfall/.ssh/authorized_keys

CONF=/etc/ssh/sshd_config.d/10-durcissement.conf
if ! grep -qE '^AllowUsers .*\bfrontfall\b' "$CONF"; then
  sed -i -E 's/^(AllowUsers .*)$/\1 frontfall/' "$CONF"
fi
sshd -t
systemctl reload ssh

# Les dossiers et les fichiers Compose appartiennent à root ; le compte n'écrit que l'étiquette.
# /opt/frontfall sert la production, /opt/frontfall-next la préproduction (branche next du jeu).
for cible in frontfall:compose.yaml frontfall-next:compose-next.yaml; do
  dossier=/opt/${cible%%:*}
  install -d -m 755 -o root -g root "$dossier"
  install -m 644 -o root -g root "../frontfall/${cible#*:}" "$dossier/compose.yaml"
  if [ ! -f "$dossier/.env" ]; then
    install -m 644 -o frontfall -g frontfall /dev/null "$dossier/.env"
  fi
done

echo "Serveur prêt pour le déploiement du jeu."
echo "Compte : $(id frontfall)"
echo "Clé autorisée : $(cut -d' ' -f1-2 /home/frontfall/.ssh/authorized_keys)"
grep '^AllowUsers' "$CONF"
docker network inspect frontfall --format 'Réseau : {{.Name}} (interne : {{.Internal}})' 2> /dev/null \
  || echo "Réseau frontfall absent : déployer nclsmgr.com avant le premier déploiement du jeu."
