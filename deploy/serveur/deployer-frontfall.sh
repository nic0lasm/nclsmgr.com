#!/bin/sh
# Commande forcée de la clé SSH de déploiement du jeu (voir installer-frontfall.sh).
# SSH_ORIGINAL_COMMAND vaut, avec « next » devant pour la préproduction :
#   <étiquette>         déploie l'image de cette étiquette (12 caractères hexadécimaux) ;
#   annonce <minutes>   prévient les joueurs connectés d'une mise à jour dans 1 à 60 minutes.
# Le fichier Compose est celui installé depuis ce dépôt : le dépôt du jeu ne peut pas le changer.
set -eu

# shellcheck disable=SC2086 # découpage voulu en mots, sans motifs possibles (vérifiés plus bas)
set -f
set -- ${SSH_ORIGINAL_COMMAND:-}
set +f

DOSSIER=/opt/frontfall
SERVICE=frontfall
if [ "${1:-}" = next ]; then
  DOSSIER=/opt/frontfall-next
  SERVICE=frontfall-next
  shift
fi

if [ "${1:-}" = annonce ]; then
  MINUTES="${2:-}"
  case "$MINUTES" in
    "" | *[!0-9]*) echo "Durée d'annonce invalide." >&2; exit 2 ;;
  esac
  if [ "$#" -ne 2 ] || [ "$MINUTES" -lt 1 ] || [ "$MINUTES" -gt 60 ]; then
    echo "Durée d'annonce invalide." >&2
    exit 2
  fi
  cd "$DOSSIER"
  # Seule une requête venue du conteneur lui-même est acceptée par le jeu.
  docker compose exec -T "$SERVICE" node -e \
    "fetch('http://127.0.0.1:8080/admin/maintenance?minutes=$MINUTES',{method:'POST'}).then(r=>r.text()).then(t=>{console.log(t)})"
  exit 0
fi

TAG="${1:-}"
case "$TAG" in
  "" | *[!0-9a-f]*) echo "Étiquette d'image invalide." >&2; exit 2 ;;
esac
if [ "$#" -ne 1 ] || [ "${#TAG}" -ne 12 ]; then
  echo "Étiquette d'image invalide." >&2
  exit 2
fi

# Le réseau appartient au projet nclsmgr : il existe dès que Caddy l'a rejoint.
if ! docker network inspect frontfall > /dev/null 2>&1; then
  echo "Réseau frontfall absent : déployer d'abord nclsmgr.com." >&2
  exit 3
fi
if [ ! -f "$DOSSIER/compose.yaml" ]; then
  echo "$DOSSIER n'est pas installé : relancer installer-frontfall.sh." >&2
  exit 3
fi

cd "$DOSSIER"
printf 'IMAGE_TAG=%s\n' "$TAG" > .env
docker compose pull --quiet
# L'ancien conteneur laisse d'abord finir ses parties (jusqu'à stop_grace_period).
docker compose up -d --remove-orphans --wait --wait-timeout 120
# Garde les 10 images du jeu les plus récentes pour revenir en arrière sans téléchargement.
# Docker refuse de supprimer l'image d'un conteneur, même arrêté : celles en service restent.
# Le tri par date suffit : toutes les images sont datées dans le fuseau du serveur.
docker image ls ghcr.io/nic0lasm/frontfall --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' \
  | sort -r | tail -n +11 | cut -f2 \
  | xargs -r docker image rm > /dev/null 2>&1 || true
docker image prune -f > /dev/null
echo "Déployé : $TAG ($DOSSIER)"
