# nclsmgr.com

Code source de mon site personnel, [nclsmgr.com](https://nclsmgr.com).

Je suis chef de projet cyber et souveraineté numérique. Je pilote des projets pour les ministères régaliens et le secteur public : développement applicatif, analyses de risques cyber, études d'architecture et cloud de confiance. Ce site présente cette expertise aux décideurs publics et à mes pairs.

Le dépôt est public par choix : la façon dont un site est conçu, sécurisé et maintenu en dit autant que ce qu'il affiche.

## Contenu du site

| Rubrique     | Contenu                                                                    | Accès              |
| ------------ | -------------------------------------------------------------------------- | ------------------ |
| Accueil      | Positionnement, chiffres clés, domaines d'intervention                     | Public             |
| CV           | Parcours, compétences cyber et souveraineté, formations                    | Public             |
| Portfolio    | Études de cas anonymisées, classées par thème                              | Public             |
| Articles     | Notes d'expertise sur le pilotage, la cybersécurité et la souveraineté     | Au lancement       |
| Contact      | Formulaire auto-hébergé                                                    | Public             |
| Dev          | Projets personnels et dépôts publics, accessibles depuis le pied de page   | Public             |
| Espace privé | Version du site adaptée à son destinataire, avec documents complémentaires | Sur lien personnel |

Le site est rédigé en français et en anglais. L'espace privé s'ouvre par un lien personnel que je transmets moi-même, valable pour une durée limitée et révocable à tout moment.

## Principes de sécurité

- **Surface d'attaque minimale** : aucun script ni traceur tiers, aucune interface d'administration exposée, ports web du serveur réservés à Cloudflare.
- **Navigateur durci** : CSP stricte avec nonce, HSTS et en-têtes de sécurité complets. A+ sur Mozilla Observatory et SSL Labs.
- **Cloisonnement** : l'application tourne sur un réseau interne sans accès sortant ; seul un service d'envoi séparé détient les accès à la messagerie.
- **Données maîtrisées** : statistiques auto-hébergées sans cookies, coordonnées réservées à l'espace privé, aucune donnée personnelle ni secret dans ce dépôt.
- **Chaîne de livraison surveillée** : actions épinglées, dépendances suivies, analyse du code et des images à chaque modification.
- **Serveur durci** : SSH par clé uniquement, pare-feu, bannissement automatique, mises à jour de sécurité automatiques.

Une faille ? Voir [SECURITY.md](SECURITY.md).

## Architecture

```
Visiteur ─► Cloudflare (DNS, proxy, pare-feu)
              └─► Serveur : Caddy (HTTPS, en-têtes)
                    ├─► web : Next.js ─► SQLite (espace privé)
                    ├─► courrier : envoi des messages
                    └─► Umami ─► PostgreSQL (statistiques)

GitHub ─► GitHub Actions (tests, analyses, image) ─► déploiement
```

| Brique      | Choix                                                   |
| ----------- | ------------------------------------------------------- |
| Application | Next.js, React et TypeScript strict, contenus bilingues |
| Exécution   | Docker Compose, images amd64 et arm64                   |
| Frontal     | Caddy, derrière Cloudflare                              |
| Données     | SQLite pour l'espace privé, PostgreSQL pour Umami       |
| Qualité     | ESLint, Prettier, Vitest, Playwright et axe             |
| Livraison   | GitHub Actions, CodeQL, Trivy, déploiement après fusion |

## Lancer le site en local

Prérequis : Node.js 24 (voir `.nvmrc`) et pnpm, activable avec `corepack enable`.

```sh
pnpm install
pnpm dev
```

Le site répond sur http://localhost:3000. Avant toute proposition de modification :

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Déploiement

Chaque fusion sur `main` construit l'image, l'analyse puis la déploie sur le serveur. L'installation et l'exploitation du serveur sont décrites dans [deploy/serveur/README.md](deploy/serveur/README.md).

## Feuille de route

Le site est en ligne et ouvre officiellement le 5 novembre 2026. Les étapes et leurs critères de sortie sont dans [ROADMAP.md](ROADMAP.md).

## Contribution et licence

Ce dépôt sert un site personnel : je n'y attends pas de contribution, mais une erreur signalée par un ticket est toujours bienvenue. Les vulnérabilités suivent [SECURITY.md](SECURITY.md).

Aucune licence n'est accordée pour l'instant : le code reste consultable, sa réutilisation demande mon accord.
