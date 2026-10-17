#!/bin/sh
# Sonde de disponibilité, toutes les cinq minutes par nclsmgr-sonde.timer. Interroge le site par
# Cloudflare, comme un visiteur, et rend compte à un service de surveillance externe (SONDE_URL,
# type healthchecks). Le service alerte par courriel si la sonde échoue ou cesse de se signaler :
# site en panne, serveur arrêté ou injoignable.
set -eu

[ -n "${SONDE_URL:-}" ] || { echo "SONDE_URL absente." >&2; exit 1; }

etat=""
for url in https://nclsmgr.com/healthz https://nclsmgr.com/fr; do
  # Trois essais espacés : une coupure de quelques secondes ne donne pas d'alerte.
  if ! curl -fsS --retry 3 --retry-delay 20 --retry-all-errors --max-time 15 \
    -A nclsmgr-sonde -o /dev/null "$url"; then
    etat=/fail
  fi
done
curl -fsS -m 10 --retry 3 -o /dev/null "$SONDE_URL$etat"
