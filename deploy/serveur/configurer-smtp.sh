#!/bin/sh
# Enregistre le secret SMTP du service courrier. À lancer une fois, en root :
#   sudo sh configurer-smtp.sh
# Le mot de passe est saisi sans écho et ne passe ni par l'historique du shell ni en argument.
# Le service courrier démarre au déploiement suivant (le déployeur détecte le fichier).
set -eu

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }

FICHIER=/etc/nclsmgr/smtp.json
json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

printf 'Serveur SMTP [ssl0.ovh.net] : '; read -r hote; hote=${hote:-ssl0.ovh.net}
printf 'Port [465] : '; read -r port; port=${port:-465}
case "$port" in "" | *[!0-9]*) echo "Port invalide." >&2; exit 1 ;; esac
printf 'Adresse de la boîte d'"'"'envoi : '; read -r utilisateur
printf 'Mot de passe de cette boîte : '; stty -echo; read -r mdp; stty echo; echo
printf 'Adresse qui reçoit les notifications : '; read -r destinataire

install -d -m 755 -o root -g root /etc/nclsmgr
umask 077
cat > "$FICHIER.tmp" <<FIN
{
  "hote": "$(json "$hote")",
  "port": $port,
  "utilisateur": "$(json "$utilisateur")",
  "motDePasse": "$(json "$mdp")",
  "expediteur": "$(json "$utilisateur")",
  "destinataire": "$(json "$destinataire")"
}
FIN
# Lisible du seul utilisateur des conteneurs (uid 1000), en lecture seule.
chown 1000:1000 "$FICHIER.tmp"
chmod 400 "$FICHIER.tmp"
mv "$FICHIER.tmp" "$FICHIER"
echo "Secret SMTP enregistré dans $FICHIER. Le service courrier démarrera au prochain déploiement."
