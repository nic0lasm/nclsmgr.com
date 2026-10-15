#!/bin/sh
# Commande forcée de la clé « liens ». Les données arrivent en JSON sur l'entrée standard,
# jamais en argument : SSH_ORIGINAL_COMMAND est ignoré. La validation se fait dans Node.
set -eu
cd /opt/nclsmgr
# Une seule commande à la fois : une clé volée ne peut pas lancer des dizaines de
# « docker compose exec » en parallèle. Le verrou tient jusqu'à la fin de la commande.
exec 9> /run/nclsmgr-liens.lock
flock -n 9 || { echo "Une autre commande liens est en cours : réessaie dans une minute." >&2; exit 75; }
# liens.cjs s'arrête de lui-même au bout de 45 s ; timeout n'arrête que le client docker.
exec timeout 60 docker compose exec -T courrier node liens.cjs
