# nclsmgr.com

Code source de mon site personnel : parcours, projets, réalisations, et un espace privé pour les échanges ciblés.

Je suis chef de projet cyber et souveraineté numérique. Ce dépôt est public par choix : la façon dont un site est conçu, sécurisé et maintenu en dit autant que ce qu'il affiche.

## Ambition

- **Présenter un parcours vérifiable.** Un CV clair, des projets dont le code est consultable, des études de cas qui montrent la conduite de projet en situation réelle.
- **Appliquer à petite échelle les standards défendus à grande échelle.** Sécurité dès la conception, traçabilité des changements, sobriété technique, jalons et critères de sortie explicites.
- **Adapter le site à chaque interlocuteur.** Recruteur, développeur, client ou partenaire reçoit un lien personnel, expirable et révocable, qui met en avant ce qui le concerne.
- **Rester simple à faire évoluer et à héberger.** Le même déploiement tourne sur un VPS aujourd'hui et sur un serveur auto-hébergé demain.

## Contenu du site

| Rubrique     | Contenu                                                                       | Accès              |
| ------------ | ----------------------------------------------------------------------------- | ------------------ |
| Accueil      | Positionnement, faits marquants, accès rapides                                | Public             |
| CV           | Parcours, compétences, certifications, formations                             | Public             |
| Dev          | Projets mis en avant avec fiche détaillée, puis l'ensemble des dépôts publics | Public             |
| Portfolio    | Études de cas de projets pilotés, projets personnels, réalisations visuelles  | Public             |
| Contact      | Formulaire auto-hébergé, LinkedIn                                             | Public             |
| Articles     | Retours d'expérience et notes techniques                                      | À venir            |
| Espace privé | Version du site adaptée au destinataire, documents complémentaires            | Sur lien personnel |

Le site est disponible en français et en anglais.

## Principes de sécurité

- **Surface d'attaque minimale** : pages publiques générées à l'avance, aucun script ni traceur tiers, aucune interface d'administration exposée.
- **Durcissement du navigateur** : CSP stricte, HSTS, en-têtes de sécurité complets. Objectif A+ sur Mozilla Observatory et SSL Labs.
- **Liens privés robustes** : jeton aléatoire de 256 bits conservé uniquement sous forme d'empreinte, échangé contre une session sécurisée, expirable et révocable, jamais indexé.
- **Données maîtrisées** : statistiques auto-hébergées sans cookies, coordonnées réservées à l'espace privé, aucune donnée personnelle sensible dans ce dépôt.
- **Chaîne de livraison surveillée** : dépendances suivies, analyse de code et des images à chaque build, aucun secret dans l'historique.
- **Serveur durci** : accès SSH par clé uniquement, pare-feu, bannissement automatique, mises à jour de sécurité automatiques, sauvegardes chiffrées hors site.

Une faille ? Voir [SECURITY.md](SECURITY.md).

## Architecture

```
Visiteur ─► Cloudflare (DNS, pare-feu, cache)
              └─► Serveur : Caddy (HTTPS, en-têtes)
                    ├─► Site Next.js ─► SQLite (liens privés, visites)
                    └─► Umami ─► PostgreSQL (statistiques)

GitHub ─► GitHub Actions (build, tests, analyses) ─► déploiement
```

| Brique      | Choix                                             |
| ----------- | ------------------------------------------------- |
| Application | Next.js, TypeScript, contenus MDX bilingues       |
| Exécution   | Docker Compose, images amd64 et arm64             |
| Frontal     | Caddy, derrière Cloudflare                        |
| Données     | SQLite pour l'espace privé, PostgreSQL pour Umami |
| Livraison   | GitHub Actions, déploiement continu après revue   |

## Feuille de route

Le projet avance par jalons, chacun avec un critère de sortie vérifiable. Détail dans [ROADMAP.md](ROADMAP.md).

| Jalon               | Objectif                                                | Échéance     | État     |
| ------------------- | ------------------------------------------------------- | ------------ | -------- |
| 0. Cadrage          | Besoins, architecture, choix techniques                 | 15 oct. 2026 | Terminé  |
| 1. Socle sécurisé   | Serveur durci, DNS, chaîne de livraison, page d'attente | 21 oct. 2026 | En cours |
| 2. Vitrine publique | Accueil, CV, Dev, Portfolio, Contact                    | 28 oct. 2026 | À venir  |
| 3. Espace privé     | Liens personnels, profils, suivi des consultations      | 3 nov. 2026  | À venir  |
| 4. Lancement        | Version anglaise, statistiques, audit de sécurité       | 5 nov. 2026  | À venir  |
| 5. Autonomie        | Articles, migration vers un serveur auto-hébergé        | 2027         | À venir  |
