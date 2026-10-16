---
titre: Cloud de confiance ou installation sur site ?
description: Héberger une application sensible pour l'État pose souvent la même question. Voici comment je la prépare pour que le décideur puisse trancher.
date: 2026-11-05
statut: valide
---

Une question revient dans presque tous mes projets pour le secteur public : où héberger une application sensible ? Deux réponses reviennent avec elle. La première est un cloud qualifié SecNumCloud. La seconde est une installation sur site, dans les locaux et sur les machines du bénéficiaire.

La question est souvent posée trop tôt et dans le mauvais ordre. On compare des offres avant d'avoir décrit ce qu'on protège. Mon rôle de chef de projet est de remettre les choses dans l'ordre, puis de présenter au décideur un choix qu'il peut assumer.

## Partir des données, pas des offres

Avant de parler d'hébergement, je fais décrire trois choses.

- **Les données.** Lesquelles sont traitées, quel serait le préjudice si elles étaient divulguées, modifiées ou indisponibles. Une application qui gère des rendez-vous n'appelle pas les mêmes mesures qu'une application qui manipule des données d'enquête.
- **Les obligations.** Certaines sont fixées par les textes. La doctrine de l'État en matière de cloud demande ainsi que les données d'une sensibilité particulière soient hébergées sur un cloud qualifié SecNumCloud ou sur un cloud interne de l'État. Les informations classifiées relèvent d'un autre régime, qu'aucune des deux options ne règle à elle seule.
- **La menace.** Qui pourrait s'intéresser à ces données, avec quels moyens. C'est l'objet de l'analyse de risques, que je conduis avec la méthode EBIOS Risk Manager.

Ces trois éléments font souvent tomber une option avant toute comparaison. Quand ce n'est pas le cas, la comparaison peut commencer sur une base solide.

## Ce que garantit une qualification SecNumCloud

SecNumCloud est une qualification délivrée par l'ANSSI à des offres de cloud. Elle atteste qu'un prestataire respecte un référentiel exigeant : sécurité de l'infrastructure et de l'exploitation, localisation des données et des opérations en Europe, protection contre l'application de lois étrangères qui permettraient d'accéder aux données.

Elle a aussi des limites, qu'il faut dire clairement.

- Elle porte sur l'offre du prestataire, pas sur l'application. Une application mal conçue reste vulnérable sur un cloud qualifié.
- Elle ne remplace pas l'homologation de sécurité du système, qui reste de la responsabilité du bénéficiaire.
- Le catalogue des services qualifiés est plus restreint que celui des grands clouds publics. Certains services managés ne sont pas disponibles, ce qui pèse sur l'architecture et sur le coût de développement.

## Ce que coûte une installation sur site

L'installation sur site donne le contrôle le plus complet : les machines, le réseau et les personnes qui y accèdent sont ceux du bénéficiaire. C'est souvent la seule option possible quand l'application doit fonctionner sur un réseau isolé.

Ce contrôle a un prix, qui n'apparaît pas toujours dans le premier chiffrage.

- **L'exploitation.** Il faut des équipes pour administrer, surveiller, sauvegarder et appliquer les correctifs, tous les jours et pendant toute la durée de vie de l'application.
- **Les délais.** Commander et installer du matériel prend des mois. Un cloud qualifié se provisionne en jours.
- **La capacité.** On dimensionne pour le pic d'usage prévu, et on paie cette capacité même quand elle ne sert pas.

## Les critères que je mets sur la table

Pour chaque projet, je compare les deux options sur les mêmes critères, que le décideur peut arbitrer.

| Critère                       | Cloud qualifié SecNumCloud           | Installation sur site             |
| ----------------------------- | ------------------------------------ | --------------------------------- |
| Contrôle sur l'infrastructure | Partagé avec un prestataire qualifié | Complet                           |
| Délai de mise à disposition   | Court                                | Long, lié aux achats de matériel  |
| Compétences d'exploitation    | Surtout côté prestataire             | Entièrement côté bénéficiaire     |
| Services disponibles          | Catalogue qualifié, plus restreint   | Ce que l'équipe sait opérer       |
| Coût                          | Abonnement, ajusté à l'usage         | Investissement, puis exploitation |
| Réseau isolé                  | Rarement possible                    | Possible                          |

Ce tableau ne donne pas la réponse. Il rend visibles les compromis, et c'est ce qui permet de décider.

## Le critère oublié : la réversibilité

On pense à entrer, rarement à sortir. Or un contrat d'hébergement se termine, un prestataire peut perdre sa qualification, un besoin peut changer. Je demande donc dès l'étude comment on récupère les données, dans quel format, en combien de temps et avec quels outils.

Cette question influence l'architecture. Une application qui repose sur des services propres à un fournisseur sera difficile à déplacer. Une application conçue avec des composants standards se déplace plus facilement, au prix d'un peu plus de travail au départ.

## Ce que je remets au décideur

À la fin de l'étude, je remets deux documents. Le premier est complet : analyse de risques, architectures comparées, coûts sur la durée de vie, feuille de route de migration. Le second tient en quelques pages : les deux options, les risques qui restent dans chacune, et ma recommandation argumentée.

C'est ce second document qui compte le plus. Un directeur de programme ou un DSI n'a pas à devenir expert en hébergement. Il doit pouvoir comprendre ce qu'il accepte en choisissant l'une ou l'autre option, et l'expliquer à son tour.

La souveraineté numérique se joue en grande partie dans ces choix concrets, projet après projet. Elle demande moins de grands discours que de méthode : partir des données, dire clairement ce que chaque option garantit et ce qu'elle ne garantit pas, puis laisser décider ceux à qui la décision revient.
