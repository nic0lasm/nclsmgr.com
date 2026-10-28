#!/bin/sh
# Restaure les données du jeu Frontfall depuis le dernier instantané et affiche la durée.
#   sudo nclsmgr-restaurer-frontfall --essai   répétition : restaure dans un dossier temporaire, compare
#                                              les empreintes, ne touche ni au jeu ni à son volume
#   sudo nclsmgr-restaurer-frontfall           restauration : arrête le jeu, remplace le contenu de son
#                                              volume, le relance
# Sur un serveur neuf : déployer le jeu une première fois (le volume est alors créé), puis lancer la
# restauration. Les accès au dépôt de sauvegarde (/etc/nclsmgr/sauvegarde.env et restic.motdepasse)
# doivent déjà y être, voir « Restauration après perte du serveur » du README.
set -eu

essai=0
case "${1:-}" in
  --essai) essai=1 ;;
  "") ;;
  *) echo "Usage : $0 [--essai]" >&2; exit 1 ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }

if [ -z "${RESTIC_REPOSITORY:-}" ]; then
  set -a
  . /etc/nclsmgr/sauvegarde.env
  set +a
fi

DONNEES=/var/lib/docker/volumes/frontfall_donnees/_data
COMPOSE=/opt/frontfall
debut=$(date +%s)
etape() { printf '[%3ss] %s\n' "$(($(date +%s) - debut))" "$1"; }

CIBLE=$(mktemp -d)
trap 'rm -rf "$CIBLE"' EXIT
trap 'exit 1' INT HUP TERM

etape "Lecture du dernier instantané…"
restic restore latest --quiet --host nclsmgr --target "$CIBLE"
dossier=$(find "$CIBLE" -type d -name courant | head -n 1)
if [ -z "$dossier" ] || [ ! -f "$dossier/SHA256SUMS" ] || [ ! -d "$dossier/frontfall/donnees" ]; then
  echo "Instantané vide, sans empreintes ou sans données de Frontfall." >&2
  exit 1
fi
(cd "$dossier" && sha256sum --quiet --strict -c SHA256SUMS) || { echo "Empreintes différentes." >&2; exit 1; }
fichiers=$(find "$dossier/frontfall" -type f | wc -l)
etape "Instantané déchiffré et empreintes vérifiées ($fichiers fichiers du jeu)."

if [ "$essai" -eq 1 ]; then
  etape "Répétition terminée : le jeu et son volume n'ont pas été touchés."
  exit 0
fi

[ -d "$DONNEES" ] || { echo "Volume frontfall_donnees absent : déployer le jeu une première fois." >&2; exit 1; }
# Les fichiers appartiennent au compte du conteneur (node) : reprendre le propriétaire du volume.
proprio=$(stat -c %u:%g "$DONNEES")

etape "Arrêt du jeu…"
docker compose --project-directory "$COMPOSE" stop -t 30
find "$DONNEES" -mindepth 1 -delete
cp -a "$dossier/frontfall/donnees/." "$DONNEES/"
chown -R "$proprio" "$DONNEES"
if [ -d "$dossier/frontfall/etc" ] && [ -f "$dossier/frontfall/etc/comptes.env" ] && [ ! -f /etc/frontfall/comptes.env ]; then
  # Lisible par le déployeur (compte frontfall), comme l'attend le fichier Compose.
  install -d -m 755 -o root -g root /etc/frontfall
  install -m 640 -o root -g frontfall "$dossier/frontfall/etc/comptes.env" /etc/frontfall/comptes.env
fi
etape "Données remises en place, redémarrage…"
docker compose --project-directory "$COMPOSE" up -d --wait
etape "Jeu rétabli, conteneur sain."
