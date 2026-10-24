# Exploitation du serveur

Les scripts de ce dossier se lancent en root sur le serveur, depuis une copie du dépôt figée sur un
commit précis. Forme générale, depuis le poste d'administration :

```sh
ssh -t debian@<serveur> "set -e; d=\$(mktemp -d); curl -fsSL https://codeload.github.com/nic0lasm/nclsmgr.com/tar.gz/<commit> | tar -xz -C \$d --strip-components=1; sudo sh \$d/deploy/serveur/<script> <arguments>"
```

Le déploiement courant ne passe pas par ces scripts : GitHub Actions publie l'image puis appelle
`deployer.sh` par une clé SSH à commande forcée. Après chaque déploiement, le serveur ne garde que
les 10 images du site les plus récentes, de quoi revenir en arrière sans téléchargement.

**Mise à jour du déployeur.** Après une fusion qui modifie `deployer.sh`, réinstaller ce seul
fichier ; aucun autre réglage du serveur n'est touché :

```sh
ssh -t debian@<serveur> 'set -e; d=$(mktemp -d); curl -fsSL https://codeload.github.com/nic0lasm/nclsmgr.com/tar.gz/main | tar -xz -C $d --strip-components=1; sudo install -m 755 -o root -g root $d/deploy/serveur/deployer.sh /usr/local/sbin/nclsmgr-deployer; rm -rf $d'
```

## Mise en place, dans l'ordre

| Étape                    | Script                                              | Prérequis                       |
| ------------------------ | --------------------------------------------------- | ------------------------------- |
| 1. Compte de déploiement | `installer-deploiement.sh "<clé publique>"`         | Serveur durci, Docker installé  |
| 2. Certificat d'origine  | `installer-certificat.sh demande`, puis `installer` | Zone Cloudflare active          |
| 3. Envoi de courriels    | `configurer-smtp.sh`                                | Compte de messagerie du domaine |
| 4. Compte `liens`        | `installer-liens.sh "<clé publique dédiée>"`        | Service courrier déployé        |
| 5. Mesure d'audience     | `installer-statistiques.sh`                         | Premier déploiement fait        |
| 6. Sauvegardes et sonde  | `installer-sauvegarde.sh`                           | Bucket R2, jeton S3, sondes     |
| 7. Origine fermée        | `restreindre-origine.sh`                            | Full (strict), aucun AAAA       |
| 8. Journaux sur 30 jours | `conserver-journaux.sh`                             | Aucun                           |
| 9. Jeu Frontfall         | `installer-frontfall.sh "<clé publique dédiée>"`    | Réseau `frontfall` déployé      |

Tous sont idempotents, sauf `installer-certificat.sh` qui remplace le certificat à chaque appel.

## Certificat d'origine Cloudflare

L'étape 1 pose un certificat provisoire auto-signé, valable 30 jours, qui suffit tant que le DNS
ne pointe pas encore vers le serveur. En mode SSL **Full (strict)**, Cloudflare le refuse
(erreur 526) : il faut le remplacer par un certificat d'origine Cloudflare. La clé privée est créée
sur le serveur et n'en sort jamais.

1. **Demande.** Lancer `installer-certificat.sh demande` et copier le bloc affiché, de
   `-----BEGIN CERTIFICATE REQUEST-----` à `-----END CERTIFICATE REQUEST-----` inclus.
2. **Signature.** Cloudflare, SSL/TLS › Origin Server › **Create Certificate** :
   « Use my private key and CSR », coller la demande, garder les noms proposés (`*.nclsmgr.com`
   et `nclsmgr.com`, le joker couvre `www`), validité 15 ans, format PEM. Copier le certificat
   affiché.
3. **Installation.** Lancer `installer-certificat.sh installer`, coller le certificat, puis Entrée
   et Ctrl-D. Le script vérifie l'émetteur, les noms (`nclsmgr.com`, et `www` ou le joker) et la
   correspondance avec la clé en attente, redémarre Caddy et revient à l'ancien certificat si le
   site ne répond plus.
4. **Mode strict.** Cloudflare, SSL/TLS › Overview : **Full (strict)**.

L'ancien certificat reste dans `/etc/nclsmgr/certs/*.precedent.pem` pour un retour arrière
manuel. Une demande non signée se relance sans risque : seule la clé en attente est remplacée.

## Origine réservée à Cloudflare

