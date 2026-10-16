# Exploitation du serveur

Les scripts de ce dossier se lancent en root sur le serveur, depuis une copie du dépôt figée sur un
commit précis. Forme générale, depuis le poste d'administration :

```sh
ssh -t debian@<serveur> "set -e; d=\$(mktemp -d); curl -fsSL https://codeload.github.com/nic0lasm/nclsmgr.com/tar.gz/<commit> | tar -xz -C \$d --strip-components=1; sudo sh \$d/deploy/serveur/<script> <arguments>"
```

Le déploiement courant ne passe pas par ces scripts : GitHub Actions publie l'image puis appelle
`deployer.sh` par une clé SSH à commande forcée.

## Mise en place, dans l'ordre

| Étape                    | Script                                              | Prérequis                       |
| ------------------------ | --------------------------------------------------- | ------------------------------- |
| 1. Compte de déploiement | `installer-deploiement.sh "<clé publique>"`         | Serveur durci, Docker installé  |
| 2. Certificat d'origine  | `installer-certificat.sh demande`, puis `installer` | Zone Cloudflare active          |
| 3. Envoi de courriels    | `configurer-smtp.sh`                                | Compte de messagerie du domaine |
| 4. Compte `liens`        | `installer-liens.sh "<clé publique dédiée>"`        | Service courrier déployé        |
| 5. Mesure d'audience     | `installer-statistiques.sh`                         | Premier déploiement fait        |
| 6. Sauvegardes           | `installer-sauvegarde.sh`                           | Bucket R2 et jeton S3           |
| 7. Origine fermée        | `restreindre-origine.sh`                            | Full (strict), aucun AAAA       |

Tous sont idempotents, sauf `installer-certificat.sh` qui remplace le certificat à chaque appel.

## Certificat d'origine Cloudflare

L'étape 1 pose un certificat provisoire auto-signé, valable 30 jours, qui suffit tant que le DNS
ne pointe pas encore vers le serveur. En mode SSL **Full (strict)**, Cloudflare le refuse
(erreur 526) : il faut le remplacer par un certificat d'origine Cloudflare. La clé privée est créée
sur le serveur et n'en sort jamais.

1. **Demande.** Lancer `installer-certificat.sh demande` et copier le bloc affiché, de
   `-----BEGIN CERTIFICATE REQUEST-----` à `-----END CERTIFICATE REQUEST-----` inclus.
2. **Signature.** Cloudflare, SSL/TLS › Origin Server › **Create Certificate** :
   « Use my private key and CSR », coller la demande, noms `nclsmgr.com` et `www.nclsmgr.com`,
   validité 15 ans, format PEM. Copier le certificat affiché.
3. **Installation.** Lancer `installer-certificat.sh installer`, coller le certificat, puis Entrée
   et Ctrl-D. Le script vérifie l'émetteur, les deux noms et la correspondance avec la clé en
   attente, redémarre Caddy et revient à l'ancien certificat si le site ne répond plus.
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

## Reste à faire avant le lancement

État au 16 octobre 2026 : site servi derrière Cloudflare, origine fermée aux autres adresses,
Mozilla Observatory et SSL Labs à A+. Le suivi d'ensemble est dans [ROADMAP.md](../../ROADMAP.md),
chantier 3. Pour reprendre, dans cet ordre :

1. **Certificat d'origine**, puis **Full (strict)** : section ci-dessus. Tant qu'il n'est pas
   posé, Cloudflare reste en Full (non strict) car le certificat provisoire est auto-signé.
2. **Contrôle externe** : lancer le workflow _Audit externe_ à la main, puis créer la variable de
   dépôt `SURVEILLANCE_ACTIVE` à `true` pour l'exécution mensuelle.
3. **DNSSEC** : Cloudflare, DNS › Settings › **Enable DNSSEC**, puis reporter l'enregistrement DS
   affiché chez le registrar. Retiré chez l'ancien hébergeur DNS lors de la bascule.
4. **Noyau** : redémarrer le serveur (`sudo reboot`) pour charger le dernier noyau installé. Les
   conteneurs et le filtre d'origine repartent seuls ; vérifier ensuite `uname -r` et la page
   d'accueil.
5. **Adresse security@** : alias vers la boîte de l'administrateur, chez l'hébergeur de messagerie,
   puis envoi d'un courriel de test. Elle est annoncée dans `/.well-known/security.txt`.
6. **Sauvegardes** : bucket R2 dédié et jeton S3 limité à ce bucket, puis
   `installer-sauvegarde.sh`. Le test de restauration mensuel s'installe avec.
7. **Poste d'administration** : retirer l'entrée `nclsmgr.com` ajoutée au fichier `/etc/hosts`
   pendant la bascule DNS, sans quoi le poste continue de joindre l'origine en direct.
8. **En-têtes de localisation** : vérifier dans Cloudflare, Rules › Settings, que _Add visitor
   location headers_ est actif (pays du journal de l'espace privé).
