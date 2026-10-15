import type { Base } from "@/lib/espace/base";
import {
  courrielsAEnvoyer,
  marquerEchec,
  marquerEnvoye,
  rediger,
  type MessageCourriel,
} from "@/lib/espace/courriels";

export type Envoyer = (message: MessageCourriel) => Promise<void>;

/**
 * Envoie les courriels prêts. Un courriel illisible est abandonné ; au premier échec d'envoi,
 * la boucle s'arrête : le serveur SMTP est sans doute indisponible pour les suivants aussi.
 */
export async function traiterFile(
  db: Base,
  envoyer: Envoyer,
  maintenant: () => number,
): Promise<{ envoyes: number; echecs: number }> {
  let envoyes = 0;
  let echecs = 0;
  for (const courriel of courrielsAEnvoyer(db, maintenant())) {
    let message: MessageCourriel;
    try {
      message = rediger(courriel.modele, JSON.parse(courriel.donnees));
    } catch {
      marquerEchec(db, courriel.id, maintenant(), true);
      console.error(`Courriel ${courriel.id} illisible : abandonné.`);
      echecs++;
      continue;
    }
    try {
      await envoyer(message);
      marquerEnvoye(db, courriel.id, maintenant());
      envoyes++;
    } catch (erreur) {
      marquerEchec(db, courriel.id, maintenant());
      const code = (erreur as { code?: string }).code ?? "inconnu";
      console.error(`Courriel ${courriel.id} : échec d'envoi (${code}), nouvel essai plus tard.`);
      echecs++;
      break;
    }
  }
  return { envoyes, echecs };
}
