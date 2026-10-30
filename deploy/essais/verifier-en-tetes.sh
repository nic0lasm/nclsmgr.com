#!/bin/sh
# Vérifie les politiques CSP servies par Caddy devant un service web factice, et les en-têtes de
# requête qu'il retire ou réécrit avant l'application.
# Usage : verifier-en-tetes.sh <port HTTPS local> [<port d'une instance qui tient l'essai pour Cloudflare>]
set -eu
port=$1
port_cf=${2:-}
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

# En-têtes reçus par le service factice pour une requête qui tente de les imposer.
recus() {
	curl -sSk --noproxy "*" --resolve "nclsmgr.com:$1:127.0.0.1" \
		-H "X-Middleware-Subrequest: middleware" \
		-H "CF-IPCountry: FR" \
		-H "CF-Connecting-IP: 203.0.113.7" \
		-H "X-Client-IP: 198.51.100.9" \
		-H "X-Forwarded-For: 198.51.100.9" \
		-H "X-Nonce: essai" \
		-H "Content-Security-Policy: script-src 'nonce-essai'" \
		-H "Content-Security-Policy-Report-Only: script-src 'nonce-essai'" \
		"https://nclsmgr.com:$1/essai/en-tetes" || echo "requête impossible"
}

# contient <nom> <corps> <motif attendu> [<motif interdit>...]
contient() {
	nom=$1 corps=$2 motif=$3
	shift 3
	for interdit in "$@"; do
		case "$corps" in *"$interdit"*)
			echo "ÉCHEC $nom : $corps"
			echecs=$((echecs + 1))
			return
			;;
		esac
	done
	case "$corps" in
		*"$motif"*) echo "ok $nom" ;;
		*)
			echo "ÉCHEC $nom : $corps"
			echecs=$((echecs + 1))
			;;
	esac
}

u="https://nclsmgr.com:$port"
attendre "page : politique de l'application" "'nonce-essai'" "$u/fr/cv"
attendre "prefetch navigateur : repli" "script-src 'none'" -H "Purpose: prefetch" "$u/fr/cv"
attendre "prefetch Next.js : repli" "script-src 'none'" -H "Next-Router-Prefetch: 1" "$u/fr/cv"
attendre "documents réservés : politique fermée" "sandbox allow-downloads" "$u/fr/espace/documents/essai"
attendre "documents réservés en prefetch" "sandbox allow-downloads" -H "Purpose: prefetch" "$u/en/espace/documents/essai"

attendre "jeu : politique du jeu" "connect-src 'self' wss://nclsmgr.com" "$u/frontfall/"
attendre "jeu en prefetch : politique du jeu" "connect-src 'self' wss://nclsmgr.com" -H "Purpose: prefetch" "$u/frontfall/"
attendre "jeu : script d'audience Cloudflare admis" "script-src 'self' https://static.cloudflareinsights.com;" "$u/frontfall/"
attendre "jeu : envoi d'audience Cloudflare admis" "https://cloudflareinsights.com;" "$u/frontfall/"
attendre "préproduction : script d'audience Cloudflare admis" "script-src 'self' https://static.cloudflareinsights.com;" "$u/frontfall-next/"

# Jeu : préfixe retiré avant le service, cache selon le chemin, adresse sans barre redirigée.
jeu() {
	curl -sk --noproxy "*" --resolve "nclsmgr.com:$port:127.0.0.1" "$@"
}
contient "jeu : préfixe retiré" "$(jeu "$u/frontfall/assets/index-abc.js")" "frontfall /assets/index-abc.js"
contient "jeu : ressources immuables" "$(jeu -o /dev/null -D - "$u/frontfall/assets/index-abc.js" | tr -d '\r' | grep -i '^cache-control:')" "immutable"
contient "jeu : page revalidée" "$(jeu -o /dev/null -D - "$u/frontfall/" | tr -d '\r' | grep -i '^cache-control:')" "no-cache" "immutable"
contient "jeu : /frontfall redirigé" "$(jeu -o /dev/null -w '%{http_code} %{redirect_url}' "$u/frontfall")" "301 https://nclsmgr.com:$port/frontfall/"
contient "jeu : métriques fermées" "$(jeu -o /dev/null -w '%{http_code}' "$u/frontfall/metrics") $(jeu -o /dev/null -w '%{http_code}' "$u/frontfall/metrics/x")" "404 404"
contient "jeu : administration fermée" "$(jeu -o /dev/null -w '%{http_code}' "$u/frontfall/admin/maintenance")" "404"
contient "site : chemin voisin hors du jeu" "$(jeu "$u/frontfallx")" "ok" "frontfall /"