`restreindre-origine.sh` ferme 80 et 443 à tout ce qui n'est pas une plage Cloudflare. En IPv4,
les ports publiés par Docker échappent à UFW : le filtre passe par la chaîne `DOCKER-USER`, rechargée
au démarrage de Docker et à chaque mise à jour hebdomadaire des plages. En IPv6, les réseaux Docker
n'ont pas d'adresse : le DNS ne doit publier aucun AAAA vers l'origine, sinon Cloudflare passerait
par le docker-proxy, qui masque l'IP source, et UFW ferme 80 et 443. Après coup, le site ne répond
plus en direct sur l'IP du serveur, y compris pour un `curl --resolve` depuis le poste
d'administration ; les contrôles locaux sur le serveur restent possibles. Retour arrière :
`restreindre-origine.sh retirer`.

## Sauvegardes et surveillance

`installer-sauvegarde.sh` installe trois minuteries systemd :

| Minuterie                    | Quand                   | Rôle                                               |
| ---------------------------- | ----------------------- | -------------------------------------------------- |
| `nclsmgr-sauvegarde`         | chaque nuit vers 3 h 30 | instantané chiffré envoyé vers R2                  |
| `nclsmgr-verif-restauration` | le 1er du mois vers 5 h | restauration complète dans un dossier temporaire   |
| `nclsmgr-sonde`              | toutes les cinq minutes | appel du site par Cloudflare, compte rendu externe |

**Contenu.** `/etc/nclsmgr` (certificats, secrets SMTP et Umami), `/opt/nclsmgr` (version
déployée), la base de l'espace privé (copie cohérente par l'API de sauvegarde SQLite), les
documents réservés, les données de Caddy et un export PostgreSQL d'Umami. Chaque fichier est
accompagné de son empreinte SHA-256. Les accès au dépôt de sauvegarde (`sauvegarde.env`,
`restic.motdepasse`) en sont exclus : ils sont conservés hors du serveur.

**Chiffrement et conservation.** restic chiffre sur le serveur (AES-256 et Poly1305) avant
l'envoi ; R2 ne reçoit que des blocs chiffrés. Sept sauvegardes quotidiennes, quatre
hebdomadaires et deux mensuelles : rien au-delà de trois mois, la durée annoncée dans la
politique de confidentialité. Limite connue : le jeton R2 du serveur peut supprimer, une prise de
contrôle du serveur peut donc effacer les sauvegardes. Le mot de passe de chiffrement et l'accès au
tableau de bord Cloudflare restent hors du serveur.

**Alertes.** Le service de surveillance (Healthchecks.io) attend deux signaux et prévient par
courriel s'il en manque un ou s'il reçoit un échec : la sauvegarde quotidienne, et la sonde du site
toutes les cinq minutes. Un serveur arrêté ou injoignable cesse de se signaler et déclenche donc
l'alerte. Un test de restauration en échec fait passer la sonde des sauvegardes en alerte. La sonde
du site part du serveur : le workflow _Disponibilité_ de GitHub Actions, actif quand la variable de
dépôt `SURVEILLANCE_ACTIVE` vaut `true`, la double d'un contrôle mené depuis l'extérieur toutes les
quinze minutes, certificat compris.

### Mise en place

1. **Bucket.** Cloudflare, R2 Object Storage › **Create bucket** : nom `nclsmgr-sauvegardes`,
   juridiction **EU**. La première fois, R2 demande un moyen de paiement ; l'usage du site reste
   dans l'offre gratuite (10 Go).
2. **Jeton.** R2 Object Storage › **Manage API tokens** › **Create Account API token** :
   permission **Object Read & Write**, limitée au bucket `nclsmgr-sauvegardes`, durée illimitée,
   filtrage sur les adresses IPv4 et IPv6 du serveur. Garder ouverte la page qui affiche
   l'_Access Key ID_, le _Secret Access Key_ et le point d'accès S3 de la juridiction EU.
3. **Sondes.** Healthchecks.io, compte gratuit : créer deux contrôles, `sauvegarde` (période
   1 jour, délai de grâce 2 heures) et `site` (période 5 minutes, délai de grâce 10 minutes).
   L'alerte par courriel vers l'adresse du compte est active par défaut. Ne pas publier de page
   de statut.
