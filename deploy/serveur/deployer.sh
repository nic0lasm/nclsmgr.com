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
for fichier in compose.yaml Caddyfile; do
  if [ ! -f "$TMP/$fichier" ] || [ -L "$TMP/$fichier" ]; then
    echo "Fichier manquant ou invalide : $fichier" >&2
    exit 3
  fi
  install -m 644 "$TMP/$fichier" "$DOSSIER/$fichier"
done

cd "$DOSSIER"
printf 'IMAGE_TAG=%s\n' "$TAG" > .env
docker compose pull --quiet
docker compose up -d --remove-orphans --wait --wait-timeout 120
docker image prune -f > /dev/null
echo "Déployé : $TAG"
