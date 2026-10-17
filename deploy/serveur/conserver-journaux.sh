#!/bin/sh
# Journaux du serveur conservés 30 jours au plus, comme l'annonce la page Confidentialité.
# journald reçoit les journaux système (sshd, UFW), ceux de fail2ban et, par le pilote journald de
# compose.yaml, ceux des conteneurs : une seule durée s'applique à toutes les adresses IP notées.
# À lancer une fois, en root, depuis ce dossier :
#   sudo sh conserver-journaux.sh
# Idempotent. Supprime les entrées de plus de 30 jours et les anciens fichiers de fail2ban, dont
# le journal passe dans journald.
set -eu

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }

# Un fichier par jour : la suppression ne garde jamais un fichier entier au-delà de 30 jours.
install -d -m 755 /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/conservation.conf << 'EOF'
# Journaux du serveur : 30 jours au plus (page Confidentialité du site).
[Journal]
MaxRetentionSec=30day
MaxFileSec=1day
EOF
chmod 644 /etc/systemd/journald.conf.d/conservation.conf
systemctl restart systemd-journald

if [ -d /etc/fail2ban ]; then
  install -d -m 755 /etc/fail2ban/fail2ban.d
  cat > /etc/fail2ban/fail2ban.d/journal.local << 'EOF'
# Journal de fail2ban dans journald, soumis à la même durée de conservation.
[DEFAULT]
logtarget = SYSTEMD-JOURNAL
EOF
  chmod 644 /etc/fail2ban/fail2ban.d/journal.local
  # fail2ban protège SSH : on ne le redémarre qu'avec une configuration valide.
  if ! fail2ban-client -t > /dev/null 2>&1; then
    rm -f /etc/fail2ban/fail2ban.d/journal.local
    echo "Configuration de fail2ban refusée : fail2ban est laissé tel quel." >&2
    exit 1
  fi
  systemctl restart fail2ban
  rm -f /var/log/fail2ban.log /var/log/fail2ban.log.*
fi

journalctl --rotate
journalctl --vacuum-time=30d 2>&1 | tail -n 1

echo
echo "Réglage en vigueur :"
systemd-analyze cat-config systemd/journald.conf | grep -E '^(# /etc|MaxRetentionSec|MaxFileSec)'
if [ -d /etc/fail2ban ]; then
  echo "fail2ban : $(fail2ban-client get logtarget | tail -n 1)"
fi
echo "Plus ancienne entrée du journal : $(journalctl -q --no-pager -o short-iso | head -n 1 | cut -d' ' -f1)"
if [ -e /etc/logrotate.d/rsyslog ]; then
  echo "Attention : rsyslog est installé, ses fichiers de /var/log suivent leur propre rotation."
fi