4. **Installation.** Lancer `installer-sauvegarde.sh` et répondre aux questions : dépôt
   `s3:<point d'accès>/nclsmgr-sauvegardes`, clé et secret du jeton, puis l'adresse de sonde
   (_Ping URL_) de chaque contrôle. Le script affiche une seule fois le mot de passe de
   chiffrement : le ranger aussitôt dans le gestionnaire de mots de passe. Il lance ensuite la
   première sauvegarde et le test de restauration, puis affiche leur résultat.
5. **Sonde extérieure.** GitHub, Settings › Secrets and variables › Actions › onglet
   **Variables** › **New repository variable** : `SURVEILLANCE_ACTIVE`, valeur `true`. Lancer
   ensuite une fois le workflow _Disponibilité_ à la main pour vérifier qu'il passe.

### Test de restauration

```sh
ssh -t debian@<serveur> sudo nclsmgr-verif-restauration
```

La commande restaure le dernier instantané dans un dossier temporaire, recalcule l'empreinte de
chaque fichier et la compare à celle prise lors de la sauvegarde, contrôle l'intégrité de la base,
relit 10 % des données stockées sur R2, puis efface le dossier. Ce dossier est pris dans `/tmp`,
en mémoire sur Debian 13 : la copie déchiffrée reste hors du disque et disparaît au plus tard
au redémarrage, même après un arrêt brutal. La commande termine par
`Restauration vérifiée : <n> fichiers identiques, instantané <id> <date>`, ou s'arrête sur l'écart
trouvé.

### Restauration après perte du serveur

Sur le nouveau serveur, durci et avec Docker : installer restic, créer `/etc/nclsmgr/sauvegarde.env`
et `/etc/nclsmgr/restic.motdepasse` (mode 600) à partir du mot de passe conservé et d'un nouveau
jeton R2, puis `restic restore latest --host nclsmgr --target /root/restauration`. Dans
`courant/`, `etc/` va dans `/etc/nclsmgr` et `opt/` dans `/opt/nclsmgr` ; après un premier
déploiement, `espace.db`, `prive/` et `caddy/` vont dans les volumes `nclsmgr_base`,
`nclsmgr_prive` et `nclsmgr_caddy_data`, et `umami.dump` se recharge par `pg_restore` dans le
conteneur `umami-db`.

## Jeu Frontfall

Le jeu (dépôt `nic0lasm/frontfall`) est servi sous `https://nclsmgr.com/frontfall/`, websocket
compris (`/frontfall/ws`). Il tourne dans son propre projet Compose, `/opt/frontfall`, pour que ses
publications ne redémarrent ni le site ni Caddy. Caddy le joint sur le réseau `frontfall`, créé par
le projet du site et sans accès à Internet, retire le préfixe `/frontfall` et lui pose sa propre
politique CSP. Ce que le jeu et le serveur se garantissent l'un à l'autre, et les demandes de
chaque côté, sont dans [deploy/frontfall/CONTRAT.md](../frontfall/CONTRAT.md).

**Déploiement.** Le workflow de publication du dépôt du jeu construit
`ghcr.io/nic0lasm/frontfall`, puis appelle `frontfall-deployer` avec l'étiquette de l'image, par
une clé SSH à commande forcée distincte de celle du site. Le fichier Compose du jeu vient de ce
dépôt (`deploy/frontfall/compose.yaml`) : le dépôt du jeu ne choisit que l'étiquette. Après chaque
déploiement, le serveur ne garde que les 10 images du jeu les plus récentes, de quoi revenir en
arrière sans téléchargement.

**Mise à jour du déployeur.** Après une fusion qui modifie `deployer-frontfall.sh` ou le fichier
Compose du jeu, relancer `installer-frontfall.sh` en gardant la clé en place :

```sh
ssh -t debian@<serveur> 'set -e; d=$(mktemp -d); curl -fsSL https://codeload.github.com/nic0lasm/nclsmgr.com/tar.gz/main | tar -xz -C $d --strip-components=1; sudo sh $d/deploy/serveur/installer-frontfall.sh "$(sudo cut -d" " -f2- /home/frontfall/.ssh/authorized_keys)"; rm -rf $d'
```

**Mise en place.**

1. **Réseau.** Déployer une version du site qui contient le réseau `frontfall` (fusion sur
   `main`). Caddy est recréé une fois pour le rejoindre, soit quelques secondes d'interruption.
