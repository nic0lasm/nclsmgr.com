#!/bin/sh
# Prépare le serveur au déploiement automatique. À lancer une seule fois, en root, depuis ce dossier :
#   sudo sh installer-deploiement.sh "ssh-ed25519 AAAA... deploiement-github"
# L'argument est la clé PUBLIQUE de déploiement. La clé privée ne va que dans les secrets GitHub.
set -eu

CLE_PUBLIQUE="${1:-}"
case "$CLE_PUBLIQUE" in
  ssh-ed25519\ *) ;;
  *) echo "Usage : sudo sh $0 \"ssh-ed25519 AAAA... commentaire\"" >&2; exit 1 ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
cd "$(dirname "$0")"

# Compte de déploiement : pas de mot de passe, membre du groupe docker.
if ! id deploy > /dev/null 2>&1; then
  useradd --create-home --shell /bin/sh deploy
fi
passwd -l deploy > /dev/null
usermod -aG docker deploy

# Commandes installées hors de portée du compte de déploiement.
install -m 755 -o root -g root deployer.sh /usr/local/sbin/nclsmgr-deployer
install -m 755 -o root -g root maj-ips-cloudflare.sh /usr/local/sbin/nclsmgr-maj-ips-cloudflare

# La clé ne peut lancer que la commande forcée, sans terminal ni redirection.
# Le fichier appartient à root : le compte deploy ne peut pas l'élargir.
install -d -m 755 -o root -g root /home/deploy/.ssh
printf 'restrict,command="/usr/local/sbin/nclsmgr-deployer" %s\n' "$CLE_PUBLIQUE" > /home/deploy/.ssh/authorized_keys
chmod 644 /home/deploy/.ssh/authorized_keys
chown root:root /home/deploy/.ssh/authorized_keys

# Autoriser le compte dans la configuration SSH durcie.
CONF=/etc/ssh/sshd_config.d/10-durcissement.conf
if ! grep -qE '^AllowUsers .*\bdeploy\b' "$CONF"; then
  sed -i -E 's/^(AllowUsers .*)$/\1 deploy/' "$CONF"
fi
sshd -t
systemctl reload ssh

# Dossier de déploiement et certificats.
install -d -m 750 -o deploy -g deploy /opt/nclsmgr
install -d -m 700 -o root -g root /etc/nclsmgr/certs
if [ ! -f /etc/nclsmgr/certs/origin.pem ]; then
  # Certificat provisoire, remplacé par le certificat d'origine Cloudflare.
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=nclsmgr.com" \
    -addext "subjectAltName=DNS:nclsmgr.com,DNS:www.nclsmgr.com" \
    -keyout /etc/nclsmgr/certs/origin-key.pem -out /etc/nclsmgr/certs/origin.pem 2> /dev/null
  chmod 600 /etc/nclsmgr/certs/origin-key.pem
fi

# Plages Cloudflare : maintenant, puis chaque semaine.
/usr/local/sbin/nclsmgr-maj-ips-cloudflare
chown deploy:deploy /opt/nclsmgr/cloudflare-ips.caddy

cat > /etc/systemd/system/nclsmgr-maj-ips.service <<'UNITE'
[Unit]
Description=Mise à jour des plages Cloudflare pour Caddy
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/nclsmgr-maj-ips-cloudflare
UNITE

cat > /etc/systemd/system/nclsmgr-maj-ips.timer <<'UNITE'
[Unit]
Description=Mise à jour hebdomadaire des plages Cloudflare

[Timer]
OnCalendar=weekly
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
UNITE

systemctl daemon-reload
systemctl enable --now nclsmgr-maj-ips.timer > /dev/null

echo "Serveur prêt pour le déploiement."
echo "Compte : $(id deploy)"
echo "Clé autorisée : $(cut -d' ' -f1-2 /home/deploy/.ssh/authorized_keys)"
grep '^AllowUsers' "$CONF"
systemctl list-timers nclsmgr-maj-ips.timer --no-pager | head -n 2
