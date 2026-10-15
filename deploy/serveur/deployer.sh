#!/bin/sh
# Commande forcée de la clé SSH de déploiement (voir installer-deploiement.sh).
# Reçoit sur l'entrée standard une archive tar contenant compose.yaml et Caddyfile,
# et dans SSH_ORIGINAL_COMMAND l'étiquette de l'image à déployer (12 caractères hexadécimaux).
set -eu

DOSSIER=/opt/nclsmgr
TAG="${SSH_ORIGINAL_COMMAND:-}"

case "$TAG" in
  "" | *[!0-9a-f]*) echo "Étiquette d'image invalide." >&2; exit 2 ;;
esac
if [ "${#TAG}" -ne 12 ]; then
  echo "Étiquette d'image invalide." >&2
  exit 2
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

tar -xf - -C "$TMP" --no-same-owner --no-same-permissions compose.yaml Caddyfile
ancien_caddyfile=$(cat "$DOSSIER/Caddyfile" 2> /dev/null || true)
for fichier in compose.yaml Caddyfile; do
  if [ ! -f "$TMP/$fichier" ] || [ -L "$TMP/$fichier" ]; then
    echo "Fichier manquant ou invalide : $fichier" >&2
    exit 3
  fi
  install -m 644 "$TMP/$fichier" "$DOSSIER/$fichier"
done

cd "$DOSSIER"
printf 'IMAGE_TAG=%s\n' "$TAG" > .env
# Les services facultatifs ne démarrent qu'une fois leurs secrets en place.
profils=""
if [ -f /etc/nclsmgr/smtp.json ]; then
  profils="courrier"
fi
if [ -f /etc/nclsmgr/umami.env ]; then
  profils="${profils:+$profils,}statistiques"
fi
if [ -n "$profils" ]; then
  echo "COMPOSE_PROFILES=$profils" >> .env
fi
docker compose pull --quiet
docker compose up -d --remove-orphans --wait --wait-timeout 120
# Le Caddyfile est monté fichier par fichier : Caddy ne voit la nouvelle version qu'au redémarrage.
if [ "$(cat Caddyfile)" != "$ancien_caddyfile" ]; then
  docker compose restart caddy > /dev/null
fi
docker image prune -f > /dev/null
echo "Déployé : $TAG"
