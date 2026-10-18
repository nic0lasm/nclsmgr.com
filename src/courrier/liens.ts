// Point d'entrée de la commande « liens », lancé dans le conteneur courrier par la commande
// forcée SSH du compte liens : `docker compose exec -T courrier node liens.cjs`.
// Lit un objet JSON sur l'entrée standard et écrit une réponse en texte.
// Construit par « pnpm build:courrier ».
import { ouvrirBase } from "@/lib/espace/base";
import { VERSION_SCHEMA, versionSchema } from "@/lib/espace/migrations";
import { ErreurCommande, executer } from "./commande";
import { lireConfiguration } from "./configuration";
import { creerExpediteur } from "./smtp";

const TAILLE_MAX = 64 * 1024;
// Sous les 60 s du « timeout » de l'hôte, qui n'arrête que le client docker : la commande
// s'arrête d'elle-même, entrée sans fin ou envoi bloqué compris. Le courriel part avant
// l'enregistrement du lien, donc un arrêt pendant l'envoi ne laisse aucun lien en base.
const DELAI_MAX = 45_000;

const delai = setTimeout(() => {
  process.stderr.write("Délai de 45 s dépassé : commande abandonnée, aucun lien enregistré.\n");
  process.exit(1);
}, DELAI_MAX);
delai.unref();

async function lireEntree(): Promise<string> {
  const morceaux: Buffer[] = [];
  let taille = 0;
  for await (const morceau of process.stdin as AsyncIterable<Buffer>) {
    taille += morceau.length;
    if (taille > TAILLE_MAX) throw new ErreurCommande("Entrée trop longue.");
    morceaux.push(morceau);
  }
  return Buffer.concat(morceaux).toString("utf8");
}

async function principal(): Promise<string> {
  let entree: unknown;
  try {
    entree = JSON.parse(await lireEntree());
  } catch (erreur) {
    if (erreur instanceof ErreurCommande) throw erreur;
    throw new ErreurCommande("Entrée JSON invalide.");
  }
  const chemin = process.env.ESPACE_BASE;
  if (!chemin) throw new ErreurCommande("ESPACE_BASE n'est pas défini.");
  const site = process.env.SITE_URL ?? "https://nclsmgr.com";
  if (!/^https:\/\/[a-z0-9.-]+$/.test(site)) throw new ErreurCommande("SITE_URL invalide.");

  const db = ouvrirBase(chemin);
  try {
    if (versionSchema(db) !== VERSION_SCHEMA) {
      throw new ErreurCommande("La base n'est pas à jour : le service web a-t-il démarré ?");
    }
    return await executer(db, entree, {
      maintenant: Date.now,
      site,
      // Le secret SMTP n'est lu que pour l'action qui envoie un courriel.
      envoyer: async (message) => {
        const expediteur = creerExpediteur(
          lireConfiguration(process.env.SMTP_FICHIER ?? "/run/secrets/smtp"),
        );
        try {
          await expediteur.envoyer(message);
        } finally {
          expediteur.fermer();
        }
      },
    });
  } finally {
    db.close();
  }
}

principal().then(
  (sortie) => {
    clearTimeout(delai);
    process.stdout.write(`${sortie}\n`);
  },
  (erreur) => {
    clearTimeout(delai);
    // La sortie d'erreur revient dans le terminal de l'administrateur, jamais dans un journal.
    process.stderr.write(
      erreur instanceof ErreurCommande ? `${erreur.message}\n` : `Erreur interne : ${erreur}\n`,
    );
    process.exitCode = 1;
  },
);
