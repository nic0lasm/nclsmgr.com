# nclsmgr.com

Code source de mon site personnel, [nclsmgr.com](https://nclsmgr.com).

Je suis chef de projet cyber et souveraineté numérique. Je pilote des projets pour les ministères régaliens et le secteur public : développement applicatif, analyses de risques cyber, études d'architecture et cloud de confiance. Ce site présente cette expertise aux décideurs publics et à mes pairs.

Le dépôt est public par choix : la façon dont un site est conçu, sécurisé et maintenu en dit autant que ce qu'il affiche.

## État du projet

Le site est en ligne depuis le 15 octobre 2026 et ouvre officiellement le 5 novembre 2026, avec la rubrique Articles.

- Pages publiques en français et en anglais, espace privé sur lien personnel.
- A+ sur [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory/analyze?host=nclsmgr.com) et sur [SSL Labs](https://www.ssllabs.com/ssltest/analyze.html?d=nclsmgr.com).
- Audit de sécurité avant lancement mené en octobre 2026 : aucun écart de gravité élevée, écarts moyens et faibles corrigés ([#23](../../issues/23)).
- Sauvegardes chiffrées hors site, restauration testée chaque mois, sondes de disponibilité.

Les étapes restantes et leurs critères de sortie sont dans [ROADMAP.md](ROADMAP.md).

## Contenu du site

| Rubrique     | Contenu                                                                    | Accès              |
| ------------ | -------------------------------------------------------------------------- | ------------------ |
| Accueil      | Présentation courte, sécurité du site, référentiels suivis, code source    | Public             |
| CV           | Présentation, parcours, compétences cyber et souveraineté, formations      | Public             |
| Portfolio    | Études de cas anonymisées, classées par thème                              | Public             |
| Articles     | Notes d'expertise sur le pilotage, la cybersécurité et la souveraineté     | Au lancement       |
| Contact      | Formulaire auto-hébergé                                                    | Public             |
| Dev          | Projets personnels et dépôts publics, dans le menu principal               | Public             |
| Frontfall    | Jeu de stratégie multijoueur, publié depuis son propre dépôt               | Public             |
| Espace privé | Version du site adaptée à son destinataire, avec documents complémentaires | Sur lien personnel |

Le site est rédigé en français et en anglais. L'espace privé s'ouvre par un lien personnel que je transmets moi-même, valable pour une durée limitée et révocable à tout moment.

## Principes de sécurité

- **Surface d'attaque minimale** : aucun script ni traceur tiers, aucune interface d'administration de ce site exposée, ports web du serveur réservés à Cloudflare.
- **Navigateur durci** : CSP stricte avec nonce, HSTS et en-têtes de sécurité complets.
- **TLS et DNS** : TLS 1.2 au minimum, certificat d'origine vérifié par Cloudflare (Full strict), zone DNS signée par DNSSEC.
- **Cloisonnement** : conteneurs en lecture seule et sans privilège ; l'application tourne sur un réseau interne sans accès sortant, seul un service d'envoi séparé détient les accès à la messagerie. Le jeu [Frontfall](https://github.com/nic0lasm/frontfall) tourne dans son propre projet Compose, sur un réseau sans accès sortant, et se déploie par une clé qui ne peut lancer qu'une commande.
- **Données maîtrisées** : statistiques auto-hébergées sans cookies, coordonnées réservées à l'espace privé, aucune donnée personnelle ni secret dans ce dépôt.
- **Chaîne de livraison surveillée** : actions épinglées par empreinte, dépendances suivies, analyse du code et des images à chaque modification.
- **Exploitation** : SSH par clé uniquement, pare-feu, bannissement automatique, mises à jour de sécurité automatiques, journaux conservés 30 jours, sauvegardes chiffrées avant envoi.

Une faille ? Voir [SECURITY.md](SECURITY.md).

## Référentiels

Le site n'est certifié par aucun organisme. « Appliqué » désigne une exigence mise en œuvre et contrôlée, « inspiré de » une démarche reprise sans prétendre à une conformité complète.

| Référentiel                                        | Niveau     |
| -------------------------------------------------- | ---------- |
| ANSSI, déploiement de conteneurs Docker            | Inspiré de |
| ANSSI, configuration d'un système GNU/Linux        | Inspiré de |
| ANSSI, recommandations de sécurité relatives à TLS | Inspiré de |
| OWASP ASVS et fiches de l'OWASP                    | Inspiré de |
| ISO/IEC 27001, mesures de l'annexe A               | Inspiré de |
| WCAG 2.1, niveau AA                                | Inspiré de |
| RGPD                                               | Appliqué   |
| Content Security Policy niveau 3 (W3C)             | Appliqué   |
| HSTS (RFC 6797) et DNSSEC                          | Appliqué   |
| security.txt (RFC 9116)                            | Appliqué   |

Le détail de chaque mesure figure sur la [page d'accueil du site](https://nclsmgr.com).

## Architecture

```
Visiteur ─► Cloudflare (DNS, proxy, pare-feu)
              └─► Serveur : Caddy (HTTPS, en-têtes)
                    ├─► web : Next.js ─► SQLite (espace privé)
                    ├─► courrier : envoi des messages
                    ├─► frontfall : jeu, projet Compose séparé
                    └─► Umami ─► PostgreSQL (statistiques)

Serveur ─► restic (chiffrement local) ─► Cloudflare R2, juridiction UE (sauvegardes)

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
| Sauvegardes | restic vers Cloudflare R2, test de restauration mensuel |

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

## Contribution et licence

Ce dépôt sert un site personnel : je n'y attends pas de contribution, mais une erreur signalée par un ticket est toujours bienvenue. Les vulnérabilités suivent [SECURITY.md](SECURITY.md).

Le code source est publié sous [licence MIT](LICENSE). Elle ne couvre que le code : les textes, images et autres contenus du site, notamment ceux de `src/content/`, restent tous droits réservés. Les polices embarquées dans `src/app/fonts/` gardent leur propre licence, la SIL Open Font License.
