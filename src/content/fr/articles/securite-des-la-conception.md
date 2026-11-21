---
titre: La sécurité dès le cadrage, appliquée à ce site
description: Les arbitrages de sécurité de nclsmgr.com, de l'architecture aux liens privés, expliqués par le chef de projet qui les a faits.
date: 2026-11-19
statut: valide
---

Dans mon métier, la sécurité arrive souvent trop tard. On la découvre en recette, sous forme d'écarts à corriger, quand chaque correction coûte cher. J'ai conduit ce site comme un projet client pour faire l'inverse : écrire les exigences de sécurité avant la première ligne de code, puis les vérifier à chaque jalon.

Le site est petit. Les choix, eux, sont ceux d'un grand projet. Le dépôt est public : chacun peut vérifier ce qui suit dans le [code source](https://github.com/nic0lasm/nclsmgr.com).

## Partir des exigences, pas des outils

Le premier jalon n'a produit aucun code. Il a fixé les publics visés, l'arborescence, le fonctionnement de l'espace privé, l'architecture et les exigences de sécurité. Son critère de sortie tenait en une phrase : choix d'architecture et d'hébergement arrêtés.

Chaque jalon suivant avait un critère vérifiable. Le socle technique n'a été clos qu'avec la note A+ sur Mozilla Observatory et sur SSL Labs. L'espace privé n'a été clos qu'une fois démontré qu'un lien expiré ou révoqué ne donnait plus accès à rien. Ce sont des tests, pas des intentions.

## Réduire ce qu'il y a à défendre

La première décision a été de retirer plutôt que de protéger.

- **Aucun script ni traceur tiers.** Les statistiques passent par Umami, hébergé sur le même serveur et sans cookies. Son tableau de bord n'est joignable que par un tunnel SSH.
- **Aucune interface d'administration exposée.** Les liens privés se créent et se révoquent par une commande lancée sur le serveur, pas depuis une page web.
- **Aucune coordonnée personnelle en public.** Le CV complet est réservé à l'espace privé.

J'ai écarté un gestionnaire de contenu avec back-office. Il aurait rendu la publication plus confortable, mais il ajoutait une page de connexion à défendre, pour un site que je suis seul à modifier.

## Faire travailler le navigateur

### Une CSP stricte, avec nonce

La politique de sécurité du contenu (CSP) indique au navigateur ce qu'il a le droit d'exécuter. La version facile autorise les scripts en ligne avec `'unsafe-inline'`, ce qui neutralise une bonne partie de la protection. Je l'ai écartée.

