# Feuille de route

Chaque jalon a un objectif, des livrables et un critère de sortie. Un jalon n'est clos que lorsque son critère est vérifié. Le suivi détaillé se fait dans les [jalons GitHub](../../milestones).

## Jalon 0 : Cadrage · terminé le 15 octobre 2026

Définir ce que le site doit accomplir avant d'écrire une ligne de code.

- [x] Objectifs, publics visés et arborescence
- [x] Mécanique de l'espace privé
- [x] Architecture, hébergement et exigences de sécurité
- [x] Plan de mise en ligne par jalons

**Critère de sortie** : choix d'architecture et d'hébergement arrêtés.

## Jalon 1 : Socle sécurisé · 21 octobre 2026

Disposer d'une infrastructure saine avant d'y publier quoi que ce soit.

- [ ] Serveur durci : SSH par clé uniquement, pare-feu, bannissement automatique, mises à jour automatiques
- [ ] DNS du domaine géré par Cloudflare, trafic web du serveur limité à Cloudflare
- [ ] Squelette Next.js, Docker Compose et Caddy
- [ ] Chaîne GitHub Actions : build, tests, analyse de code, analyse des images, déploiement
- [ ] Sauvegardes chiffrées hors site et alerte de disponibilité
- [ ] Page d'attente en ligne

**Critère de sortie** : la page d'attente est servie en HTTPS et obtient A+ sur Mozilla Observatory et SSL Labs.

## Jalon 2 : Vitrine publique · 28 octobre 2026

Publier l'essentiel en français.

- [ ] Charte graphique sobre et composants de base
- [ ] Accueil
- [ ] CV, avec version PDF réservée à l'espace privé
- [ ] Dev : projets mis en avant, puis liste des dépôts publics
- [ ] Portfolio : études de cas, projets personnels, réalisations visuelles
- [ ] Contact : formulaire auto-hébergé avec protection anti-spam
- [ ] Mentions légales et politique de confidentialité

**Critère de sortie** : toutes les pages publiques sont relues et validées, accessibles au clavier et sans erreur de liens.

## Jalon 3 : Espace privé · 3 novembre 2026

Adapter le site à chaque interlocuteur.

- [ ] Création, expiration et révocation des liens personnels
- [ ] Profils recruteur, développeur, client et partenaire
- [ ] Message d'accueil personnalisé et mise en avant adaptée au profil
- [ ] Documents complémentaires (CV complet, coordonnées, guide de contribution)
- [ ] Journal des consultations
- [ ] Limitation de débit et tests de sécurité dédiés

**Critère de sortie** : un lien expiré ou révoqué ne donne plus accès à rien, et aucun contenu privé n'est accessible sans session valide.

## Jalon 4 : Lancement · 5 novembre 2026

Ouvrir le site au public.

- [ ] Version anglaise
- [ ] Statistiques Umami auto-hébergées
- [ ] Fichier security.txt
- [ ] Audit de sécurité complet et correction des écarts
- [ ] Recette sur mobile et ordinateur

**Critère de sortie** : A+ sur Mozilla Observatory et SSL Labs, aucune vulnérabilité critique ou haute connue, contenus validés.

## Jalon 5 : Autonomie · 2027

Faire durer le site sans effort.

- [ ] Rubrique Articles
- [ ] Migration vers un serveur auto-hébergé derrière Cloudflare Tunnel, sans port ouvert
- [ ] Revue mensuelle : mises à jour, alertes de sécurité, test de restauration des sauvegardes
