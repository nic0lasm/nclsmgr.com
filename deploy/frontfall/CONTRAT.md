# Contrat entre nclsmgr.com et Frontfall

Le jeu Frontfall (dépôt `nic0lasm/frontfall`) est publié par son propre dépôt et servi par ce
serveur sous `https://nclsmgr.com/frontfall/`. Les deux dépôts évoluent séparément : ce fichier
dit ce que chacun garantit à l'autre et sert de boîte aux lettres entre eux. Il fait foi en cas
d'écart avec un autre document ; le fonctionnement détaillé du serveur reste dans
[deploy/serveur/README.md](../serveur/README.md#jeu-frontfall), celui du jeu dans `docs/server.md`
et `docs/operations.md` du dépôt du jeu.

Un engagement ne change pas en silence : la demande s'écrit d'abord dans
[Changements demandés / notes](#changements-demandés--notes), puis l'autre côté l'accepte ou
répond au même endroit.

## Qui tient quoi

| Élément                                      | Tenu par                                             |
| -------------------------------------------- | ---------------------------------------------------- |
| Code du jeu, image, étiquette déployée       | Frontfall (workflow _Publish_)                       |
| Fichier Compose du jeu, `/opt/frontfall`     | nclsmgr.com (`deploy/frontfall/compose.yaml`)        |
| Déployeur `frontfall-deployer`, compte, clé  | nclsmgr.com (`deploy/serveur/deployer-frontfall.sh`) |
| Caddy : préfixe, CSP, cache, en-tête d'IP    | nclsmgr.com (`deploy/Caddyfile`)                     |
| Réseau `frontfall`                           | nclsmgr.com (`deploy/compose.yaml`)                  |
| Secrets de déploiement dans le dépôt du jeu  | nclsmgr.com (`deploy/poste/activer-frontfall.sh`)    |
| Contrôle externe de `/frontfall/healthz`     | Frontfall (Better Stack, toutes les 3 minutes)       |
| Sonde du site, sauvegardes, journaux, Docker | nclsmgr.com                                          |

Le dépôt du jeu ne choisit que l'étiquette de l'image. Tout le reste de ce qui tourne sur le
serveur vient de ce dépôt.

## Ce que garantit le jeu

**Image.** `ghcr.io/nic0lasm/frontfall`, publique, construite pour `linux/amd64` et
`linux/arm64`, analysée par Trivy avant d'être étiquetée. Chaque publication porte l'étiquette des
12 premiers caractères hexadécimaux de son commit ; `main` déplace aussi `latest` et une étiquette
`v1.2.3` ajoute `1.2.3`. Seuls les commits de `main` sont déployés. L'image contient `node`, dont
dépend la vérification de santé du fichier Compose.

**Processus.** Un seul processus Node, en utilisateur `node`, qui écoute en HTTP sur le port 8080
(`PORT`). Il n'a besoin d'aucune capacité Linux, n'écrit nulle part ailleurs que dans `/tmp`, ne
garde aucune donnée d'une exécution à l'autre (les parties vivent en mémoire) et n'ouvre aucune
connexion sortante. Son tas est limité à 512 Mio (`NODE_OPTIONS` de l'image), ce qui le garde dans
1 Gio de mémoire. Il écrit ses journaux sur la sortie standard, un objet JSON par ligne.

**Chemins.** Le jeu ignore son préfixe : il répond à partir de `/` et ses pages n'utilisent que
des chemins relatifs.

| Chemin       | Rôle                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| `/healthz`   | État : `200 ok`, `503 stalled` (plus aucun tour fermé) ou `503 stopping` |
| `/ws`        | Websocket de jeu                                                         |
| `/api/games` | Parties publiques, en JSON                                               |
| `/metrics`   | Métriques Prometheus, 404 dès qu'un en-tête de proxy est présent         |
| `/assets/*`  | Ressources dont le nom porte l'empreinte du contenu                      |
| le reste     | Client du jeu, revalidé à chaque visite                                  |

`/healthz` répond `no-store` avec l'en-tête `X-Frontfall-Version`, qui porte l'étiquette de
l'image : _Publish_ attend d'y lire la nouvelle étiquette, au travers de Cloudflare, avant de
déclarer le déploiement réussi.

**Websocket.** Un en-tête `Origin` présent doit valoir exactement `FRONTFALL_ORIGINE`, sinon
l'ouverture est refusée (403) ; une ouverture sans `Origin`, celle d'un robot par exemple, est
acceptée. Le jeu compte les connexions par adresse : il lit `X-Client-IP`, jamais
`X-Forwarded-For`, et seulement quand la connexion vient d'une adresse privée ou locale, comme
celle de Caddy sur le réseau `frontfall` ; sinon il prend l'adresse de la connexion. Au-delà de 8
connexions par adresse (valeur fixe), il répond 429 ; au-delà de `FRONTFALL_MAX_CONNECTIONS` au
total, 503. `/metrics` répond 404 à toute requête portant un en-tête de proxy : il suffit que Caddy
garde son `X-Forwarded-For` par défaut pour que les métriques restent privées. Il envoie un ping toutes les
25 secondes et coupe une connexion restée sans réponse pendant un intervalle entier : une
connexion n'est donc jamais inactive plus de 25 secondes, bien en dessous des 100 secondes de
Cloudflare.

**Arrêt.** Sur SIGTERM, le jeu passe `/healthz` à `stopping`, ferme chaque websocket avec le code
`1012` et se termine en moins de 5 secondes. Les parties en cours sont perdues ; les joueurs
reviennent au menu.

**Contenu.** Le client ne charge que des ressources de sa propre origine. Il se contente de la CSP
posée par Caddy : websocket vers `wss://nclsmgr.com`, workers de même origine, images `data:` et
`blob:`, aucun script, style ni police externe.

## Ce que garantit le serveur

**Projet Compose.** `/opt/frontfall`, propriété de root, installé depuis
`deploy/frontfall/compose.yaml` par `installer-frontfall.sh`. Le compte `frontfall` n'y écrit que
`.env`, qui ne contient que `IMAGE_TAG`. Ce compte appartient au groupe `docker`, donc équivaut à
root : ce qui le borne est l'option `restrict,command=` de sa clé, qui n'exécute que le déployeur. Le conteneur `frontfall-frontfall-1` tourne avec :

| Réglage             | Valeur                                                            |
| ------------------- | ----------------------------------------------------------------- |
| Redémarrage         | `unless-stopped`                                                  |
| Arrêt               | `init: true`, 30 secondes entre SIGTERM et SIGKILL                |
| Système de fichiers | en lecture seule, `/tmp` en mémoire, aucun volume                 |
| Droits              | `cap_drop: [ALL]`, `no-new-privileges`                            |
| Limites             | 1 Gio de mémoire, 2 processeurs, 256 processus                    |
| Santé               | `GET /healthz` toutes les 30 s, 3 échecs, démarrage jusqu'à 1 min |
| Journaux            | journald, étiquette `frontfall-frontfall-1`, 30 jours             |
| Réseau              | `frontfall` seul, interne : aucun accès à Internet                |

Un conteneur `unhealthy` n'est pas redémarré par Docker ; seul un plantage du processus l'est.

**Réseau et Caddy.** Le réseau `frontfall` est créé par le projet du site ; Caddy est le seul
autre conteneur qui le rejoint. Pour toute requête sous `/frontfall/` (et `/frontfall`, redirigé
vers `/frontfall/`), Caddy retire le préfixe, transmet le websocket, remplace `X-Client-IP` par
l'adresse du visiteur vue par Cloudflare, pose la CSP du jeu, met `/frontfall/assets/*` en cache un
an (`immutable`) et le reste en `no-cache`.

**Déploiement.** _Publish_ se connecte en SSH au compte `frontfall` avec une clé à commande forcée,
distincte de celle du site, et passe l'étiquette comme seule commande. `frontfall-deployer` :

1. refuse toute étiquette qui n'est pas faite de 12 caractères hexadécimaux minuscules (code 2) ;
2. refuse de déployer si le réseau `frontfall` manque (code 3) ;
3. écrit l'étiquette dans `.env`, tire l'image, recrée le conteneur et attend qu'il soit sain,
   120 secondes au plus ;
4. ne garde que les 10 images du jeu les plus récentes, plus celle en service si un retour en
   arrière l'a sortie de ces 10, puis affiche `Déployé : <étiquette>`.

Les secrets de l'environnement `production` du dépôt du jeu (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`,
`DEPLOY_KNOWN_HOSTS`) et la variable de dépôt `DEPLOIEMENT_ACTIF` sont posés par
`deploy/poste/activer-frontfall.sh`. Le dépôt du jeu ne les modifie pas.

## Variables d'environnement du jeu

| Variable                      | Posée par | Valeur en production       |
| ----------------------------- | --------- | -------------------------- |
| `NODE_ENV`                    | Compose   | `production`               |
| `PORT`                        | Compose   | `8080`                     |
| `FRONTFALL_ORIGINE`           | Compose   | `https://nclsmgr.com`      |
| `FRONTFALL_VERSION`           | image     | étiquette de l'image       |
| `FRONTFALL_STATIC`            | image     | `/app/public`              |
| `NODE_OPTIONS`                | image     | `--max-old-space-size=512` |
| `FRONTFALL_MAX_GAMES`         | non posée | défaut du jeu : 500        |
| `FRONTFALL_MAX_CONNECTIONS`   | non posée | défaut du jeu : 5000       |
| `FRONTFALL_COUNTDOWN_SECONDS` | non posée | défaut du jeu : 30         |

Le jeu peut ajouter une variable facultative à tout moment. Une variable qu'il faut poser en
production passe par une demande ci-dessous, puisque le fichier Compose est tenu ici.

## Réinstaller le déployeur

Après une fusion qui modifie `deploy/serveur/deployer-frontfall.sh` ou
`deploy/frontfall/compose.yaml`, relancer `installer-frontfall.sh` depuis `main` en gardant la clé
en place. Pour figer la version installée, remplacer `main` par le commit voulu :

```sh
ssh -t debian@<serveur> 'set -e; d=$(mktemp -d); curl -fsSL https://codeload.github.com/nic0lasm/nclsmgr.com/tar.gz/main | tar -xz -C $d --strip-components=1; sudo sh $d/deploy/serveur/installer-frontfall.sh "$(sudo cut -d" " -f2- /home/frontfall/.ssh/authorized_keys)"; rm -rf $d'
```

Un nouveau fichier Compose ne s'applique qu'au déploiement suivant du jeu. Pour l'appliquer tout
de suite, redéployer l'étiquette en service :

```sh
ssh -t debian@<serveur> 'sudo -u frontfall env SSH_ORIGINAL_COMMAND=$(sudo cut -d= -f2 /opt/frontfall/.env) /usr/local/sbin/frontfall-deployer'
```

## Vérifier

Depuis n'importe quel poste :

```sh
curl -sSi https://nclsmgr.com/frontfall/healthz
```

`200 ok` et `X-Frontfall-Version` égal à la dernière étiquette publiée par _Publish_. Sur le
serveur :

```sh
sudo docker ps --filter name=frontfall --format '{{.Names}} {{.Image}} {{.Status}}'
cat /opt/frontfall/.env
sudo docker image ls ghcr.io/nic0lasm/frontfall --format '{{.Tag}} {{.CreatedAt}}' | wc -l
sudo docker inspect frontfall-frontfall-1 --format 'mem={{.HostConfig.Memory}} cpus={{.HostConfig.NanoCpus}} pids={{.HostConfig.PidsLimit}} ro={{.HostConfig.ReadonlyRootfs}} santé={{.State.Health.Status}}'
sudo grep -o 'command="[^"]*"' /home/frontfall/.ssh/authorized_keys
```

Attendu : conteneur `healthy`, 10 images au plus (11 après un retour en arrière), `mem=1073741824 cpus=2000000000 pids=256
ro=true`, commande forcée `/usr/local/sbin/frontfall-deployer`. Le projet du jeu tient, hors des
deux dépôts, un contrôle en lecture seule plus complet (`ops-check.sh`) qui rassemble ces mesures,
l'espace disque, l'état de santé vu de l'intérieur et au travers de Cloudflare, et les derniers
journaux ; il ne modifie rien.

## Changements demandés / notes

Chaque projet écrit ici, par une PR sur ce dépôt, ce qu'il demande à l'autre ou ce qu'il doit lui
faire savoir. Une entrée est datée et dit son état : _ouverte_, _acceptée_, _refusée_ ou _faite_
(avec la PR ou le commit). Les entrées faites restent trois mois, puis s'effacent : l'historique
Git les garde.

### Frontfall → nclsmgr.com

- **2026-10-24 — Rétention des images du site** (_ouverte_). `deployer.sh` ne lance que
  `docker image prune -f`, qui ne retire que les images sans étiquette : chaque publication du site
  laisse son image `ghcr.io/nic0lasm/nclsmgr.com` sur le serveur, comme le faisait le déployeur du
  jeu avant la PR #94. Le disque partagé finit par se remplir, jeu compris. Demande : la même
  rétention que `deployer-frontfall.sh` (les 10 images les plus récentes, celle en service gardée
  d'office), puis la réinstallation de `deployer.sh` sur le serveur.

### nclsmgr.com → Frontfall

Aucune entrée pour l'instant.
