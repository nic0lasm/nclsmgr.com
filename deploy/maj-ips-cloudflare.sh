#!/usr/bin/env bash
# Regénère la liste des plages Cloudflare reconnues par Caddy, à partir des listes officielles.
# À lancer sur le serveur depuis le dossier de déploiement, puis : docker compose restart caddy
set -euo pipefail

v4=$(curl -fsS https://www.cloudflare.com/ips-v4)
v6=$(curl -fsS https://www.cloudflare.com/ips-v6)
echo "trusted_proxies static $(echo $v4 $v6)" > cloudflare-ips.caddy
echo "cloudflare-ips.caddy mis à jour ($(echo $v4 $v6 | wc -w) plages)."
