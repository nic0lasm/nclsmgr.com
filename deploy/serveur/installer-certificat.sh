#!/bin/sh
# Certificat d'origine Cloudflare, présenté par Caddy derrière le proxy en mode Full (strict).
# La clé privée est créée sur le serveur et n'en sort jamais : seule la demande passe par Cloudflare.
#   sudo sh installer-certificat.sh demande     crée la clé et affiche la demande (CSR) à signer
#   sudo sh installer-certificat.sh installer   lit le certificat PEM signé sur l'entrée standard
# L'installation vérifie l'émetteur, les noms et la correspondance avec la clé, garde l'ancien
# certificat en .precedent et revient en arrière si Caddy ne répond plus.
set -eu

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
D=/etc/nclsmgr/certs
umask 077

empreinte_cle() { openssl pkey -in "$1" -pubout -outform DER | sha256sum | cut -d' ' -f1; }
empreinte_cert() { openssl x509 -in "$1" -noout -pubkey | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1; }

redemarrer_caddy() {
  (cd /opt/nclsmgr && docker compose restart caddy > /dev/null)
  for _ in $(seq 1 15); do
    curl -fsk --noproxy '*' --resolve nclsmgr.com:443:127.0.0.1 -o /dev/null https://nclsmgr.com/healthz && return 0
    sleep 2
  done
  return 1
}

case "${1:-}" in
  demande)
    openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -subj "/CN=nclsmgr.com" \
      -keyout "$D/origin-key.new" 2> /dev/null
    chmod 600 "$D/origin-key.new"
    echo "Demande ci-dessus à coller dans Cloudflare, clé gardée sur le serveur." >&2
    ;;

  installer)
    [ -f "$D/origin-key.new" ] || { echo "Aucune clé en attente : lancer d'abord « demande »." >&2; exit 1; }
    echo "Coller le certificat PEM, puis Entrée et Ctrl-D :" >&2
    cat > "$D/origin.new.pem"
    openssl x509 -in "$D/origin.new.pem" -noout 2> /dev/null || { echo "Certificat illisible." >&2; exit 1; }
    openssl x509 -in "$D/origin.new.pem" -noout -issuer | grep -q "CloudFlare Origin" \
      || { echo "Émetteur inattendu : ce n'est pas un certificat d'origine Cloudflare." >&2; exit 1; }
    noms=$(openssl x509 -in "$D/origin.new.pem" -noout -ext subjectAltName)
    for nom in nclsmgr.com www.nclsmgr.com; do
      printf '%s' "$noms" | grep -q "DNS:$nom\(,\|$\)" || { echo "Nom absent du certificat : $nom" >&2; exit 1; }
    done
    [ "$(empreinte_cle "$D/origin-key.new")" = "$(empreinte_cert "$D/origin.new.pem")" ] \
      || { echo "Le certificat ne correspond pas à la clé en attente." >&2; exit 1; }

    cp -p "$D/origin.pem" "$D/origin.precedent.pem"
    cp -p "$D/origin-key.pem" "$D/origin-key.precedent.pem"
    chmod 644 "$D/origin.new.pem"
    mv "$D/origin.new.pem" "$D/origin.pem"
    mv "$D/origin-key.new" "$D/origin-key.pem"

    if ! redemarrer_caddy; then
      # La nouvelle clé reste en attente pour un nouvel essai.
      mv "$D/origin-key.pem" "$D/origin-key.new"
      mv "$D/origin.precedent.pem" "$D/origin.pem"
      mv "$D/origin-key.precedent.pem" "$D/origin-key.pem"
      redemarrer_caddy || true
      echo "Caddy ne répondait plus : ancien certificat remis en place." >&2
      exit 1
    fi
    echo | openssl s_client -connect 127.0.0.1:443 -servername nclsmgr.com 2> /dev/null \
      | openssl x509 -noout -issuer -enddate
    echo "Certificat d'origine installé. Repasser Cloudflare en Full (strict)."
    ;;

  *)
    echo "Usage : sudo sh $0 demande|installer" >&2
    exit 1
    ;;
esac
