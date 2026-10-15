---
titre: La sécurité dès le cadrage, appliquée à ce site
description: Les arbitrages de sécurité de nclsmgr.com, de l'architecture aux liens privés, expliqués par le chef de projet qui les a faits.
date: 2026-10-15
---

Dans mon métier, la sécurité arrive souvent trop tard. On la découvre en recette, sous forme d'écarts à corriger, quand chaque correction coûte cher. J'ai voulu conduire ce site comme un projet client et faire l'inverse : écrire les exigences de sécurité avant la première ligne de code, puis les vérifier à chaque jalon.

Le site est petit. Les choix, eux, sont les mêmes que sur un grand projet. Le dépôt est public, donc chacun peut vérifier ce qui suit dans le [code source](https://github.com/nic0lasm/nclsmgr.com).

## Partir des exigences, pas des outils

Le premier jalon n'a produit aucun code. Il a fixé les publics visés, l'arborescence, la mécanique de l'espace privé, l'architecture et les exigences de sécurité. Son critère de sortie était simple : choix d'architecture et d'hébergement arrêtés.

Chaque jalon suivant porte un critère vérifiable. Le socle technique n'est clos que lorsque la page d'attente obtient A+ sur Mozilla Observatory et SSL Labs. L'espace privé n'est clos que lorsqu'un lien expiré ou révoqué ne donne plus accès à rien. Ce sont des tests, pas des intentions.

## Réduire ce qu'il y a à défendre

La première décision a été de retirer plutôt que de protéger.

- **Aucun script ni traceur tiers.** Les statistiques passeront par Umami, auto-hébergé et sans cookies.
- **Aucune interface d'administration exposée.** Les liens privés seront gérés par une commande, pas depuis une page web.
- **Aucune coordonnée personnelle en public.** Téléphone, adresse et CV complet sont réservés à l'espace privé.

J'ai écarté un gestionnaire de contenu avec back-office. C'était plus confortable pour publier, mais c'était une page de connexion de plus à défendre, pour un site que je suis seul à modifier.

## Faire travailler le navigateur

### Une CSP stricte, avec nonce

La politique de sécurité du contenu (CSP) dit au navigateur ce qu'il a le droit d'exécuter. La version facile autorise les scripts en ligne avec `'unsafe-inline'`. Elle neutralise une bonne partie de la protection, je l'ai écartée.

À chaque requête, le site tire un nonce aléatoire de 16 octets. Seuls les scripts qui portent ce nonce s'exécutent, et ceux qu'ils chargent eux-mêmes grâce à `'strict-dynamic'`. Le reste est fermé : `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, formulaires limités au site lui-même. L'assouplissement `'unsafe-eval'` n'existe qu'en développement.

Le coût existe : un nonce neuf à chaque requête complique la mise en cache et impose de la rigueur à chaque développement. Je l'accepte, parce qu'une injection de script est le risque le plus probable sur un site de ce type.

### Des en-têtes posés par le frontal

Caddy, le serveur frontal, ajoute les mêmes en-têtes à toutes les réponses : HSTS sur deux ans avec préchargement, `nosniff`, interdiction d'affichage dans un cadre, politique de référent restrictive, caméra, micro, géolocalisation et paiement désactivés, isolation de l'origine. L'en-tête qui annonce le logiciel serveur est retiré, et l'API d'administration de Caddy est désactivée.

Deux réglages viennent de l'actualité. Caddy supprime l'en-tête interne `X-Middleware-Subrequest` avant qu'il n'atteigne Next.js, pour se prémunir de la famille de failles CVE-2025-29927. L'application ne lit qu'un seul en-tête d'adresse IP, posé par Caddy, et jamais `X-Forwarded-For`, que n'importe qui peut forger.

## Cloudflare devant, et seulement Cloudflare

Le DNS, le pare-feu applicatif et le cache passent par Cloudflare. L'arbitrage est clair : j'accepte de dépendre d'un tiers, et en échange le serveur n'a pas à absorber seul le trafic d'internet.

Cela n'a de sens que si on ne peut pas contourner Cloudflare. Une fois le DNS basculé, le trafic web du serveur sera limité, au pare-feu, aux plages d'adresses de Cloudflare, et seul le port 443 est publié. Caddy ne croit l'adresse du visiteur transmise par Cloudflare que si la requête vient bien de ces plages. Un script met la liste à jour chaque semaine depuis les sources officielles, et refuse de l'écrire si elle semble incomplète. Une liste vide fermerait le site ; une liste trop large rouvrirait la porte.

L'étape suivante est déjà prévue : un serveur auto-hébergé derrière Cloudflare Tunnel, sans aucun port ouvert.

## Des liens privés qui ne valent rien s'ils fuient

Chaque interlocuteur reçoit un lien personnel, expirable et révocable. C'est la partie la plus sensible du site, et celle où j'ai le plus arbitré.

- **Le jeton n'est jamais stocké.** Il fait 256 bits aléatoires. La base ne garde que son empreinte SHA-256. Une copie de la base ne permet d'ouvrir aucun lien.
- **Pas de hachage lent.** Il sert pour des mots de passe choisis par des humains. Un secret déjà aléatoire sur 256 bits n'en a pas besoin, et la vérification reste rapide.
- **Le jeton est échangé contre une session.** Le cookie porte le préfixe `__Host-`, qui impose HTTPS et interdit le partage entre sous-domaines. La session tombe après 14 jours d'inactivité.
- **La révocation est immédiate.** Révoquer un lien ferme toutes ses sessions dans la même transaction.
- **L'échec ne renseigne pas.** Jeton inconnu, expiré ou révoqué : le visiteur reçoit la même réponse.

Les données suivent la même logique. Un lien dure 30 jours par défaut, 180 au plus. Le journal des consultations est purgé après 90 jours, les courriels de notification après 7. Les lignes supprimées sont écrasées dans le fichier, pas seulement délistées. Ces durées sont celles annoncées dans la politique de confidentialité, et le code les applique.

## Une chaîne de livraison qu'on peut auditer

Un site sûr le jour de sa mise en ligne peut cesser de l'être un mois plus tard. J'ai donc traité la chaîne de livraison comme une partie du produit.

- **Chaque changement passe les mêmes contrôles** : format, analyse statique, types, tests unitaires, tests de bout en bout, validation de la configuration Caddy.
- **Le code est analysé par CodeQL** à chaque changement et chaque semaine, avec les règles de sécurité étendues.
- **Les actions GitHub sont figées par empreinte de commit**, pas par numéro de version qu'un tiers pourrait déplacer.
- **Dependabot suit chaque semaine** les dépendances, les images Docker, le fichier Compose et les actions. Les montées de version majeure de Node se font à la main.
- **L'image n'est étiquetée qu'après analyse.** Elle est publiée par empreinte, avec SBOM et provenance, puis analysée par Trivy. Une vulnérabilité critique ou haute corrigeable bloque la publication.
- **La clé de déploiement ne sait faire qu'une chose.** Sur le serveur, elle est liée à une commande forcée qui n'accepte qu'une étiquette de 12 caractères hexadécimaux.

## Des images qui ne contiennent que l'utile

L'image de production est construite en plusieurs étapes. L'image de base est épinglée par empreinte. Les outils inutiles à l'exécution, comme npm, sont supprimés. L'application tourne sous un compte non privilégié, sur un système de fichiers en lecture seule, sans aucune capacité Linux. Le conteneur web n'est joignable que par un réseau interne : seul Caddy est exposé.

En intégration continue, l'image est démarrée avec ces mêmes restrictions avant d'être acceptée. Si elle ne tient pas en lecture seule, je le sais avant la production.

Les images sont produites pour amd64 et arm64, chacune sur une machine native. L'émulation rendait la construction trop lente, et l'arm64 prépare la migration vers le serveur auto-hébergé.

## Ce que j'en retiens

Rien de tout cela n'est exotique. La différence tient au moment où les décisions sont prises. Écrites au cadrage, elles coûtent quelques lignes de configuration. Découvertes en audit, elles coûtent un report de jalon.

Le socle est encore en cours de construction, et un audit de sécurité complet est prévu avant le lancement. J'en publierai les écarts et leurs corrections. Le reste de la démarche est décrit dans l'étude de cas du [portfolio](/portfolio).
