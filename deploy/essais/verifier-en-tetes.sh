#!/bin/sh
# Vérifie les politiques CSP servies par Caddy devant un service web factice.
# Usage : verifier-en-tetes.sh <port HTTPS local>
set -eu
port=$1
echecs=0

csp() {
	curl -sk --noproxy "*" --resolve "nclsmgr.com:$port:127.0.0.1" -o /dev/null -D - "$@" |
		tr -d '\r' | grep -i '^content-security-policy:' | sed 's/^[^:]*: //'
}

attendre() {
	nom=$1 motif=$2
	shift 2
	valeurs=$(csp "$@")
	if [ "$(printf '%s\n' "$valeurs" | grep -c .)" -ne 1 ]; then
		echo "ÉCHEC $nom : $(printf '%s\n' "$valeurs" | grep -c .) en-têtes CSP"
		echecs=$((echecs + 1))
	elif printf '%s' "$valeurs" | grep -qF -- "$motif"; then
		echo "ok $nom"
	else
		echo "ÉCHEC $nom : $valeurs"
		echecs=$((echecs + 1))
	fi
}

u="https://nclsmgr.com:$port"
attendre "page : politique de l'application" "'nonce-essai'" "$u/fr/cv"
attendre "prefetch navigateur : repli" "script-src 'none'" -H "Purpose: prefetch" "$u/fr/cv"
attendre "prefetch Next.js : repli" "script-src 'none'" -H "Next-Router-Prefetch: 1" "$u/fr/cv"
attendre "documents réservés : politique fermée" "sandbox allow-downloads" "$u/fr/espace/documents/essai"
attendre "documents réservés en prefetch" "sandbox allow-downloads" -H "Purpose: prefetch" "$u/en/espace/documents/essai"

[ "$echecs" -eq 0 ]
