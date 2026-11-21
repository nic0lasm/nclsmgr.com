---
titre: Changer de serveur sans rien perdre
description: Le jour du lancement, j'ai déplacé ce site du Canada vers la France. Le récit d'une migration courte, préparée comme un projet.
date: 2026-11-20
statut: valide
---

Le 30 octobre, jour du lancement de ce site, je l'ai déplacé d'un serveur situé au Canada vers un serveur situé en France, chez le même hébergeur. La raison était simple : je voulais que les données du site, celles du formulaire de contact comme celles de l'espace privé, restent en France et sous le seul droit européen.

L'opération est petite à l'échelle d'un système d'information de l'État. La méthode, elle, est la même que pour un déménagement de plus grande ampleur. C'est elle que je décris ici.

## Écrire la procédure avant de toucher au serveur

Une migration qui repose sur la mémoire de celui qui la conduit ne se rejoue pas. Avant la bascule, j'ai donc écrit deux scripts et une procédure.

- **Un script de durcissement** reproduit sur une machine neuve la configuration de l'ancienne : accès SSH par clé uniquement, pare-feu, protection contre les tentatives de connexion répétées, mises à jour automatiques, Docker installé depuis son dépôt officiel après vérification de sa clé.
- **Un script de restauration** remet la configuration puis les données depuis la dernière sauvegarde. Il s'arrête au premier échec, vérifie la base avant d'arrêter quoi que ce soit, et ne remplace les données qu'avec une option explicite. Lancé sans elle, il montre ce qu'il ferait et ne touche à rien.
- **La procédure** fixe l'ordre des étapes, ce qu'on vérifie après chacune et le moment où l'on renonce au retour arrière.

Ces scripts sont publics, dans le dépôt du site. Ils serviront au prochain déménagement, et ils documentent celui-ci mieux qu'un compte rendu.

## La sauvegarde comme seul chemin

J'aurais pu copier les fichiers d'un serveur à l'autre. J'ai choisi de faire passer toutes les données par la sauvegarde chiffrée, celle qui tourne chaque nuit, et de construire le nouveau serveur uniquement à partir d'elle.

Ce détour a un intérêt : la migration devient un exercice réel de reprise après sinistre : si le nouveau serveur fonctionne, c'est que la sauvegarde permet de reconstruire le site sans l'ancien. Chaque fichier restauré est comparé à l'empreinte prise au moment de la sauvegarde. Une seule différence arrête l'opération.

Une sauvegarde que l'on n'a jamais restaurée reste une hypothèse. Celle-ci a cessé d'en être une ce jour-là.

## Deux pièges repérés en chemin

Le premier est apparu pendant l'exécution. Le stockage des sauvegardes n'accepte que les connexions venant d'adresses autorisées. J'avais ajouté l'adresse du nouveau serveur, et pourtant l'accès était refusé. Le serveur disposait aussi d'une adresse IPv6, que l'outil de sauvegarde utilisait en priorité, et qui ne figurait pas dans la liste. Le script de durcissement coupe désormais l'IPv6, et la procédure demande de vérifier l'adresse réellement utilisée en sortie avant le premier appel.

Le second a été repéré avant qu'il ne se produise. Si le nouveau serveur lance sa première sauvegarde avant d'avoir restauré les données, cette sauvegarde vide devient la plus récente, et la restauration suivante partirait de rien. La procédure impose donc l'ordre inverse : restaurer d'abord, activer les sauvegardes ensuite, et couper celles de l'ancien serveur dès la bascule pour que les deux ne s'écrasent pas.

Aucun de ces deux points n'est spectaculaire. Ce sont pourtant ceux qui font échouer une migration.

## Une bascule courte, un retour arrière jusqu'au bout

Le site est servi derrière Cloudflare. Pour les visiteurs, la bascule s'est résumée à la modification d'un enregistrement DNS. Tant que l'ancien serveur tournait, revenir en arrière restait une modification de la même ligne.

Je n'ai renoncé à cette possibilité qu'après un ensemble de vérifications : pages servies, en-têtes de sécurité, notes A+ sur Mozilla Observatory et SSL Labs, déploiement automatique, formulaire de contact, espace privé, sauvegarde nocturne puis restauration de contrôle. Une fois tout cela vert, j'ai fermé l'accès de l'ancien serveur au stockage des sauvegardes, puis résilié ce serveur.

## Ce que je retiens pour des projets plus grands

- **Une migration se prouve par la restauration.** Passer par la sauvegarde coûte un peu de temps et apporte la preuve que l'on sait reconstruire.
- **Le point de non-retour se décide à l'avance.** On écrit avant de commencer ce qui doit être vérifié pour renoncer au retour arrière, et on ne le franchit pas sans ces preuves.
- **Les accès filtrés se vérifient avant d'être utilisés.** Une liste d'adresses autorisées doit correspondre à l'adresse effective, pas à celle que l'on croit utiliser.
- **Chaque surprise devient une règle.** Les deux pièges décrits plus haut sont maintenant écrits dans la procédure et dans le script. Le prochain déménagement ne les rencontrera pas.

La procédure complète est dans le [code source du site](https://github.com/nic0lasm/nclsmgr.com), avec les scripts qu'elle appelle.