# Préproduction : son propre conteneur, mêmes règles.
attendre "préproduction : politique du jeu" "connect-src 'self' wss://nclsmgr.com" "$u/frontfall-next/"
contient "préproduction : préfixe retiré, bon conteneur" "$(jeu "$u/frontfall-next/assets/index-abc.js")" "frontfall-next /assets/index-abc.js"
contient "préproduction : ressources immuables" "$(jeu -o /dev/null -D - "$u/frontfall-next/assets/index-abc.js" | tr -d '\r' | grep -i '^cache-control:')" "immutable"
contient "préproduction : non indexée" "$(jeu -o /dev/null -D - "$u/frontfall-next/" | tr -d '\r' | grep -i '^x-robots-tag:')" "noindex"
contient "préproduction : /frontfall-next redirigé" "$(jeu -o /dev/null -w '%{http_code} %{redirect_url}' "$u/frontfall-next")" "301 https://nclsmgr.com:$port/frontfall-next/"
contient "préproduction : métriques et administration fermées" "$(jeu -o /dev/null -w '%{http_code}' "$u/frontfall-next/metrics") $(jeu -o /dev/null -w '%{http_code}' "$u/frontfall-next/admin/maintenance")" "404 404"
contient "jeu : la production ne sert pas la préproduction" "$(jeu "$u/frontfall/assets/index-abc.js")" "frontfall /assets/index-abc.js" "frontfall-next"

# Rien ne nomme le serveur dans la réponse.
reponse=$(curl -sk --noproxy "*" --resolve "nclsmgr.com:$port:127.0.0.1" -o /dev/null -D - "$u/fr/cv" | tr -d '\r')
if printf '%s\n' "$reponse" | grep -qiE '^(server|via):'; then
	echo "ÉCHEC réponse anonyme : $(printf '%s\n' "$reponse" | grep -iE '^(server|via):' | tr '\n' ' ')"
	echecs=$((echecs + 1))
else
	echo "ok réponse sans Server ni Via"
fi

# Hors Cloudflare : rien de ce que le client envoie ne passe, l'IP est celle de la connexion.
corps=$(recus "$port")
contient "X-Middleware-Subrequest retiré" "$corps" "subrequest=|"
contient "CF-IPCountry retiré hors Cloudflare" "$corps" "|pays=|"
contient "X-Client-IP réécrit avec l'IP de la connexion" "$corps" "|ip=" "|ip=|" "203.0.113.7" "198.51.100.9"
contient "X-Nonce retiré" "$corps" "|nonce=|"
contient "politiques de requête retirées" "$corps" "|csp=|csp-ro=" "nonce-essai"

# Depuis une plage de confiance : IP et pays viennent des en-têtes de Cloudflare.
if [ -n "$port_cf" ]; then
	corps=$(recus "$port_cf")
	contient "X-Client-IP tiré de CF-Connecting-IP" "$corps" "|ip=203.0.113.7|"
	contient "CF-IPCountry conservé depuis Cloudflare" "$corps" "|pays=FR|"
	contient "X-Middleware-Subrequest retiré depuis Cloudflare" "$corps" "subrequest=|"
	contient "X-Nonce retiré depuis Cloudflare" "$corps" "|nonce=|"
	contient "politiques de requête retirées depuis Cloudflare" "$corps" "|csp=|csp-ro=" "nonce-essai"
fi

[ "$echecs" -eq 0 ]
