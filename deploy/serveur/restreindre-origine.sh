#!/bin/sh
# Réserve les ports 80 et 443 aux plages Cloudflare : le site ne répond plus en direct sur l'IP.
# À lancer une fois, en root, depuis ce dossier, quand le DNS ne publie plus que des A proxifiés
# (aucun AAAA vers l'origine) :
#   sudo sh restreindre-origine.sh
# Les ports publiés par Docker échappent à UFW en IPv4 : le filtre passe par la chaîne DOCKER-USER,
# remise en place au démarrage de Docker et à chaque mise à jour hebdomadaire des plages.
# En IPv6, Docker n'a pas de réseau : le docker-proxy écoute sur l'hôte, et UFW ferme 80 et 443.
# Idempotent. Retour arrière : sudo sh restreindre-origine.sh retirer
set -eu

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
cd "$(dirname "$0")"
FILTRE=/usr/local/sbin/nclsmgr-pare-feu-origine

if [ "${1:-}" = retirer ]; then
  systemctl disable --now nclsmgr-pare-feu-origine.service > /dev/null 2>&1 || true
  rm -f /etc/systemd/system/nclsmgr-pare-feu-origine.service "$FILTRE"
  systemctl daemon-reload
  while iptables -S DOCKER-USER | grep -q NCLSMGR-ORIGINE; do
    regle=$(iptables -S DOCKER-USER | grep NCLSMGR-ORIGINE | head -1 | sed 's/^-A /-D /')
    eval "iptables $regle"
  done
  iptables -F NCLSMGR-ORIGINE 2> /dev/null && iptables -X NCLSMGR-ORIGINE
  ufw allow 80/tcp > /dev/null
  ufw allow 443/tcp > /dev/null
  echo "Restriction retirée : 80 et 443 de nouveau ouverts à tous."
  exit 0
fi

cat > "$FILTRE" <<'FILTRE'
#!/bin/sh
# Remplit la chaîne NCLSMGR-ORIGINE avec les plages IPv4 de Cloudflare, en une seule opération,
# et la branche sur DOCKER-USER pour les connexions entrantes vers 80 et 443.
set -eu
plages=$(tr ' ' '\n' < /opt/nclsmgr/cloudflare-ips.caddy | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$')
[ "$(echo "$plages" | wc -l)" -ge 10 ] || { echo "Plages Cloudflare incomplètes, filtre inchangé." >&2; exit 1; }
interface=$(ip -4 route show default | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit } }')
[ -n "$interface" ] || { echo "Interface par défaut introuvable." >&2; exit 1; }

iptables -N NCLSMGR-ORIGINE 2> /dev/null || true
{
  echo "*filter"
  echo ":NCLSMGR-ORIGINE - [0:0]"
  for p in $plages; do echo "-A NCLSMGR-ORIGINE -s $p -j RETURN"; done
  echo "-A NCLSMGR-ORIGINE -j DROP"
  echo "COMMIT"
} | iptables-restore --noflush

for port in 80 443; do
  set -- -i "$interface" -p tcp -m conntrack --ctdir ORIGINAL --ctorigdstport "$port" -j NCLSMGR-ORIGINE
  iptables -C DOCKER-USER "$@" 2> /dev/null || iptables -I DOCKER-USER "$@"
done
FILTRE
chmod 755 "$FILTRE"

cat > /etc/systemd/system/nclsmgr-pare-feu-origine.service <<'UNITE'
[Unit]
Description=Ports 80 et 443 réservés aux plages Cloudflare
After=docker.service
PartOf=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/nclsmgr-pare-feu-origine

[Install]
WantedBy=docker.service
UNITE
systemctl daemon-reload
systemctl enable nclsmgr-pare-feu-origine.service > /dev/null
systemctl restart nclsmgr-pare-feu-origine.service

# La mise à jour hebdomadaire des plages recharge aussi le filtre.
install -m 755 -o root -g root maj-ips-cloudflare.sh /usr/local/sbin/nclsmgr-maj-ips-cloudflare

# IPv6 : plus aucun accès direct au site.
ufw delete allow 80/tcp > /dev/null 2>&1 || true
ufw delete allow 443/tcp > /dev/null 2>&1 || true

echo "Filtre actif :"
iptables -S DOCKER-USER | grep NCLSMGR-ORIGINE
echo "Plages autorisées : $(iptables -S NCLSMGR-ORIGINE | grep -c RETURN)"
ufw status | grep -E '^(80|443)' || echo "UFW : 80 et 443 fermés (IPv6 compris)."
