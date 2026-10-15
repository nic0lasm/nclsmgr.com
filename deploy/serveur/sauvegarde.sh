#!/bin/sh
# Sauvegarde quotidienne chiffrée hors site, lancée par nclsmgr-sauvegarde.timer.
# restic chiffre côté serveur avant l'envoi : le stockage distant ne voit que des blocs chiffrés.
# Variables (EnvironmentFile /etc/nclsmgr/sauvegarde.env) : RESTIC_REPOSITORY, RESTIC_PASSWORD_FILE,
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, et SIGNAL_URL (facultative, sonde de type healthchecks).
set -eu

VOLUMES=/var/lib/docker/volumes
COURANT="${STATE_DIRECTORY:-/var/lib/nclsmgr-sauvegarde}/courant"

signaler() {
  [ -n "${SIGNAL_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$SIGNAL_URL$1" || true
}
trap 'statut=$?; [ "$statut" -eq 0 ] || signaler /fail' EXIT
signaler /start

rm -rf "$COURANT"
install -d -m 700 "$COURANT" "$COURANT/prive" "$COURANT/certs"

# Copie cohérente de la base, même pendant une écriture (API de sauvegarde SQLite).
base="$VOLUMES/nclsmgr_base/_data/espace.db"
if [ -f "$base" ]; then
  sqlite3 "$base" ".backup '$COURANT/espace.db'"
  [ "$(sqlite3 "$COURANT/espace.db" 'PRAGMA integrity_check')" = ok ]
fi
if [ -d "$VOLUMES/nclsmgr_prive/_data" ]; then
  cp -a "$VOLUMES/nclsmgr_prive/_data/." "$COURANT/prive/"
fi
cp -a /etc/nclsmgr/certs/. "$COURANT/certs/"

restic backup --quiet --host nclsmgr --tag quotidien "$COURANT"
# Pas plus de trois mois d'historique : la durée de conservation annoncée pour le journal.
restic forget --quiet --host nclsmgr --keep-daily 7 --keep-weekly 4 --keep-monthly 2 --prune

rm -rf "$COURANT"
signaler ""
