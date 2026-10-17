#!/bin/sh
# Test de restauration, mensuel par nclsmgr-verif-restauration.timer ou à la main :
#   sudo nclsmgr-verif-restauration
# Restaure le dernier instantané dans un dossier temporaire, compare chaque fichier à l'empreinte
# prise au moment de la sauvegarde, contrôle la base, puis relit 10 % des données distantes.
set -eu

if [ -z "${RESTIC_REPOSITORY:-}" ]; then
  set -a
  . /etc/nclsmgr/sauvegarde.env
  set +a
fi

signaler() {
  [ -n "${SIGNAL_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$SIGNAL_URL$1" || true
}

CIBLE=$(mktemp -d)
# Un échec rend la sonde des sauvegardes rouge jusqu'à la prochaine sauvegarde réussie.
trap 'statut=$?; rm -rf "$CIBLE"; [ "$statut" -eq 0 ] || signaler /fail' EXIT
# Une interruption efface aussi la copie déchiffrée.
trap 'exit 1' INT HUP TERM

restic restore latest --quiet --host nclsmgr --target "$CIBLE"
dossier=$(find "$CIBLE" -type d -name courant | head -n 1)
if [ -z "$dossier" ] || [ ! -f "$dossier/SHA256SUMS" ]; then
  echo "Instantané vide ou sans empreintes." >&2
  exit 1
fi
[ -f "$dossier/etc/certs/origin.pem" ] || { echo "Certificat absent de l'instantané." >&2; exit 1; }

(cd "$dossier" && sha256sum --quiet --strict -c SHA256SUMS) || { echo "Empreintes différentes." >&2; exit 1; }
if [ -f "$dossier/espace.db" ]; then
  [ "$(sqlite3 "$dossier/espace.db" 'PRAGMA integrity_check')" = ok ]
fi
if [ -f "$dossier/umami.dump" ]; then
  [ "$(head -c 5 "$dossier/umami.dump")" = PGDMP ]
fi
restic check --quiet --read-data-subset=10%

instantane=$(restic snapshots --host nclsmgr --latest 1 --compact | sed -n 3p)
echo "Restauration vérifiée : $(wc -l < "$dossier/SHA256SUMS") fichiers identiques, instantané $instantane"
