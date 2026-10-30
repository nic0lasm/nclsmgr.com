#!/bin/sh
# Commande « liens » : crée, liste, prolonge et révoque les liens de l'espace privé.
# Se lance depuis le poste d'administration. La demande part en JSON, par SSH, vers le compte
# « liens » du serveur, dont la clé ne peut lancer qu'une seule commande. Le lien créé arrive
# par courriel : il n'apparaît jamais dans ce terminal.
#
#   liens creer --profil recruteur --destinataire "Camille" [--organisation "Acme"]
#               [--langue fr|en] [--message "..."] [--documents cv]
#               [--note "..."] [--duree 30]
#   liens lister [--tous]
#   liens journal l-7kq2mz
#   liens prolonger l-7kq2mz 30
#   liens revoquer l-7kq2mz
#   liens supprimer l-7kq2mz
#   liens purger
#
# Hôte : alias « nclsmgr-liens » de ~/.ssh/config, ou la variable LIENS_HOTE.
set -eu
# Aucun développement de jokers (« --documents '*' » doit partir tel quel), et sed et awk
# traitent les octets un à un, quelle que soit la locale du Mac.
set -f
export LC_ALL=C

usage() {
  sed -n '7,16s/^# \{0,1\}//p' "$0" >&2
  exit 2
}

# Chaîne JSON : antislash, guillemet, tabulation et retour chariot échappés, lignes jointes
# par \n. Les autres caractères de contrôle rendent le JSON invalide et sont refusés en face.
TAB=$(printf '\t')
CR=$(printf '\r')
chaine() {
  printf '%s\n' "$1" |
    sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e "s/$TAB/\\\\t/g" -e "s/$CR/\\\\r/g" |
    awk 'NR > 1 { printf "%s", "\\n" } { printf "%s", $0 }'
}

json=""
ajouter() { json="$json,\"$1\":$2"; }
texte() { ajouter "$1" "\"$(chaine "$2")\""; }
nombre() {
  case $2 in
    "" | *[!0-9]* | 0*) echo "Nombre entier attendu pour $1 : $2" >&2; exit 2 ;;
  esac
  ajouter "$1" "$2"
}
liste() {
  valeurs=""
  ancien_ifs=$IFS
  IFS=,
  for valeur in $2; do valeurs="$valeurs${valeurs:+,}\"$(chaine "$valeur")\""; done
  IFS=$ancien_ifs
  ajouter "$1" "[$valeurs]"
}

[ $# -gt 0 ] || usage
action=$1
shift
case $action in
  creer)
    while [ $# -gt 0 ]; do
      [ $# -ge 2 ] || usage
      case $1 in
        --profil) texte profil "$2" ;;
        --destinataire) texte destinataire "$2" ;;
        --organisation) texte organisation "$2" ;;
        --langue) texte langue "$2" ;;
        --message) texte message "$2" ;;
        --note) texte note "$2" ;;
        --documents) liste documents "$2" ;;
        --duree) nombre dureeJours "$2" ;;
        *) usage ;;
      esac
      shift 2
    done
    ;;
  lister)
    case $# in
      0) ;;
      1) [ "$1" = --tous ] || usage; ajouter tous true ;;
      *) usage ;;
    esac
    ;;
  journal | revoquer | supprimer)
    [ $# -eq 1 ] || usage
    texte id "$1"
    ;;
  prolonger)
    [ $# -eq 2 ] || usage
    texte id "$1"
    nombre jours "$2"
    ;;
  purger) [ $# -eq 0 ] || usage ;;
  *) usage ;;
esac

printf '{"action":"%s"%s}\n' "$action" "$json" | ${LIENS_SSH:-ssh} -T -- "${LIENS_HOTE:-nclsmgr-liens}"
