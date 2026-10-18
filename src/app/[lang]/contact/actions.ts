"use server";

import { headers } from "next/headers";
import { emettreJeton, jetonValide } from "@/lib/contact/delai";
import {
  CHAMP_JETON,
  composerMessage,
  lireFormulaire,
  type Valeurs,
} from "@/lib/contact/formulaire";
import { Limiteur } from "@/lib/contact/limite";
import { getContent } from "@/lib/content";
import { base } from "@/lib/espace/base";
import { alerterFilePleine, FileSaturee, mettreEnFile } from "@/lib/espace/courriels";
import { isLocale } from "@/lib/i18n";
import type { EtatContact } from "./etat";

const globale = globalThis as typeof globalThis & { limiteurContact?: Limiteur };
const limiteur = (globale.limiteurContact ??= new Limiteur());

const vide: Valeurs = { nom: "", courriel: "", objet: "", message: "" };

/**
 * Met un message de contact en file d'envoi. Le service web n'envoie rien lui-même : le
 * service courrier vide la file vers la boîte de l'administrateur. Rien d'autre n'est conservé.
 */
export async function envoyerMessage(
  _precedent: EtatContact,
  donnees: FormData,
): Promise<EtatContact> {
  const entetes = await headers();
  const maintenant = Date.now();
  const jeton = emettreJeton(maintenant);
  const langue = donnees.get("langue");
  // Une requête qu'un navigateur dit venue d'un autre site est refusée sans détail. Next.js
  // vérifie de son côté que l'origine de toute action serveur est celle du site.
  const site = entetes.get("sec-fetch-site");
  if (
    (site !== null && site !== "same-origin") ||
    typeof langue !== "string" ||
    !isLocale(langue)
  ) {
    return { statut: "erreur", valeurs: vide, erreurs: {}, global: "echec", jeton };
  }

  const { formulaire } = getContent(langue).ui.contact;
  const lecture = lireFormulaire(donnees, formulaire.objets);
  // Un robot qui remplit le champ piège croit son message parti.
  if (lecture.type === "piege") return { statut: "envoye" };
  if (lecture.type === "erreurs") {
    return { statut: "erreur", valeurs: lecture.valeurs, erreurs: lecture.erreurs, jeton };
  }

  const { valeurs } = lecture;
  // Envoi plus rapide qu'une saisie humaine, ou formulaire d'avant un redémarrage : le visiteur
  // renvoie le sien, avec un jeton neuf. Rien n'est compté pour son adresse.
  if (!jetonValide(donnees.get(CHAMP_JETON), maintenant)) {
    return { statut: "erreur", valeurs, erreurs: {}, global: "echec", jeton };
  }
  // Derrière Caddy, X-Client-IP est toujours réécrit avec l'adresse réelle du visiteur.
  const ip = entetes.get("x-client-ip") ?? "inconnue";
  if (!limiteur.autorise(ip, maintenant)) {
    return { statut: "erreur", valeurs, erreurs: {}, global: "tropDEnvois", jeton };
  }

  try {
    mettreEnFile(
      base(),
      "contact",
      {
        nom: valeurs.nom,
        courriel: valeurs.courriel,
        message: composerMessage(formulaire.objets[lecture.objet] ?? "", langue, valeurs.message),
        le: maintenant,
      },
      maintenant,
    );
  } catch (erreur) {
    // Ni le message ni l'adresse ne sont journalisés.
    if (erreur instanceof FileSaturee) {
      try {
        alerterFilePleine(base(), maintenant);
      } catch (echec) {
        console.error("Contact : alerte de file pleine impossible.", (echec as Error).name);
      }
    } else {
      console.error("Contact : mise en file impossible.", (erreur as Error).name);
    }
    return { statut: "erreur", valeurs, erreurs: {}, global: "echec", jeton };
  }
  limiteur.noter(ip, maintenant);
  return { statut: "envoye" };
}
