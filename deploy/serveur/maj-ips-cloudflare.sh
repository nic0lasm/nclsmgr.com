#!/bin/sh
# Regénère la liste des plages Cloudflare reconnues par Caddy, à partir des listes officielles,
# puis recharge Caddy si la liste a changé. Lancé chaque semaine par un minuteur systemd.
set -eu

CIBLE=/opt/nclsmgr/cloudflare-ips.caddy
v4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
v6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)
plages=$(echo $v4 $v6)

if [ "$(echo "$plages" | wc -w)" -lt 10 ]; then
  echo "Liste Cloudflare incomplète, rien n'est modifié." >&2
  exit 1
fi

nouveau="trusted_proxies static $plages"
if [ -f "$CIBLE" ] && [ "$(cat "$CIBLE")" = "$nouveau" ]; then
  exit 0
fi

printf '%s\n' "$nouveau" > "$CIBLE.tmp"
chmod 644 "$CIBLE.tmp"
mv "$CIBLE.tmp" "$CIBLE"
if [ -f /opt/nclsmgr/compose.yaml ]; then
  docker compose -f /opt/nclsmgr/compose.yaml restart caddy > /dev/null || true
fi
# Pare-feu de l'origine (restreindre-origine.sh), s'il est installé.
if [ -x /usr/local/sbin/nclsmgr-pare-feu-origine ]; then
  /usr/local/sbin/nclsmgr-pare-feu-origine
fi
echo "Plages Cloudflare mises à jour."
