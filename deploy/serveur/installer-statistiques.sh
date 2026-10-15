#!/bin/sh
# Active la mesure d'audience Umami. À lancer une fois, en root, après un déploiement qui contient
# le service umami :
#   sudo sh installer-statistiques.sh
# Génère les secrets, démarre Umami, crée le site, remplace le mot de passe administrateur par
# celui saisi (sans écho), puis active le script de mesure sur le site. Idempotent.
set -eu

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
cd "$(dirname "$0")"
E=/etc/nclsmgr
TABLEAU=http://127.0.0.1:3001

# Déployeur à jour : il active le profil statistiques et recharge Caddy si besoin.
install -m 755 -o root -g root deployer.sh /usr/local/sbin/nclsmgr-deployer

cd /opt/nclsmgr
if ! docker compose config --services 2> /dev/null | grep -qx umami; then
  echo "Le service umami n'est pas encore déployé : relancer la publication, puis ce script." >&2
  exit 1
fi

umask 077
# Fichiers lus par Compose au nom du compte deploy : root:deploy, 640.
proteger() { chown root:deploy "$1"; chmod 640 "$1"; }
if [ ! -f "$E/umami-db.env" ]; then
  mdp=$(openssl rand -hex 24)
  printf 'POSTGRES_USER=umami\nPOSTGRES_DB=umami\nPOSTGRES_PASSWORD=%s\n' "$mdp" > "$E/umami-db.env"
  printf 'DATABASE_URL=postgresql://umami:%s@umami-db:5432/umami\nAPP_SECRET=%s\nTWO_FACTOR_ENCRYPTION_KEY=%s\n' \
    "$mdp" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > "$E/umami.env"
fi
proteger "$E/umami-db.env"
proteger "$E/umami.env"

COMPOSE_PROFILES=statistiques docker compose up -d --wait --wait-timeout 300 umami
# Le tableau de bord n'est publié par Caddy que depuis la version qui le déclare.
docker compose restart caddy > /dev/null
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "$TABLEAU/api/heartbeat" && break
  sleep 2
done

json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
appel() { curl -fsS -H 'Content-Type: application/json' ${jeton:+-H "Authorization: Bearer $jeton"} "$@"; }

if [ ! -f "$E/statistiques.env" ]; then
  # Compte initial d'Umami (admin / umami), remplacé aussitôt.
  jeton=$(printf '{"username":"admin","password":"umami"}' | appel --data-binary @- "$TABLEAU/api/auth/login" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  [ -n "$jeton" ] || { echo "Connexion initiale impossible : mot de passe admin déjà changé ?" >&2; exit 1; }

  site=$(cat /proc/sys/kernel/random/uuid)
  printf '{"id":"%s","name":"nclsmgr.com","domain":"nclsmgr.com"}' "$site" \
    | appel --data-binary @- "$TABLEAU/api/websites" > /dev/null

  printf 'Nouveau mot de passe du tableau de bord (12 caractères au moins) : '
  stty -echo; read -r nouveau; stty echo; echo
  [ "${#nouveau}" -ge 12 ] || { echo "Trop court." >&2; exit 1; }
  printf '{"currentPassword":"umami","newPassword":"%s"}' "$(json "$nouveau")" \
    | appel --data-binary @- "$TABLEAU/api/me/password" > /dev/null

  printf 'UMAMI_SITE_ID=%s\n' "$site" > "$E/statistiques.env"
fi
proteger "$E/statistiques.env"

# Le service web relit son environnement : le script de mesure apparaît sur le site.
COMPOSE_PROFILES=statistiques docker compose up -d --wait --wait-timeout 120 web

# Conservation : treize mois au plus, purge le premier de chaque mois.
cat > /etc/systemd/system/nclsmgr-purge-statistiques.service <<'UNITE'
[Unit]
Description=Purge des mesures d'audience de plus de treize mois
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/nclsmgr
Environment=COMPOSE_PROFILES=statistiques
ExecStart=/usr/bin/docker compose exec -T umami-db psql -U umami -d umami -v ON_ERROR_STOP=1 -c "BEGIN; DELETE FROM event_data WHERE created_at < now() - interval '13 months'; DELETE FROM session_data WHERE created_at < now() - interval '13 months'; DELETE FROM website_event WHERE created_at < now() - interval '13 months'; DELETE FROM session s WHERE s.created_at < now() - interval '13 months' AND NOT EXISTS (SELECT 1 FROM website_event e WHERE e.session_id = s.session_id); COMMIT;"
UNITE
cat > /etc/systemd/system/nclsmgr-purge-statistiques.timer <<'UNITE'
[Unit]
Description=Purge mensuelle des mesures d'audience

[Timer]
OnCalendar=*-*-01 04:30
Persistent=true

[Install]
WantedBy=timers.target
UNITE
systemctl daemon-reload
systemctl enable --now nclsmgr-purge-statistiques.timer > /dev/null

echo "Mesure d'audience active."
echo "Tableau de bord : ssh -N -L 3001:127.0.0.1:3001 debian@<serveur>, puis http://localhost:3001 (compte admin)."
