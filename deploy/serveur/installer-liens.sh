#!/bin/sh
# Crée le compte « liens », qui ne peut que transmettre une commande JSON au service courrier.
# À lancer une fois, en root, depuis ce dossier, avec la clé PUBLIQUE dédiée du Mac :
#   sudo sh installer-liens.sh "ssh-ed25519 AAAA... liens"
# Idempotent. Le compte n'est pas dans le groupe docker : il passe par une règle sudo sans argument.
set -eu

CLE_PUBLIQUE="${1:-}"
case "$CLE_PUBLIQUE" in
  ssh-ed25519\ *) ;;
  *) echo "Usage : sudo sh $0 \"ssh-ed25519 AAAA... liens\"" >&2; exit 1 ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
cd "$(dirname "$0")"

# Compte sans mot de passe, hors du groupe docker (qui vaut root).
if ! id liens > /dev/null 2>&1; then
  useradd --create-home --shell /bin/sh liens
fi
passwd -l liens > /dev/null
if id -nG liens | tr ' ' '\n' | grep -qx docker; then
  gpasswd -d liens docker > /dev/null
fi

install -m 755 -o root -g root liens.sh /usr/local/sbin/nclsmgr-liens

# Règle sudo : cette seule commande, sans aucun argument ("").
REGLE=/etc/sudoers.d/nclsmgr-liens
printf '%s\n' 'liens ALL=(root) NOPASSWD: /usr/local/sbin/nclsmgr-liens ""' > "$REGLE.tmp"
chmod 440 "$REGLE.tmp"
visudo -cf "$REGLE.tmp" > /dev/null
mv "$REGLE.tmp" "$REGLE"

# Clé hors du dossier personnel, que le compte pourrait sinon modifier ; tout appartient à root.
install -d -m 755 -o root -g root /etc/ssh/authorized_keys
printf 'restrict,command="sudo -n /usr/local/sbin/nclsmgr-liens" %s\n' "$CLE_PUBLIQUE" > /etc/ssh/authorized_keys/liens
chmod 644 /etc/ssh/authorized_keys/liens
chown root:root /etc/ssh/authorized_keys/liens

# Autoriser le compte, puis une seconde barrière indépendante de la ligne de la clé.
CONF=/etc/ssh/sshd_config.d/10-durcissement.conf
if ! grep -qE '^AllowUsers .*\bliens\b' "$CONF"; then
  sed -i -E 's/^(AllowUsers .*)$/\1 liens/' "$CONF"
fi
cat > /etc/ssh/sshd_config.d/90-liens.conf <<'BLOC'
Match User liens
  AuthorizedKeysFile /etc/ssh/authorized_keys/%u
  ForceCommand sudo -n /usr/local/sbin/nclsmgr-liens
  DisableForwarding yes
  PermitTTY no
Match all
BLOC
chmod 644 /etc/ssh/sshd_config.d/90-liens.conf
sshd -t
systemctl reload ssh

echo "Compte liens prêt."
echo "Groupes : $(id -nG liens)"
sudo -l -U liens | tail -n 1
sshd -T -C user=liens,host=x,addr=192.0.2.1 | grep -Ei '^(authorizedkeysfile|forcecommand|disableforwarding|permittty) '
grep '^AllowUsers' "$CONF"
