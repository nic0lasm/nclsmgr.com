# Feuille de route

Chaque étape a un objectif, des livrables et un critère de sortie. Une étape n'est close que lorsque son critère est vérifié. Le suivi détaillé se fait dans les [jalons GitHub](../../milestones).

## Déjà livré · 15 octobre 2026

Le site est en ligne sur https://nclsmgr.com, derrière Cloudflare, et redéployé automatiquement à chaque fusion sur `main`.

- [x] Cadrage : objectifs, publics, arborescence, architecture et exigences de sécurité
- [x] Serveur durci : SSH par clé uniquement, pare-feu, bannissement automatique, mises à jour automatiques
- [x] DNS géré par Cloudflare, ports web du serveur réservés aux plages Cloudflare
- [x] Next.js, Docker Compose et Caddy ; chaîne GitHub Actions avec tests, analyse de code, analyse des images et déploiement
- [x] Charte graphique, Accueil, CV, Dev, Portfolio, Contact, mentions légales et confidentialité, en français et en anglais
- [x] Espace privé : liens personnels avec expiration et révocation, profils, documents réservés, journal des consultations, limitation de débit
- [x] Statistiques Umami auto-hébergées et fichier security.txt
- [x] A+ sur Mozilla Observatory et sur SSL Labs

Le reste du chemin jusqu'au lancement tient en trois étapes. Aucune nouvelle fonctionnalité n'est prévue d'ici là.

## Étape 1 : Relecture et recette · 22 octobre 2026

Valider chaque texte publié et le comportement de chaque page.

- [ ] Relecture de toutes les pages publiques, en français puis en anglais
- [ ] Corrections de contenu issues de la relecture
- [ ] Recette sur ordinateur et sur mobile : liens, affichage, navigation au clavier
- [ ] Envoi réel d'un message par le formulaire de contact

**Critère de sortie** : toutes les pages publiques sont relues et validées, accessibles au clavier et sans lien cassé.

## Étape 2 : Espace privé en service · 29 octobre 2026

Rendre l'espace privé utilisable avec de vraies données.

- [ ] Coordonnées et références déposées sur le serveur, hors du dépôt
- [ ] CV complet en PDF, français et anglais, déposé sur le serveur
- [ ] Lien de test ouvert sous Safari (Mac et iPhone) et Firefox, puis révoqué

**Critère de sortie** : un lien valide affiche le bon profil et ses documents, un lien expiré ou révoqué ne donne plus accès à rien.

## Étape 3 : Fin de sécurisation et lancement · 5 novembre 2026

Fermer les derniers écarts avant d'ouvrir le site au public.

- [ ] Certificat d'origine Cloudflare installé et chiffrement en Full (strict)
- [ ] DNSSEC réactivé via Cloudflare
- [ ] Redémarrage du serveur sur le dernier noyau
- [ ] Adresse security@nclsmgr.com opérationnelle
- [ ] Sauvegardes chiffrées hors site et alerte de disponibilité
- [ ] Audit de sécurité complet et correction des écarts

**Critère de sortie** : A+ sur Mozilla Observatory et SSL Labs en Full (strict), aucune vulnérabilité critique ou haute connue, sauvegarde restaurée avec succès.

## Après le lancement

Faire vivre le site sans effort.

- [ ] Rubrique Articles et premier article
- [ ] Certifications ajoutées au CV
- [ ] Revue mensuelle : mises à jour, alertes de sécurité, test de restauration des sauvegardes
- [ ] Migration vers un serveur auto-hébergé derrière Cloudflare Tunnel, sans port ouvert