À chaque requête, le site tire un nonce aléatoire de 16 octets. Seuls les scripts qui portent ce nonce s'exécutent, avec ceux qu'ils chargent eux-mêmes grâce à `'strict-dynamic'`. Le reste est fermé : `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, formulaires limités au site lui-même.

Cela a un coût : un nonce neuf à chaque requête complique la mise en cache et demande de la rigueur à chaque évolution. Je l'accepte, parce que l'injection de script est le risque le plus probable sur un site de ce type.

### Des en-têtes posés par le frontal

Caddy, le serveur frontal, ajoute les mêmes en-têtes à toutes les réponses : HSTS sur deux ans avec préchargement, `nosniff`, politique de référent restrictive, caméra, micro, géolocalisation et paiement désactivés, isolation de l'origine. L'en-tête qui annonce le logiciel serveur est retiré et l'API d'administration de Caddy est désactivée.

Deux réglages répondent à des failles connues. Caddy supprime l'en-tête interne `X-Middleware-Subrequest` avant qu'il n'atteigne Next.js, pour se prémunir de la famille CVE-2025-29927. L'application ne lit l'adresse du visiteur que dans un en-tête posé par Caddy, jamais dans `X-Forwarded-For`, que n'importe qui peut forger.

## Cloudflare devant, et seulement Cloudflare

Le DNS, le pare-feu applicatif et le cache passent par Cloudflare. L'arbitrage est assumé : je dépends d'un tiers, et en échange le serveur n'absorbe pas seul le trafic d'internet.

Ce choix n'a de sens que si on ne peut pas contourner Cloudflare. Seul le port 443 est publié, et le pare-feu du serveur ne l'ouvre qu'aux plages d'adresses de Cloudflare. Caddy ne croit l'adresse du visiteur transmise par Cloudflare que si la requête vient bien de ces plages. Un script met la liste à jour chaque semaine depuis les sources officielles et refuse de l'écrire si elle paraît incomplète : une liste vide fermerait le site, une liste trop large rouvrirait la porte.

## Des liens privés qui ne valent rien s'ils fuient

Chaque interlocuteur reçoit un lien personnel, expirable et révocable. C'est la partie la plus sensible du site, et celle où j'ai le plus arbitré.

- **Le jeton n'est jamais stocké.** Il fait 256 bits aléatoires et la base ne garde que son empreinte SHA-256. Une copie de la base ne permet d'ouvrir aucun lien.
- **Pas de hachage lent.** Il protège des mots de passe choisis par des humains. Un secret déjà aléatoire sur 256 bits n'en a pas besoin, et la vérification reste rapide.
- **Le jeton est échangé contre une session.** Le cookie porte le préfixe `__Host-`, qui impose HTTPS et interdit le partage entre sous-domaines. La session tombe après 14 jours d'inactivité.
- **La révocation est immédiate.** Révoquer un lien ferme toutes ses sessions dans la même transaction.
- **L'échec ne renseigne pas.** Jeton inconnu, expiré ou révoqué : le visiteur reçoit la même réponse.

Les données suivent la même logique. Un lien dure 30 jours par défaut, 180 au plus. Le journal des consultations est purgé après 90 jours, les courriels de notification après 7. Les lignes supprimées sont écrasées dans le fichier, pas seulement retirées de l'index. Ces durées sont celles de la politique de confidentialité, et c'est le code qui les applique.

## Une chaîne de livraison qu'on peut auditer

Un site sûr le jour de sa mise en ligne peut cesser de l'être un mois plus tard. J'ai donc traité la chaîne de livraison comme une partie du produit.

- **Chaque changement passe les mêmes contrôles** : format, analyse statique, types, tests unitaires, tests de bout en bout avec contrôle d'accessibilité, validation de la configuration Caddy.
- **Le code est analysé par CodeQL** à chaque changement, avec les règles de sécurité étendues.
- **Les actions GitHub sont figées par empreinte de commit**, et non par un numéro de version qu'un tiers pourrait déplacer.
- **Dependabot suit chaque semaine** les dépendances, les images Docker et les actions.
- **L'image n'est étiquetée qu'après analyse.** Elle est publiée par empreinte, avec SBOM et provenance, puis analysée par Trivy. Une vulnérabilité critique ou haute pour laquelle un correctif existe bloque la publication.
- **La clé de déploiement ne sait faire qu'une chose.** Sur le serveur, elle est liée à une commande forcée qui n'accepte qu'une étiquette d'image de 12 caractères hexadécimaux.

## Des images qui ne contiennent que l'utile

L'image de production est construite en plusieurs étapes sur une image de base épinglée par empreinte. Les outils inutiles à l'exécution, comme npm, en sont retirés. L'application tourne sous un compte non privilégié, sur un système de fichiers en lecture seule, sans aucune capacité Linux. Le conteneur web n'a accès qu'à un réseau interne, sans sortie vers internet : seul Caddy est exposé.

Les images sont produites pour amd64 et arm64, chacune sur une machine native. L'émulation rendait la construction trop lente, et l'arm64 garde ouverte une étape inscrite à la feuille de route : un serveur auto-hébergé derrière Cloudflare Tunnel, sans aucun port ouvert.

## Ce que j'en retiens

Rien de tout cela n'est exotique. La différence tient au moment où les décisions sont prises. Écrites au cadrage, elles coûtent quelques lignes de configuration. Découvertes en audit, elles coûtent un report de jalon.

Le travail ne s'arrête pas au lancement. Un audit externe vérifie chaque mois, depuis internet, les en-têtes, les pages publiées et les deux notes A+, et m'alerte au moindre écart. La démarche complète est décrite dans l'étude de cas du [portfolio](/portfolio).
