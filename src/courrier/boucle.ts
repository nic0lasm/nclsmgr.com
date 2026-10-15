import type { Base } from "@/lib/espace/base";
import {
  abandonner,
  courrielsAEnvoyer,
  marquerEchec,
  marquerEnvoye,
  rediger,
  reserver,
  type MessageCourriel,
} from "@/lib/espace/courriels";

export type Envoyer = (message: MessageCourriel) => Promise<void>;

/**
 * Envoie les courriels prêts. Chacun est réservé avant l'envoi, pour qu'une autre instance ne
 * l'envoie pas en même temps. Un courriel illisible est abandonné ; au premier échec d'envoi,
 * la boucle s'arrête : le serveur SMTP est sans doute indisponible pour les suivants aussi.
 * `continuer` permet de s'arrêter entre deux envois quand le service doit s'éteindre.
 */
export async function traiterFile(
  db: Base,
  envoyer: Envoyer,
  maintenant: () => number,
  continuer: () => boolean = () => true,
): Promise<{ envoyes: number; echecs: number }> {
  let envoyes = 0;
  let echecs = 0;
  for (const courriel of courrielsAEnvoyer(db, maintenant())) {
    if (!continuer()) break;
    if (!reserver(db, courriel.id, maintenant())) continue;
    let message: MessageCourriel;
    try {
      message = rediger(courriel.modele, JSON.parse(courriel.donnees));
    } catch {
      abandonner(db, courriel.id, maintenant());
      console.error(`Courriel ${courriel.id} illisible : abandonné.`);
      echecs++;
      continue;
    }
    try {
      await envoyer(message);
    } catch (erreur) {
      marquerEchec(db, courriel.id, maintenant());
      const code = (erreur as { code?: string }).code ?? "inconnu";
      console.error(`Courriel ${courriel.id} : échec d'envoi (${code}), nouvel essai plus tard.`);
      echecs++;
      break;
    }
    marquerEnvoye(db, courriel.id, maintenant());
    envoyes++;
  }
  return { envoyes, echecs };
}
