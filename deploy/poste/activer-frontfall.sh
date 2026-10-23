#!/bin/sh
# Active le déploiement automatique du jeu Frontfall, depuis le poste d'administration.
# Demande ssh (accès debian@<serveur> déjà connu) et gh (connecté au compte propriétaire des dépôts).
#   sh activer-frontfall.sh <adresse du serveur> [<compte d'administration>]
# Crée une clé dédiée, installe le compte de déploiement sur le serveur depuis la dernière version
# de main, puis renseigne l'environnement production du dépôt du jeu. La clé privée ne reste pas
# sur le poste : elle ne vit plus que dans les secrets GitHub.
set -eu

HOTE="${1:-}"
ADMIN="${2:-debian}"
DEPOT_SITE=nic0lasm/nclsmgr.com
DEPOT_JEU=nic0lasm/frontfall

[ -n "$HOTE" ] || { echo "Usage : sh $0 <adresse du serveur> [<compte d'administration>]" >&2; exit 1; }
command -v gh > /dev/null || { echo "gh est requis : https://cli.github.com" >&2; exit 1; }
gh auth status > /dev/null 2>&1 || { echo "gh n'est pas connecté : gh auth login" >&2; exit 1; }

# Empreinte du serveur telle que le poste la connaît déjà : rien n'est accepté à l'aveugle.
CONNUS=$(ssh-keygen -F "$HOTE" 2> /dev/null | grep -v '^#' || true)
[ -n "$CONNUS" ] || { echo "Aucune empreinte connue pour $HOTE : se connecter une fois en SSH." >&2; exit 1; }

COMMIT=$(gh api "repos/$DEPOT_SITE/commits/main" --jq .sha)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
ssh-keygen -q -t ed25519 -N "" -C deploiement-frontfall -f "$TMP/cle"
CLE_PUBLIQUE=$(cat "$TMP/cle.pub")

echo "Installation sur le serveur (main à ${COMMIT%"${COMMIT#????????????}"})..."
ssh -t "$ADMIN@$HOTE" "set -e; d=\$(mktemp -d); curl -fsSL https://codeload.github.com/$DEPOT_SITE/tar.gz/$COMMIT | tar -xz -C \$d --strip-components=1; sudo sh \$d/deploy/serveur/installer-frontfall.sh '$CLE_PUBLIQUE'; rm -rf \$d"

echo "Environnement production de $DEPOT_JEU..."
gh api -X PUT "repos/$DEPOT_JEU/environments/production" > /dev/null
gh secret set DEPLOY_SSH_KEY --repo "$DEPOT_JEU" --env production < "$TMP/cle"
printf '%s' "$HOTE" | gh secret set DEPLOY_HOST --repo "$DEPOT_JEU" --env production
printf '%s\n' "$CONNUS" | gh secret set DEPLOY_KNOWN_HOSTS --repo "$DEPOT_JEU" --env production
gh variable set DEPLOIEMENT_ACTIF --repo "$DEPOT_JEU" --body true

echo "Déploiement du jeu activé. Reste, après la première publication de l'image :"
echo "  https://github.com/users/nic0lasm/packages/container/frontfall/settings > Change visibility > Public"
