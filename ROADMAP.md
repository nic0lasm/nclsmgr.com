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

Le chemin jusqu'au lancement tient en quatre chantiers.

## Chantier 1 : Repositionnement du site · livré le 16 octobre 2026

Recentrer le site sur le pilotage de projets cyber et la souveraineté numérique, pour des décideurs du secteur public.

- [x] Accueil : intitulé, phrase clé, résumé et chiffres clés revus
- [x] CV : parcours complet, compétences cyber et souveraineté (analyse de risques, architecture, cloud qualifié, solutions sur site)
- [x] Portfolio refait par thème, avec des études de cas anonymisées
- [x] Navigation : Dev sort du menu principal, accessible depuis le pied de page et le portfolio
- [x] Référencement et aperçu de partage alignés sur le nouveau positionnement
- [x] Version anglaise retraduite après validation du français
- [x] CV PDF français et anglais régénérés
- [ ] Rubrique Articles et premier article d'expertise, prêts et publiés le jour du lancement

**Critère de sortie** : les textes français et anglais sont validés et publiés.

## Chantier 2 : Espace privé en service · 29 octobre 2026

Rendre l'espace privé utilisable avec de vraies données.

- [ ] Coordonnées et références déposées sur le serveur, hors du dépôt
- [ ] CV complet en PDF, français et anglais, déposé sur le serveur
- [ ] Lien de test ouvert sous Safari (Mac et iPhone) et Firefox, puis révoqué

**Critère de sortie** : un lien valide affiche le bon profil et ses documents, un lien expiré ou révoqué ne donne plus accès à rien.

## Chantier 3 : Fin de sécurisation · avant le 5 novembre 2026

Fermer les derniers écarts de sécurité. Le chantier a repris le 17 octobre 2026.

- [x] Certificat d'origine Cloudflare installé et chiffrement en Full (strict)
- [x] DNSSEC réactivé via Cloudflare
- [ ] Redémarrage du serveur sur le dernier noyau
- [ ] Adresse security@nclsmgr.com opérationnelle
- [ ] Sauvegardes chiffrées hors site et alerte de disponibilité
- [x] Audit de sécurité complet et correction des écarts

**Critère de sortie** : A+ sur Mozilla Observatory et SSL Labs en Full (strict), aucune vulnérabilité critique ou haute connue, sauvegarde restaurée avec succès.

## Chantier 4 : Recette et lancement · 5 novembre 2026

Vérifier le site refait avant de l'annoncer.

- [ ] Relecture finale de toutes les pages, en français puis en anglais, vers le 29 octobre
- [x] Recette technique sur ordinateur et sur mobile : liens, affichage, navigation au clavier, accessibilité
- [ ] Contrôle sur de vrais appareils : Safari sur Mac et iPhone, Firefox
- [ ] Envoi réel d'un message par le formulaire de contact
- [ ] Le 5 novembre : ouverture de la rubrique Articles avec son premier article, puis contrôle après déploiement

**Critère de sortie** : toutes les pages publiques sont relues et validées, accessibles au clavier et sans lien cassé.

## Après le lancement

Faire vivre le site sans effort.

- [ ] Certifications ajoutées au CV
- [ ] Un article par mois sur les sujets d'expertise
- [ ] Revue mensuelle : mises à jour, alertes de sécurité, test de restauration des sauvegardes
- [ ] Migration vers un serveur auto-hébergé derrière Cloudflare Tunnel, sans port ouvert
