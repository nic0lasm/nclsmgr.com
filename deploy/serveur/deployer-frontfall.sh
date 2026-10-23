#!/bin/sh
# Commande forcée de la clé SSH de déploiement du jeu (voir installer-frontfall.sh).
# Reçoit dans SSH_ORIGINAL_COMMAND l'étiquette de l'image à déployer (12 caractères hexadécimaux).
# Le fichier Compose est celui installé depuis ce dépôt : le dépôt du jeu ne peut pas le changer.
set -eu

DOSSIER=/opt/frontfall
TAG="${SSH_ORIGINAL_COMMAND:-}"

case "$TAG" in
  "" | *[!0-9a-f]*) echo "Étiquette d'image invalide." >&2; exit 2 ;;
esac
if [ "${#TAG}" -ne 12 ]; then
  echo "Étiquette d'image invalide." >&2
  exit 2
fi

# Le réseau appartient au projet nclsmgr : il existe dès que Caddy l'a rejoint.
if ! docker network inspect frontfall > /dev/null 2>&1; then
  echo "Réseau frontfall absent : déployer d'abord nclsmgr.com." >&2
  exit 3
fi

cd "$DOSSIER"
printf 'IMAGE_TAG=%s\n' "$TAG" > .env
docker compose pull --quiet
docker compose up -d --remove-orphans --wait --wait-timeout 120
docker image prune -f > /dev/null
echo "Déployé : $TAG"
