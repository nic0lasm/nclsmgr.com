#!/bin/sh
# Remet sur un serveur neuf l'état du site et de ses services à partir du dernier instantané restic.
#   sudo sh restaurer-serveur.sh config      secrets, certificat d'origine et version déployée
#                                              (/etc/nclsmgr, /opt/nclsmgr) ; à faire avant le premier démarrage
#   sudo sh restaurer-serveur.sh donnees --confirmer
#                                            base du site, documents, Caddy, Umami (arrête puis relance le
#                                              site) ; sans --confirmer, affiche l'instantané et s'arrête
# Les données de Frontfall se restaurent à part : restaurer-frontfall.sh.
# Prérequis : durcir-serveur.sh, puis /etc/nclsmgr/sauvegarde.env et restic.motdepasse (copiés de
# l'ancien serveur). Ne lancer installer-sauvegarde.sh qu'APRÈS : il fait une première sauvegarde qui
# deviendrait « latest ». « donnees » remplace le contenu des volumes.
set -eu

mode="${1:-}"
case "$mode" in config | donnees) ;; *) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 1 ;; esac
[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
id deploy > /dev/null 2>&1 || { echo "Compte deploy absent : lancer installer-deploiement.sh d'abord." >&2; exit 1; }

if [ -z "${RESTIC_REPOSITORY:-}" ]; then
  set -a
  . /etc/nclsmgr/sauvegarde.env
  set +a
fi

if [ "$mode" = donnees ] && [ "${2:-}" != --confirmer ]; then
  restic snapshots --host nclsmgr --latest 1 --compact
  echo "Ces données remplaceront la base du site, les documents, Caddy et Umami de ce serveur." >&2
  echo "Relancer avec --confirmer pour continuer." >&2
  exit 1
fi

# /tmp (en mémoire) : la copie déchiffrée contient la clé d'origine et les secrets.
CIBLE=$(mktemp -d)
trap 'rm -rf "$CIBLE"' EXIT
trap 'exit 1' INT HUP TERM
echo "Lecture du dernier instantané…"
# Les données du jeu (comptes) restent chiffrées : restaurer-frontfall.sh s'en charge.
restic restore latest --quiet --host nclsmgr --target "$CIBLE" --exclude '*/courant/frontfall'
dossier=$(find "$CIBLE" -type d -name courant | head -n 1)
[ -n "$dossier" ] && [ -f "$dossier/SHA256SUMS" ] || { echo "Instantané vide ou sans empreintes." >&2; exit 1; }
(cd "$dossier" && grep -v ' \./frontfall/' SHA256SUMS | sha256sum --quiet --strict -c -) \
  || { echo "Empreintes différentes." >&2; exit 1; }
echo "Instantané déchiffré, empreintes vérifiées."

VOLUMES=/var/lib/docker/volumes
COMPOSE=/opt/nclsmgr
# Copie élément par élément : « cp -a source/. cible/ » donnerait à la cible le mode 700 du dossier
# de l'instantané, et /etc/nclsmgr en 700 bloque le déploiement. Avec « + », un échec de cp arrête
# le script.
copier_contenu() { find "$1" -mindepth 1 -maxdepth 1 -exec cp -a -t "$2" {} + ; }
vider_et_copier() { # source, volume : remplace le contenu du volume par celui de la source
  [ -d "$1" ] || { echo "ATTENTION : $2 absent de l'instantané, volume laissé tel quel." >&2; return 0; }
  [ -d "$VOLUMES/$2/_data" ] || { echo "Volume $2 absent : site laissé arrêté." >&2; exit 1; }
  proprio=$(stat -c %u:%g "$VOLUMES/$2/_data")
  find "$VOLUMES/$2/_data" -mindepth 1 -delete
  copier_contenu "$1" "$VOLUMES/$2/_data"
  chown -R "$proprio" "$VOLUMES/$2/_data"
}

if [ "$mode" = config ]; then
  # /etc/nclsmgr : on ne remplace jamais sauvegarde.env ni restic.motdepasse (absents de l'instantané).
  install -d -m 755 -o root -g root /etc/nclsmgr
  copier_contenu "$dossier/etc" /etc/nclsmgr
  # Fichiers lus par Compose au nom du compte deploy (voir installer-statistiques.sh) : root:deploy, 640.
  for f in umami.env umami-db.env statistiques.env; do
    [ ! -f "/etc/nclsmgr/$f" ] || { chown root:deploy "/etc/nclsmgr/$f"; chmod 640 "/etc/nclsmgr/$f"; }
  done
  # Version déployée : le compte deploy la relit et l'écrase à chaque publication.
  install -d -m 750 -o deploy -g deploy "$COMPOSE"
  copier_contenu "$dossier/opt" "$COMPOSE"
  chown -R deploy:deploy "$COMPOSE"
  stat -c '%a %U:%G %n' /etc/nclsmgr "$COMPOSE"
  echo "Configuration restaurée. Suite : démarrer le site (docker compose up -d dans $COMPOSE, en tant que deploy)."
  exit 0
fi

# donnees : tout ce qui peut échouer l'est avant l'arrêt du site.
if [ -f "$dossier/espace.db" ]; then
  [ -d "$VOLUMES/nclsmgr_base/_data" ] || { echo "Volume nclsmgr_base absent : démarrer une fois le site." >&2; exit 1; }
  [ "$(sqlite3 "$dossier/espace.db" 'PRAGMA integrity_check')" = ok ] \
    || { echo "Base du site de l'instantané corrompue : rien n'a été touché." >&2; exit 1; }
else
  echo "ATTENTION : pas de base du site dans l'instantané, la base actuelle est gardée." >&2
fi
[ -f "$dossier/umami.dump" ] || [ ! -f /etc/nclsmgr/umami-db.env ] \
  || echo "ATTENTION : pas d'export Umami dans l'instantané, les statistiques actuelles sont gardées." >&2

cd "$COMPOSE"
profils=""
[ -f /etc/nclsmgr/smtp.json ] && profils="courrier"
[ -f /etc/nclsmgr/umami.env ] && profils="${profils:+$profils,}statistiques"
export COMPOSE_PROFILES="$profils"
# Sans -t : chaque service garde son délai d'arrêt (75 s pour un envoi de courrier en cours).
docker compose stop
vider_et_copier "$dossier/prive" nclsmgr_prive
vider_et_copier "$dossier/caddy" nclsmgr_caddy_data
if [ -f "$dossier/espace.db" ]; then
  proprio=$(stat -c %u:%g "$VOLUMES/nclsmgr_base/_data")
  find "$VOLUMES/nclsmgr_base/_data" -mindepth 1 -delete
  cp -a "$dossier/espace.db" "$VOLUMES/nclsmgr_base/_data/espace.db"
  chown -R "$proprio" "$VOLUMES/nclsmgr_base/_data"
fi
if [ -f "$dossier/umami.dump" ]; then
  docker compose up -d --wait umami-db
  docker compose exec -T umami-db pg_restore -U umami -d umami --clean --if-exists --no-owner < "$dossier/umami.dump" \
    || echo "pg_restore a signalé des avertissements (souvent bénins sur un schéma vide)." >&2
  # Le site est relancé quoi qu'il arrive, mais une base vide doit se voir.
  compte=$(docker compose exec -T umami-db psql -U umami -d umami -tAc \
    "SELECT (SELECT count(*) FROM website) || ' site(s), ' || (SELECT count(*) FROM website_event) || ' événement(s)'") \
    || compte=""
  case "$compte" in
    "" | "0 site(s)"*) echo "ATTENTION : base Umami restaurée vide ou illisible, les statistiques repartent de zéro." >&2 ;;
    *) echo "Umami : $compte dans la base restaurée." ;;
  esac
fi
docker compose up -d --wait --wait-timeout 180
echo "Données du site restaurées et services relancés."
