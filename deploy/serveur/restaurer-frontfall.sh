#!/bin/sh
# Restaure les données du jeu Frontfall depuis le dernier instantané et affiche la durée de chaque étape.
#   sudo nclsmgr-restaurer-frontfall --essai       répétition : restaure dans un dossier temporaire,
#                                                  compare les empreintes, ne touche ni au jeu ni à son volume
#   sudo nclsmgr-restaurer-frontfall --confirmer   restauration réelle : arrête le jeu (les parties en
#                                                  cours sont coupées), remplace le contenu de son volume, le relance
# Sur un serveur neuf : déployer le jeu une première fois (le volume est alors créé), puis restaurer.
# Les accès au dépôt de sauvegarde (/etc/nclsmgr/sauvegarde.env et restic.motdepasse) doivent déjà y
# être, voir « Restauration après perte du serveur » du README.
set -eu

mode=""
case "${1:-}" in
  --essai) mode=essai ;;
  --confirmer) mode=reel ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 1
    ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }

if [ -z "${RESTIC_REPOSITORY:-}" ]; then
  set -a
  . /etc/nclsmgr/sauvegarde.env
  set +a
fi

DONNEES=/var/lib/docker/volumes/frontfall_donnees/_data
AVANT="$DONNEES.avant-restauration"
COMPOSE=/opt/frontfall
debut=$(date +%s)
etape() { printf '[%3ss] %s\n' "$(($(date +%s) - debut))" "$1"; }

# /var/tmp : la copie déchiffrée tient sur le disque, pas dans la mémoire de /tmp.
CIBLE=$(mktemp -d /var/tmp/restauration-frontfall.XXXXXX)
trap 'rm -rf "$CIBLE"' EXIT
trap 'exit 1' INT HUP TERM

etape "Lecture du dernier instantané…"
# Seulement le jeu et les empreintes : ni la base du site ni l'export Umami ne sont déchiffrés ici.
restic restore latest --quiet --host nclsmgr --target "$CIBLE" \
  --include '*/courant/SHA256SUMS' --include '*/courant/frontfall'
dossier=$(find "$CIBLE" -type d -name courant | head -n 1)
if [ -z "$dossier" ] || [ ! -f "$dossier/SHA256SUMS" ] || [ ! -d "$dossier/frontfall/donnees" ]; then
  echo "Instantané vide, sans empreintes ou sans données de Frontfall." >&2
  exit 1
fi
# Seules les empreintes des fichiers du jeu sont restaurées ici : on ne contrôle que celles-là.
(cd "$dossier" && grep ' \./frontfall/' SHA256SUMS | sha256sum --quiet --strict -c -) \
  || { echo "Empreintes différentes." >&2; exit 1; }
fichiers=$(find "$dossier/frontfall" -type f | wc -l)
etape "Instantané déchiffré et empreintes vérifiées ($fichiers fichiers du jeu)."

if [ "$mode" = essai ]; then
  etape "Répétition terminée : le jeu et son volume n'ont pas été touchés."
  exit 0
fi

# Tout ce qui peut échouer l'est avant l'arrêt du jeu.
[ -d "$DONNEES" ] || { echo "Volume frontfall_donnees absent : déployer le jeu une première fois." >&2; exit 1; }
[ ! -e "$AVANT" ] || { echo "$AVANT existe déjà : le vérifier puis le supprimer." >&2; exit 1; }
getent group frontfall > /dev/null || { echo "Groupe frontfall absent : lancer installer-frontfall.sh." >&2; exit 1; }
proprio=$(stat -c %u:%g "$DONNEES")

etape "Arrêt du jeu…"
docker compose --project-directory "$COMPOSE" stop -t 30
# L'ancien contenu est mis de côté, pas effacé : il revient si la copie échoue.
mv "$DONNEES" "$AVANT"
restaurer() {
  install -d -m 701 "$DONNEES"
  cp -a "$dossier/frontfall/donnees/." "$DONNEES/"
  chown -R "$proprio" "$DONNEES"
  if [ -f "$dossier/frontfall/etc/comptes.env" ] && [ ! -f /etc/frontfall/comptes.env ]; then
    install -d -m 755 -o root -g root /etc/frontfall
    # Lisible par le déployeur (compte frontfall), comme l'attend le fichier Compose.
    install -m 640 -o root -g frontfall "$dossier/frontfall/etc/comptes.env" /etc/frontfall/comptes.env
  fi
}
if ! restaurer; then
  rm -rf "$DONNEES"
  mv "$AVANT" "$DONNEES"
  docker compose --project-directory "$COMPOSE" up -d --wait || true
  echo "Copie échouée : ancien contenu remis en place, jeu relancé." >&2
  exit 2
fi
etape "Données remises en place, redémarrage…"
if ! docker compose --project-directory "$COMPOSE" up -d --wait; then
  echo "Le jeu ne devient pas sain avec les données restaurées. L'ancien contenu est dans $AVANT ;" >&2
  echo "voir « docker compose --project-directory $COMPOSE logs »." >&2
  exit 3
fi
rm -rf "$AVANT"
etape "Jeu rétabli, conteneur sain."