2. **Compte, clé et secrets.** Depuis le poste d'administration, avec `gh` connecté :
   `sh deploy/poste/activer-frontfall.sh <serveur>`. Le script crée une clé dédiée, lance
   `installer-frontfall.sh` sur le serveur depuis la dernière version de `main`, puis crée
   l'environnement `production` du dépôt du jeu avec les secrets `DEPLOY_SSH_KEY`, `DEPLOY_HOST` et
   `DEPLOY_KNOWN_HOSTS` (tiré du `known_hosts` du poste), et la variable `DEPLOIEMENT_ACTIF`. La clé
   privée ne reste pas sur le poste.
3. **Image publique.** Après la première publication : Packages › `frontfall` › Package settings ›
   **Change visibility** › Public, sans quoi le serveur ne peut pas la tirer.

Tant que le jeu n'est pas déployé, `/frontfall/` répond 502 ; le reste du site n'est pas touché.
Une publication du jeu coupe les parties en cours : le serveur du jeu reçoit SIGTERM et dispose de
30 secondes pour prévenir les joueurs. Le jeu ne garde aucune donnée sur le serveur ; s'il en
garde un jour, son volume entre dans la sauvegarde.

## Conservation des journaux

La page Confidentialité annonce 30 jours pour les journaux techniques du serveur.
`conserver-journaux.sh` le fait respecter : journald garde 30 jours au plus, en un fichier par
jour, et fail2ban y écrit au lieu de `/var/log/fail2ban.log`. Les conteneurs écrivent aussi dans
journald (pilote `journald` de `compose.yaml`) : leurs journaux suivent la même durée et
`docker logs` les lit toujours. Le passage à ce pilote recrée les conteneurs au déploiement
suivant, soit quelques secondes d'interruption. Caddy ne tient pas de journal d'accès.

## Reste à faire avant le lancement

État au 18 octobre 2026 : site servi derrière Cloudflare en **Full (strict)** avec le certificat
d'origine, origine fermée aux autres adresses, DNSSEC signé par Cloudflare et enregistrement DS
publié chez le registrar, Mozilla Observatory et SSL Labs à A+, sauvegardes chiffrées vers R2 et
sondes de disponibilité en service. Le suivi d'ensemble est dans [ROADMAP.md](../../ROADMAP.md),
chantier 3. Pour terminer, dans cet ordre :

1. **Noyau** : redémarrer le serveur (`sudo reboot`) pour charger le dernier noyau installé. Les
   conteneurs et le filtre d'origine repartent seuls ; vérifier ensuite `uname -r` et la page
   d'accueil.
2. **Adresse security@** : alias vers la boîte de l'administrateur, chez l'hébergeur de messagerie,
   puis envoi d'un courriel de test. Elle est annoncée dans `/.well-known/security.txt`.
3. **Poste d'administration** : retirer l'entrée `nclsmgr.com` ajoutée au fichier `/etc/hosts`
   pendant la bascule DNS, sans quoi le poste continue de joindre l'origine en direct.

Le certificat d'origine est valable 15 ans. Pour le remplacer, reprendre la section
« Certificat d'origine Cloudflare » ; la clé DNSSEC est gérée et renouvelée par Cloudflare, sans
action tant que la zone y reste. Pour quitter Cloudflare, retirer d'abord l'enregistrement DS chez
le registrar et attendre un jour avant de changer de serveurs de noms.

## Montées de version différées

### PostgreSQL 17 vers 18 (base Umami)

Reportée après le lancement ; Dependabot ne propose plus les versions majeures de PostgreSQL. Les
données ne passent pas d'une version majeure à l'autre, et l'image 18 range la base dans
`/var/lib/postgresql/18/docker` : elle refuse de démarrer sur l'ancien volume monté en
`/var/lib/postgresql/data`. Depuis `/opt/nclsmgr`, en root :

1. **Sauvegarde logique** :
   `docker compose exec -T umami-db pg_dump -U umami -Fc umami > /root/umami-pg17.dump`.
2. **PR** : image `postgres:18-alpine` épinglée par empreinte, et un nouveau volume monté en
   `/var/lib/postgresql` à la place de `umami_db`. Au déploiement, Umami crée un schéma vide.
3. **Restauration** : `docker compose stop umami`, puis
   `docker compose exec -T umami-db pg_restore -U umami -d umami --clean --if-exists < /root/umami-pg17.dump`,
   puis `docker compose start umami`.
4. **Contrôle** : tableau de bord par le tunnel SSH, avec l'historique. Une semaine plus tard,
   `docker volume rm nclsmgr_umami_db` et suppression de la sauvegarde.
