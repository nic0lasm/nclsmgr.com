"use server";

import { headers } from "next/headers";
import { composerMessage, lireFormulaire, type Valeurs } from "@/lib/contact/formulaire";
import { Limiteur } from "@/lib/contact/limite";
import { getContent } from "@/lib/content";
import { base } from "@/lib/espace/base";
import { FileSaturee, mettreEnFile } from "@/lib/espace/courriels";
import { isLocale } from "@/lib/i18n";
import type { EtatContact } from "./etat";

const globale = globalThis as typeof globalThis & { limiteurContact?: Limiteur };
const limiteur = (globale.limiteurContact ??= new Limiteur());

const vide: Valeurs = { nom: "", courriel: "", objet: "", message: "" };

/**
 * Met un message de contact en file d'envoi. Le service web n'envoie rien lui-même : le
 * service courrier vide la file vers la boîte de Nico. Rien d'autre n'est conservé.
 */
export async function envoyerMessage(
  _precedent: EtatContact,
  donnees: FormData,
): Promise<EtatContact> {
  const entetes = await headers();
  const langue = donnees.get("langue");
  // Requête venue d'ailleurs que du site : réponse neutre, sans détail.
  if (
    entetes.get("sec-fetch-site") !== "same-origin" ||
    typeof langue !== "string" ||
    !isLocale(langue)
  ) {
    return { statut: "erreur", valeurs: vide, erreurs: {}, global: "echec" };
  }

  const { formulaire } = getContent(langue).ui.contact;
  const lecture = lireFormulaire(donnees, formulaire.objets);
  // Un robot qui remplit le champ piège croit son message parti.
  if (lecture.type === "piege") return { statut: "envoye" };
  if (lecture.type === "erreurs") {
    return { statut: "erreur", valeurs: lecture.valeurs, erreurs: lecture.erreurs };
  }

  const { valeurs } = lecture;
  const maintenant = Date.now();
  // Derrière Caddy, X-Client-IP est toujours réécrit avec l'adresse réelle du visiteur.
  const ip = entetes.get("x-client-ip") ?? "inconnue";
  if (!limiteur.autorise(ip, maintenant)) {
    return { statut: "erreur", valeurs, erreurs: {}, global: "tropDEnvois" };
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
    if (!(erreur instanceof FileSaturee)) {
      console.error("Contact : mise en file impossible.", (erreur as Error).name);
    }
    return { statut: "erreur", valeurs, erreurs: {}, global: "echec" };
  }
  limiteur.noter(ip, maintenant);
  return { statut: "envoye" };
}
