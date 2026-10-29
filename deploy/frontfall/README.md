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
sur le port 8080. Il n'écrit que dans `/tmp` et dans `/var/lib/frontfall` (`FRONTFALL_DATA`), un volume
nommé dont les sous-dossiers `usage/` et `games/` recevront mesures d'usage et parties à reprendre ;
il démarre aussi sans. Les parties vivent en mémoire. Il n'a besoin ni d'Internet ni d'aucune
capacité Linux, et son tas est limité à 512 Mio. Les
journaux sortent en JSON, une ligne par événement.

Le jeu ignore le préfixe `/frontfall` : ses pages n'utilisent que des chemins relatifs, et les
fichiers de `/assets/` portent leur empreinte dans leur nom. Le websocket est sur `/ws`.

`/healthz` répond `200 ok`, ou `503` avec `stalled` si plus aucun tour ne se ferme et `stopping`
pendant l'arrêt. L'en-tête `X-Frontfall-Version` donne l'étiquette en service : le workflow de
publication du jeu l'attend, au travers de Cloudflare, avant de déclarer le déploiement réussi.
`/metrics` renvoie 404 à toute requête qui passe par un proxy.

Sur SIGTERM, le jeu n'ouvre plus de partie et laisse finir celles en cours pendant
`FRONTFALL_DRAIN_SECONDS` au plus (10 minutes ici), puis prévient les joueurs, ferme les websockets
(code `1012`) et s'arrête 5 secondes plus tard au plus. `/admin/maintenance`, qui annonce une mise à
jour aux joueurs, ne répond qu'aux requêtes venues du conteneur lui-même ; Caddy le ferme aussi.

Quelques comportements dépendent directement de Caddy :

- un websocket ouvert par une page d'une autre origine que `FRONTFALL_ORIGINE` est refusé ;
- l'adresse du joueur est lue dans `X-Client-IP`, et seulement quand la connexion vient d'une
  adresse privée, celle de Caddy sur le réseau `frontfall` ; au-delà de 16 connexions par adresse,
  le jeu répond 429 ;
- le jeu envoie un ping toutes les 25 secondes, bien sous le délai d'inactivité de Cloudflare ;
- le client ne charge rien d'une autre origine, ce que suppose la CSP posée par Caddy.

## Ce que le serveur fournit

Le fichier Compose de ce dossier est installé dans `/opt/frontfall`, qui appartient à root. Le
conteneur redémarre seul après un plantage, tourne en lecture seule avec `/tmp` en mémoire, sans
capacité, avec 768 Mio de mémoire, 2 processeurs et 256 processus au plus. Il dispose de 11 minutes
pour s'arrêter, une de plus que le drainage. La préproduction (`compose-next.yaml`, service
`frontfall-next`, `/opt/frontfall-next`) tourne à côté avec 192 Mio, un tas de 128 Mio, 20 parties
et 200 connexions au plus. Docker interroge `/healthz` toutes les 30 secondes, avec `node` : l'image doit donc
le garder. Caddy le joint sur le réseau interne `frontfall`, sans accès à Internet (la préproduction
sur le sien, `frontfall-next`, pour qu'elle ne puisse pas parler à la production) ; un second
réseau de la production, `sortie`, propre au projet et sans port publié, ne sert qu'aux appels du jeu vers Discord et
Google quand un joueur se connecte, et vers la boîte d'envoi pour les liens de connexion par e-mail. C'est un bridge ordinaire : rien n'y limite encore la sortie, le
conteneur pourrait joindre tout Internet, l'hôte et son réseau local. Durcissement prévu (v0.9) :
une règle `DOCKER-USER` (nftables) qui n'admet depuis ce réseau que le DNS et le port 443 de
`discord.com`, `oauth2.googleapis.com` et `openidconnect.googleapis.com`.

Caddy redirige `/frontfall` vers `/frontfall/`, retire le préfixe, transmet le websocket, pose
`X-Client-IP`, la CSP du jeu et les en-têtes de cache (un an pour `/frontfall/assets/`, revalidation
pour le reste).
Il refuse les corps de plus de 64 Ko, coupe une connexion dont les en-têtes mettent plus de
10 secondes à arriver et n'attend pas plus de 30 secondes la réponse du jeu ; les websockets n'ont
pas de limite de durée.

Quand ce dépôt ajoute un réseau au jeu, le site doit être déployé d'abord (c'est lui qui crée les
réseaux), puis `installer-frontfall.sh` relancé pour recopier les fichiers Compose dans `/opt`.

