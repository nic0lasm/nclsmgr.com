# Frontfall

Ce dossier contient le fichier Compose du jeu Frontfall, servi sous
`https://nclsmgr.com/frontfall/`. Le jeu vit dans son propre dépôt (`nic0lasm/frontfall`), qui
publie l'image et ne choisit que son étiquette ; tout ce qui l'entoure sur le serveur est ici.
L'installation et l'exploitation courante sont décrites dans
[le guide serveur](../serveur/README.md#jeu-frontfall). Cette page rassemble ce sur quoi chaque
côté compte, pour ne rien casser en modifiant l'un ou l'autre.

## Ce que l'image fournit

L'image `ghcr.io/nic0lasm/frontfall` est publique, construite pour amd64 et arm64, et étiquetée par
les 12 premiers caractères du commit. Elle lance un seul processus Node, en utilisateur `node`,
sur le port 8080. Il n'écrit que dans `/tmp`, ne garde aucune donnée (les parties vivent en
mémoire), n'a besoin ni d'Internet ni d'aucune capacité Linux, et son tas est limité à 512 Mio. Les
journaux sortent en JSON, une ligne par événement.

Le jeu ignore le préfixe `/frontfall` : ses pages n'utilisent que des chemins relatifs, et les
fichiers de `/assets/` portent leur empreinte dans leur nom. Le websocket est sur `/ws`.

`/healthz` répond `200 ok`, ou `503` avec `stalled` si plus aucun tour ne se ferme et `stopping`
pendant l'arrêt. L'en-tête `X-Frontfall-Version` donne l'étiquette en service : le workflow de
publication du jeu l'attend, au travers de Cloudflare, avant de déclarer le déploiement réussi.
`/metrics` renvoie 404 à toute requête qui passe par un proxy.

Sur SIGTERM, le jeu ferme les websockets (code `1012`) et s'arrête en moins de 5 secondes.

Quelques comportements dépendent directement de Caddy :

- un websocket ouvert par une page d'une autre origine que `FRONTFALL_ORIGINE` est refusé ;
- l'adresse du joueur est lue dans `X-Client-IP`, et seulement quand la connexion vient d'une
  adresse privée, celle de Caddy sur le réseau `frontfall` ; au-delà de 8 connexions par adresse,
  le jeu répond 429 ;
- le jeu envoie un ping toutes les 25 secondes, bien sous le délai d'inactivité de Cloudflare ;
- le client ne charge rien d'une autre origine, ce que suppose la CSP posée par Caddy.

## Ce que le serveur fournit

Le fichier Compose de ce dossier est installé dans `/opt/frontfall`, qui appartient à root. Le
conteneur redémarre seul après un plantage, tourne en lecture seule avec `/tmp` en mémoire, sans
capacité, avec 1 Gio de mémoire, 2 processeurs et 256 processus au plus. Il dispose de 30 secondes
pour s'arrêter. Docker interroge `/healthz` toutes les 30 secondes, avec `node` : l'image doit donc
le garder. Il est seul sur le réseau interne `frontfall` avec Caddy, sans accès à Internet.

Caddy redirige `/frontfall` vers `/frontfall/`, retire le préfixe, transmet le websocket, pose
`X-Client-IP`, la CSP du jeu et les en-têtes de cache (un an pour `/frontfall/assets/`, revalidation
pour le reste).

Le déploiement passe par le compte `frontfall`, dont la clé SSH n'exécute que
`frontfall-deployer`. Celui-ci refuse une étiquette qui n'est pas faite de 12 caractères
hexadécimaux, écrit l'étiquette dans `/opt/frontfall/.env`, tire l'image, attend que le conteneur
soit sain (120 secondes au plus) et ne garde que les 10 images les plus récentes, plus celle en
service après un retour en arrière.

Variables posées par le fichier Compose : `NODE_ENV=production`, `PORT=8080` et
`FRONTFALL_ORIGINE=https://nclsmgr.com`. L'image pose elle-même `FRONTFALL_VERSION`,
`FRONTFALL_STATIC` et `NODE_OPTIONS`. Les limites du jeu (`FRONTFALL_MAX_GAMES`,
`FRONTFALL_MAX_CONNECTIONS`, `FRONTFALL_COUNTDOWN_SECONDS`) gardent leur valeur par défaut ; une
nouvelle variable nécessaire en production s'ajoute dans `compose.yaml`.

## Mettre à jour le déployeur

Après une modification de `deploy/serveur/deployer-frontfall.sh` ou de `compose.yaml`, relancer
l'installation en gardant la clé en place :

```sh
ssh -t debian@<serveur> 'set -e; d=$(mktemp -d); curl -fsSL https://codeload.github.com/nic0lasm/nclsmgr.com/tar.gz/main | tar -xz -C $d --strip-components=1; sudo sh $d/deploy/serveur/installer-frontfall.sh "$(sudo cut -d" " -f2- /home/frontfall/.ssh/authorized_keys)"; rm -rf $d'
```

Le nouveau fichier Compose s'applique au déploiement suivant. Pour l'appliquer tout de suite,
redéployer l'étiquette en service :

```sh
ssh -t debian@<serveur> 'sudo -u frontfall env SSH_ORIGINAL_COMMAND=$(cut -d= -f2 /opt/frontfall/.env) /usr/local/sbin/frontfall-deployer'
```

## Vérifier

```sh
curl -sSi https://nclsmgr.com/frontfall/healthz
```

Puis, sur le serveur :

```sh
sudo docker ps --filter name=frontfall --format '{{.Names}} {{.Image}} {{.Status}}'
sudo docker image ls ghcr.io/nic0lasm/frontfall --format '{{.Tag}}' | wc -l
sudo docker inspect frontfall-frontfall-1 --format 'mem={{.HostConfig.Memory}} pids={{.HostConfig.PidsLimit}} ro={{.HostConfig.ReadonlyRootfs}}'
```

On attend `200 ok` avec la dernière étiquette publiée, un conteneur `healthy`, 10 images au plus
(11 après un retour en arrière) et `mem=1073741824 pids=256 ro=true`.

## Limites connues

- Le déployeur du site (`deployer.sh`) ne retire que les images sans étiquette : contrairement à
  celui du jeu, il garde toutes les anciennes images du site.
- Une publication du jeu coupe les parties en cours.
