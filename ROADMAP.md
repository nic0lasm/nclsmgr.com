# Feuille de route

Chaque étape a un objectif, des livrables et un critère de sortie. Une étape n'est close que lorsque son critère est vérifié. Le suivi détaillé se fait dans les [jalons GitHub](../../milestones).

## Lancé le 30 octobre 2026

Le site est en ligne sur https://nclsmgr.com, derrière Cloudflare, et redéployé automatiquement à chaque fusion sur `main`.

- [x] Cadrage : objectifs, publics, arborescence, architecture et exigences de sécurité
- [x] Serveur durci en France : SSH par clé uniquement, pare-feu, bannissement automatique, mises à jour automatiques
- [x] DNS signé par DNSSEC, certificat d'origine Cloudflare en Full (strict), ports web du serveur réservés aux plages Cloudflare
- [x] Next.js, Docker Compose et Caddy ; chaîne GitHub Actions avec tests, analyse de code, analyse des images et déploiement
- [x] Charte graphique ; Accueil, CV, Portfolio, Dev, Articles, Contact, mentions légales et confidentialité, en français et en anglais
- [x] Espace privé : liens personnels avec expiration et révocation, profils, documents réservés, journal des consultations, limitation de débit
- [x] Statistiques Umami auto-hébergées, fichier security.txt et adresse security@nclsmgr.com
- [x] Sauvegardes chiffrées hors site, restauration testée lors du changement de serveur, alertes de disponibilité
- [x] A+ sur Mozilla Observatory et sur SSL Labs, vérifiés par un audit externe automatique avec les pages du plan du site
- [x] Image d'aperçu pour le partage des liens, en français et en anglais
- [x] Rubrique Articles ouverte avec un premier article
- [x] Relecture finale des textes, envoi réel par le formulaire de contact, relecture sur iPhone
- [x] Jeu [Frontfall](https://github.com/nic0lasm/frontfall) servi sous https://nclsmgr.com/frontfall/, dans un projet séparé du site

## En cours

- [ ] Lien de test de l'espace privé ouvert sous Safari (Mac et iPhone) et Firefox, puis révoqué
- [ ] Page introuvable lisible sans JavaScript : le serveur répond bien 404, mais le texte n'apparaît qu'une fois la page chargée

**Critère de sortie** : un lien valide affiche le bon profil et ses documents sur chaque navigateur, un lien expiré ou révoqué ne donne plus accès à rien.

## Ensuite

Faire vivre le site sans effort.

- [ ] Certifications ajoutées au CV
- [ ] Un article par mois sur les sujets d'expertise
- [ ] Revue mensuelle : mises à jour, redémarrage sur le dernier noyau, alertes de sécurité, test de restauration des sauvegardes
- [ ] Fiches de l'onglet Dev tenues à jour à chaque nouvelle version des projets
- [ ] Migration vers un serveur auto-hébergé derrière Cloudflare Tunnel, sans port ouvert
