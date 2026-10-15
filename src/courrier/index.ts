// Service courrier : seul conteneur autorisé à sortir sur Internet et seul détenteur du secret
// SMTP. Il vide la file de courriels de la base partagée et lance la purge quotidienne.
// Construit par « pnpm build:courrier », lancé par « node courrier.cjs ».
import { writeFileSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";
import { ouvrirBase, type Base } from "@/lib/espace/base";
import { JOUR } from "@/lib/espace/liens";
import { VERSION_SCHEMA, versionSchema } from "@/lib/espace/migrations";
import { purger, viderWal } from "@/lib/espace/purge";
import { traiterFile } from "./boucle";
import { lireConfiguration } from "./configuration";
import { creerExpediteur } from "./smtp";

const INTERVALLE = 30_000;
const ATTENTE_SCHEMA_MAX = 5 * 60_000;
// Témoin de vie lu par le contrôle de santé de Compose.
const TEMOIN = "/tmp/courrier-vivant";

let arret = false;
const arreter = () => {
  arret = true;
};
// Posés avant toute attente : un arrêt demandé pendant le démarrage est entendu aussi.
process.once("SIGTERM", arreter);
process.once("SIGINT", arreter);

/** Attente interrompue par un signal d'arrêt. */
async function attendre(duree: number): Promise<void> {
  for (let attendu = 0; attendu < duree && !arret; attendu += 1000) await pause(1000);
}

/** Seul le service web migre : on attend qu'il ait amené la base à la version du code. */
async function attendreSchema(db: Base): Promise<void> {
  const limite = Date.now() + ATTENTE_SCHEMA_MAX;
  while (!arret) {
    const version = versionSchema(db);
    if (version === VERSION_SCHEMA) return;
    if (version > VERSION_SCHEMA) {
      throw new Error(`Base en version ${version}, plus récente que le code (${VERSION_SCHEMA}).`);
    }
    if (Date.now() > limite) throw new Error("La base n'a pas été migrée par le service web.");
    await attendre(2000);
  }
}

async function principal() {
  const chemin = process.env.ESPACE_BASE;
  if (!chemin) throw new Error("ESPACE_BASE n'est pas défini.");
  const config = lireConfiguration(process.env.SMTP_FICHIER ?? "/run/secrets/smtp");
  const db = ouvrirBase(chemin);
  await attendreSchema(db);

  const expediteur = creerExpediteur(config);

  if (!arret) console.log("Service courrier démarré.");
  let dernierePurge = 0;
  let walAVider = false;
  while (!arret) {
    try {
      if (Date.now() - dernierePurge >= JOUR) {
        const bilan = purger(db, Date.now());
        dernierePurge = Date.now();
        walAVider = !bilan.walVide;
        console.log(`Purge : ${JSON.stringify(bilan)}`);
      } else if (walAVider) {
        // Une lecture du service web empêchait de vider le journal : on réessaie à chaque cycle.
        walAVider = !viderWal(db);
      }
      await traiterFile(db, expediteur.envoyer, Date.now, () => !arret);
      // Lisible du seul utilisateur du service, même si /tmp n'était pas privé au conteneur.
      writeFileSync(TEMOIN, String(Date.now()), { mode: 0o600 });
    } catch (erreur) {
      console.error("Service courrier : erreur de cycle.", erreur);
    }
    await attendre(INTERVALLE);
  }
  expediteur.fermer();
  db.close();
  console.log("Service courrier arrêté.");
}

principal().catch((erreur) => {
  console.error("Service courrier : arrêt sur erreur.", erreur);
  process.exit(1);
});