Le déploiement passe par le compte `frontfall`, dont la clé SSH n'exécute que
`frontfall-deployer`. Celui-ci refuse une étiquette qui n'est pas faite de 12 caractères
hexadécimaux, écrit l'étiquette dans `/opt/frontfall/.env`, tire l'image, attend que le conteneur
soit sain (120 secondes au plus) et ne garde que les 10 images les plus récentes, plus celle en
service après un retour en arrière. Précédée de `next`, la commande vise la préproduction ;
`annonce <minutes>` (1 à 60) prévient les joueurs connectés d'une mise à jour prochaine.

Variables posées par le fichier Compose : `NODE_ENV=production`, `PORT=8080`,
`FRONTFALL_ORIGINE=https://nclsmgr.com`, `FRONTFALL_DRAIN_SECONDS=600`,
`FRONTFALL_DATA=/var/lib/frontfall` et, en production seulement, `FRONTFALL_PUBLIC_URL`
(`https://nclsmgr.com/frontfall`) et `FRONTFALL_SMTP_FILE` (`/run/secrets/smtp`). L'image pose elle-même `FRONTFALL_VERSION`,
`FRONTFALL_STATIC` et `NODE_OPTIONS`. Les limites du jeu (`FRONTFALL_MAX_GAMES`,
`FRONTFALL_MAX_CONNECTIONS`, `FRONTFALL_COUNTDOWN_SECONDS`) gardent leur valeur par défaut ; une
nouvelle variable nécessaire en production s'ajoute dans `compose.yaml`.

Les secrets de la connexion Discord et Google ne sont pas dans ce dépôt : ils sont lus dans
`/etc/frontfall/comptes.env` s'il existe, `root:frontfall`, mode `640`, car le déployeur lance
Compose sous le compte `frontfall`, qui doit pouvoir le lire. Sans lui, le jeu se joue en invité
seulement ; la préproduction n'a jamais de connexion. `env_file` avec `required: false` demande
Docker Compose 2.24 ou plus récent : `installer-frontfall.sh` le vérifie.

```sh
FRONTFALL_SESSION_SECRET=<openssl rand -base64 48, jamais changé ensuite>
FRONTFALL_OAUTH_DISCORD_ID=<id client>
FRONTFALL_OAUTH_DISCORD_SECRET=<secret client>
FRONTFALL_OAUTH_GOOGLE_ID=<id client>
FRONTFALL_OAUTH_GOOGLE_SECRET=<secret client>
```

La connexion par e-mail n'a pas de secret à elle : le jeu relit la boîte d'envoi du site,
`/etc/nclsmgr/smtp.json` (`configurer-smtp.sh`, uid 1000, mode `400`), montée en lecture seule sur
`/run/secrets/smtp` (`FRONTFALL_SMTP_FILE`). L'utilisateur `node` de l'image a l'uid 1000 et la lit
donc sans autre droit. Le fichier doit exister : sans lui, Compose refuse de démarrer la production
plutôt que de créer un dossier à sa place. Les liens partent de l'adresse `expediteur` de ce fichier,
150 par jour au plus (`FRONTFALL_EMAIL_DAILY_LIMIT`), par le réseau `sortie`. La préproduction n'en
a pas, comme pour Discord et Google.

Changer le secret de session déconnecte tout le monde, sans rien perdre : les comptes vivent dans le
volume, avec leur propre sel. Adresses de retour à déclarer chez Discord et Google :
`https://nclsmgr.com/frontfall/auth/discord/callback` et `…/frontfall/auth/google/callback`.

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
