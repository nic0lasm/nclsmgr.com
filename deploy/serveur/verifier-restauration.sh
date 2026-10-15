#!/bin/sh
# Test de restauration mensuel, lancé par nclsmgr-verif-restauration.timer : restaure le dernier
# instantané dans un dossier temporaire, contrôle la base, puis relit 10 % des données distantes.
set -eu

CIBLE=$(mktemp -d)
trap 'rm -rf "$CIBLE"' EXIT

restic restore latest --quiet --host nclsmgr --target "$CIBLE"
dossier=$(find "$CIBLE" -type d -name courant | head -n 1)
[ -n "$dossier" ] || { echo "Instantané vide." >&2; exit 1; }
[ -f "$dossier/certs/origin.pem" ] || { echo "Certificat absent de l'instantané." >&2; exit 1; }
if [ -f "$dossier/espace.db" ]; then
  [ "$(sqlite3 "$dossier/espace.db" 'PRAGMA integrity_check')" = ok ]
fi
restic check --quiet --read-data-subset=10%
echo "Restauration vérifiée : $(restic snapshots --host nclsmgr --latest 1 --compact | sed -n 3p)"
