#!/bin/sh
# Prépare un serveur Debian 13 neuf (image OVH, compte « debian » avec votre clé SSH) comme l'actuel :
# SSH par clé seulement, pare-feu, bannissement automatique, mises à jour de sécurité automatiques,
# Docker avec Compose. À lancer une fois, en root :
#   sudo sh durcir-serveur.sh
# Idempotent. Refuse de couper les mots de passe SSH si le compte debian n'a aucune clé autorisée.
# Les autres scripts de ce dossier supposent ce résultat (fichier sshd_config.d/10-durcissement.conf
# avec une ligne AllowUsers, qu'ils complètent).
set -eu

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
ADMIN=debian
[ -s "/home/$ADMIN/.ssh/authorized_keys" ] \
  || { echo "Aucune clé dans /home/$ADMIN/.ssh/authorized_keys : refus de fermer l'accès par mot de passe." >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades apt-listchanges ca-certificates curl gnupg \
  restic sqlite3 > /dev/null

# SSH : clé seulement, pas de root. 10- passe avant les réglages posés par l'hébergeur (premier gagnant).
CONF=/etc/ssh/sshd_config.d/10-durcissement.conf
if [ ! -f "$CONF" ]; then
  cat > "$CONF" <<FIN
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
AllowUsers $ADMIN
FIN
  chmod 644 "$CONF"
fi
sshd -t
systemctl reload ssh

# Pare-feu : SSH (limité), 80 et 443. Restreint ensuite aux plages Cloudflare par restreindre-origine.sh.
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw limit 22/tcp > /dev/null
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw --force enable > /dev/null

# Pas d'IPv6 sortant : le site n'en publie aucune, et R2 filtre le jeton de sauvegarde par adresse
# (Go préfère l'IPv6 quand elle existe : la sauvegarde arriverait par une adresse non autorisée).
printf 'net.ipv6.conf.all.disable_ipv6=1\nnet.ipv6.conf.default.disable_ipv6=1\n' > /etc/sysctl.d/99-sans-ipv6.conf
sysctl --system > /dev/null

cat > /etc/fail2ban/jail.d/sshd.local <<'FIN'
[sshd]
enabled = true
backend = systemd
maxretry = 4
findtime = 10m
bantime = 1h
FIN
systemctl enable --now fail2ban > /dev/null
systemctl restart fail2ban

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'FIN'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
FIN
systemctl enable --now unattended-upgrades > /dev/null

# Docker (dépôt officiel) : Compose 2.24 ou plus est exigé par installer-frontfall.sh.
if ! command -v docker > /dev/null; then
  install -m 755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian %s stable\n' \
    "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin > /dev/null
fi
systemctl enable --now docker > /dev/null

echo "Serveur durci."
sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|allowusers) '
ufw status | head -n 8
fail2ban-client status sshd | head -n 4
docker --version
docker compose version
echo "Un redémarrage est conseillé si un nouveau noyau a été installé : sudo reboot."
