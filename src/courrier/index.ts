// Service courrier : seul conteneur autorisé à sortir sur Internet et seul détenteur du secret
// SMTP. Il vide la file de courriels de la base partagée et lance la purge quotidienne.
// Construit par « pnpm build:courrier », lancé par « node courrier.cjs ».
import { writeFileSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";
import { createTransport } from "nodemailer";
import { ouvrirBase, type Base } from "@/lib/espace/base";
import { JOUR } from "@/lib/espace/liens";
import { VERSION_SCHEMA, versionSchema } from "@/lib/espace/migrations";
import { purger } from "@/lib/espace/purge";
import { traiterFile } from "./boucle";
import { lireConfiguration } from "./configuration";

const INTERVALLE = 30_000;
const ATTENTE_SCHEMA_MAX = 5 * 60_000;
// Témoin de vie lu par le contrôle de santé de Compose.
const TEMOIN = "/tmp/courrier-vivant";

/** Seul le service web migre : on attend qu'il ait amené la base à la version du code. */
async function attendreSchema(db: Base): Promise<void> {
  const limite = Date.now() + ATTENTE_SCHEMA_MAX;
  for (;;) {
    const version = versionSchema(db);
    if (version === VERSION_SCHEMA) return;
    if (version > VERSION_SCHEMA) {
      throw new Error(`Base en version ${version}, plus récente que le code (${VERSION_SCHEMA}).`);
    }
    if (Date.now() > limite) throw new Error("La base n'a pas été migrée par le service web.");
    await pause(2000);
  }
}

async function principal() {
  const chemin = process.env.ESPACE_BASE;
  if (!chemin) throw new Error("ESPACE_BASE n'est pas défini.");
  const config = lireConfiguration(process.env.SMTP_FICHIER ?? "/run/secrets/smtp");
  const db = ouvrirBase(chemin);
  await attendreSchema(db);

  const transport = createTransport({
    host: config.hote,
    port: config.port,
    secure: config.port === 465,
    requireTLS: true,
    auth: { user: config.utilisateur, pass: config.motDePasse },
    tls: { minVersion: "TLSv1.2", servername: config.hote },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const envoyer = async (message: { sujet: string; texte: string; repondreA?: string }) => {
    await transport.sendMail({
      from: config.expediteur,
      to: config.destinataire,
      replyTo: message.repondreA,
      subject: message.sujet,
      text: message.texte,
    });
  };

  let arret = false;
  const arreter = () => {
    arret = true;
  };
  process.once("SIGTERM", arreter);
  process.once("SIGINT", arreter);

  console.log("Service courrier démarré.");
  let dernierePurge = 0;
  while (!arret) {
    try {
      if (Date.now() - dernierePurge >= JOUR) {
        const bilan = purger(db, Date.now());
        dernierePurge = Date.now();
        console.log(`Purge : ${JSON.stringify(bilan)}`);
      }
      await traiterFile(db, envoyer, Date.now);
      writeFileSync(TEMOIN, String(Date.now()));
    } catch (erreur) {
      console.error("Service courrier : erreur de cycle.", erreur);
    }
    // Attente interrompue par un signal d'arrêt, sans dépasser l'intervalle.
    for (let attendu = 0; attendu < INTERVALLE && !arret; attendu += 1000) await pause(1000);
  }
  transport.close();
  db.close();
  console.log("Service courrier arrêté.");
}

principal().catch((erreur) => {
  console.error("Service courrier : arrêt sur erreur.", erreur);
  process.exit(1);
});
