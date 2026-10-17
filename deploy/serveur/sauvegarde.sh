#!/bin/sh
# Sauvegarde quotidienne chiffrée hors site, lancée par nclsmgr-sauvegarde.timer.
# restic chiffre côté serveur avant l'envoi : le stockage distant ne voit que des blocs chiffrés.
# Variables (EnvironmentFile /etc/nclsmgr/sauvegarde.env, écrit par installer-sauvegarde.sh) :
# RESTIC_REPOSITORY, RESTIC_PASSWORD_FILE, RESTIC_CACHE_DIR, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
# AWS_DEFAULT_REGION=auto (R2) et SIGNAL_URL (sonde de type healthchecks).
set -eu

VOLUMES=/var/lib/docker/volumes
COURANT="${STATE_DIRECTORY:-/var/lib/nclsmgr-sauvegarde}/courant"

signaler() {
  [ -n "${SIGNAL_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$SIGNAL_URL$1" || true
}
trap 'statut=$?; [ "$statut" -eq 0 ] || signaler /fail' EXIT
trap 'exit 1' INT HUP TERM
signaler /start

rm -rf "$COURANT"
install -d -m 700 "$COURANT" "$COURANT/etc" "$COURANT/opt" "$COURANT/prive" "$COURANT/caddy"

# Secrets et réglages du serveur, sauf les accès au dépôt de sauvegarde : ils seraient inutilisables
# en cas de perte du serveur, et sont conservés à part par l'administrateur.
copier() { [ ! -d "$1" ] || cp -a "$1/." "$2/"; }
copier /etc/nclsmgr "$COURANT/etc"
rm -f "$COURANT/etc/sauvegarde.env" "$COURANT/etc/restic.motdepasse"
# Version déployée : compose.yaml, Caddyfile, plages Cloudflare et étiquette de l'image.
copier /opt/nclsmgr "$COURANT/opt"

# Copie cohérente de la base, même pendant une écriture (API de sauvegarde SQLite).
base="$VOLUMES/nclsmgr_base/_data/espace.db"
if [ -f "$base" ]; then
  sqlite3 "$base" ".backup '$COURANT/espace.db'"
  [ "$(sqlite3 "$COURANT/espace.db" 'PRAGMA integrity_check')" = ok ]
fi
copier "$VOLUMES/nclsmgr_prive/_data" "$COURANT/prive"
copier "$VOLUMES/nclsmgr_caddy_data/_data" "$COURANT/caddy"

# Mesure d'audience : export cohérent de PostgreSQL, à chaud. Service installé mais arrêté : échec,
# pour ne pas laisser la rétention effacer les derniers exports sans alerte.
if [ -f /etc/nclsmgr/umami-db.env ]; then
  umami=$(docker ps -q -f label=com.docker.compose.project=nclsmgr -f label=com.docker.compose.service=umami-db)
  [ -n "$umami" ] || { echo "Base Umami arrêtée : export impossible." >&2; exit 1; }
  docker exec "$umami" pg_dump -U umami -d umami --format=custom > "$COURANT/umami.dump"
  [ "$(head -c 5 "$COURANT/umami.dump")" = PGDMP ]
fi

# Empreintes de chaque fichier, recontrôlées par le test de restauration.
(cd "$COURANT" && find . -type f ! -path ./SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > "$COURANT/SHA256SUMS")

restic backup --quiet --host nclsmgr --tag quotidien "$COURANT"
# Pas plus de trois mois d'historique : la durée de conservation annoncée pour le journal.
restic forget --quiet --host nclsmgr --keep-daily 7 --keep-weekly 4 --keep-monthly 2 --prune

echo "Sauvegarde envoyée : $(wc -l < "$COURANT/SHA256SUMS") fichiers, $(du -sh "$COURANT" | cut -f1)."
rm -rf "$COURANT"
signaler ""
