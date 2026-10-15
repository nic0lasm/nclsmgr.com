import type { Base } from "@/lib/espace/base";
import type { MessageCourriel } from "@/lib/espace/courriels";
import { estIdLien } from "@/lib/espace/jetons";
import {
  colonnesLien,
  creerLien,
  DonneesInvalides,
  DUREE_MAX_JOURS,
  estActif,
  JOUR,
  revoquerLien,
  versLien,
  type Lien,
  type LigneLien,
  type NouveauLien,
} from "@/lib/espace/liens";
import { purger } from "@/lib/espace/purge";

// Commande « liens » : reçoit un objet JSON venu du Mac de Nico par SSH. Seules les actions
// et les champs listés ici sont acceptés ; le jeton d'un lien n'apparaît jamais dans la sortie.

export class ErreurCommande extends Error {}

export type Contexte = {
  envoyer: (message: MessageCourriel) => Promise<void>;
  maintenant: () => number;
  site: string;
};

type Entree = Record<string, unknown>;

const jourParis = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeZone: "Europe/Paris",
});
const dateParis = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

function champs(entree: Entree, autorises: readonly string[]): Entree {
  const inconnus = Object.keys(entree).filter((cle) => !autorises.includes(cle));
  if (inconnus.length) throw new ErreurCommande(`Option inconnue : ${inconnus.join(", ")}.`);
  return entree;
}

function idLien(valeur: unknown): string {
  if (!estIdLien(valeur)) throw new ErreurCommande("Identifiant de lien invalide (ex. l-7kq2mz).");
  return valeur;
}

function lireLien(db: Base, id: string): Lien {
  const ligne = db
    .prepare<[string], LigneLien>(`SELECT ${colonnesLien("l")} FROM liens l WHERE l.id = ?`)
    .get(id);
  if (!ligne) throw new ErreurCommande(`Lien inconnu : ${id}.`);
  return versLien(ligne);
}

function qui(lien: Lien): string {
  return lien.organisation ? `${lien.destinataire} (${lien.organisation})` : lien.destinataire;
}

function etat(lien: Lien, maintenant: number): string {
  if (lien.revoqueLe !== null) return "révoqué";
  return estActif(lien, maintenant) ? "actif" : "expiré";
}

async function creer(db: Base, entree: Entree, contexte: Contexte): Promise<string> {
  champs(entree, [
    "action",
    "profil",
    "langue",
    "destinataire",
    "organisation",
    "message",
    "documents",
    "note",
    "dureeJours",
  ]);
  const donnees: Entree = { ...entree };
  delete donnees.action;
  let cree: { lien: Lien; jeton: string };
  try {
    cree = creerLien(db, { langue: "fr", ...donnees } as NouveauLien, contexte.maintenant());
  } catch (erreur) {
    if (erreur instanceof DonneesInvalides) throw new ErreurCommande(erreur.message);
    throw erreur;
  }
  const { lien, jeton } = cree;
  const adresse = `${contexte.site}/${lien.langue}/p#${jeton}`;
  try {
    await contexte.envoyer({
      sujet: "Espace privé : nouveau lien",
      texte: [
        `Lien ${lien.id} pour ${qui(lien)}, profil ${lien.profil}, valable jusqu'au ${jourParis.format(lien.expireLe)}.`,
        "",
        adresse,
        "",
        "Transmets-le en entier, la partie après # comprise : c'est elle qui ouvre l'espace.",
      ].join("\n"),
    });
  } catch {
    // Le jeton n'est conservé nulle part : un lien dont le courriel n'est pas parti est perdu.
    db.prepare("DELETE FROM liens WHERE id = ?").run(lien.id);
    throw new ErreurCommande("Le courriel n'est pas parti : lien annulé, réessaie plus tard.");
  }
  return `Lien ${lien.id} créé pour ${qui(lien)}, valable jusqu'au ${jourParis.format(lien.expireLe)}. Il t'a été envoyé par courriel.`;
}

function lister(db: Base, entree: Entree, contexte: Contexte): string {
  champs(entree, ["action", "tous"]);
  if (entree.tous !== undefined && typeof entree.tous !== "boolean") {
    throw new ErreurCommande("L'option tous ne prend pas de valeur.");
  }
  const maintenant = contexte.maintenant();
  const liens = db
    .prepare<[], LigneLien>(`SELECT ${colonnesLien("l")} FROM liens l ORDER BY l.cree_le DESC`)
    .all()
    .map(versLien)
    .filter((lien) => entree.tous || estActif(lien, maintenant));
  if (!liens.length) return entree.tous ? "Aucun lien." : "Aucun lien actif.";
  return liens
    .map((lien) =>
      [
        lien.id,
        etat(lien, maintenant).padEnd(8),
        lien.profil.padEnd(11),
        `expire ${jourParis.format(lien.expireLe)}`,
        lien.ouvertLe === null
          ? "jamais ouvert".padEnd(16)
          : `ouvert ${jourParis.format(lien.ouvertLe)}`,
        qui(lien),
      ].join("  "),
    )
    .join("\n");
}

function journal(db: Base, entree: Entree, contexte: Contexte): string {
  champs(entree, ["action", "id"]);
  const lien = lireLien(db, idLien(entree.id));
  const lignes = db
    .prepare<
      [string],
      {
        type: string;
        document: string | null;
        le: number;
        pays: string | null;
        navigateur: string | null;
      }
    >(
      "SELECT type, document, le, pays, navigateur FROM consultations WHERE lien_id = ? ORDER BY le",
    )
    .all(lien.id);
  const entete = `${lien.id}  ${etat(lien, contexte.maintenant())}  ${qui(lien)}`;
  if (!lignes.length) return `${entete}\nAucune consultation.`;
  return [
    entete,
    ...lignes.map((l) =>
      [
        dateParis.format(l.le),
        l.type === "document" ? `document ${l.document ?? "?"}` : l.type.replace("_", " "),
        l.pays ?? "--",
        l.navigateur ?? "",
      ].join("  "),
    ),
  ].join("\n");
}

function prolonger(db: Base, entree: Entree, contexte: Contexte): string {
  champs(entree, ["action", "id", "jours"]);
  const lien = lireLien(db, idLien(entree.id));
  const jours = entree.jours;
  if (!Number.isInteger(jours) || (jours as number) < 1 || (jours as number) > DUREE_MAX_JOURS) {
    throw new ErreurCommande(`Nombre de jours attendu, entre 1 et ${DUREE_MAX_JOURS}.`);
  }
  if (lien.revoqueLe !== null) throw new ErreurCommande("Un lien révoqué ne se prolonge pas.");
  const maintenant = contexte.maintenant();
  const expireLe = Math.min(
    Math.max(lien.expireLe, maintenant) + (jours as number) * JOUR,
    maintenant + DUREE_MAX_JOURS * JOUR,
  );
  db.transaction(() => {
    db.prepare("UPDATE liens SET expire_le = ? WHERE id = ?").run(expireLe, lien.id);
    db.prepare("UPDATE sessions SET expire_le = ? WHERE lien_id = ?").run(expireLe, lien.id);
  }).immediate();
  return `Lien ${lien.id} valable jusqu'au ${jourParis.format(expireLe)}.`;
}

function revoquer(db: Base, entree: Entree, contexte: Contexte): string {
  champs(entree, ["action", "id"]);
  const lien = lireLien(db, idLien(entree.id));
  return revoquerLien(db, lien.id, contexte.maintenant())
    ? `Lien ${lien.id} révoqué : ses sessions sont fermées.`
    : `Lien ${lien.id} déjà révoqué.`;
}

function supprimer(db: Base, entree: Entree): string {
  champs(entree, ["action", "id"]);
  const lien = lireLien(db, idLien(entree.id));
  db.prepare("DELETE FROM liens WHERE id = ?").run(lien.id);
  return `Lien ${lien.id} supprimé, avec ses sessions et son journal.`;
}

function purge(db: Base, entree: Entree, contexte: Contexte): string {
  champs(entree, ["action"]);
  const bilan = purger(db, contexte.maintenant());
  return `Purge : ${bilan.liens} lien(s), ${bilan.sessions} session(s), ${bilan.consultations} consultation(s), ${bilan.courriels} courriel(s) supprimés.`;
}

const actions = {
  creer,
  lister,
  journal,
  prolonger,
  revoquer,
  supprimer,
  purger: purge,
} as const satisfies Record<string, (db: Base, e: Entree, c: Contexte) => string | Promise<string>>;

export async function executer(db: Base, entree: unknown, contexte: Contexte): Promise<string> {
  if (typeof entree !== "object" || entree === null || Array.isArray(entree)) {
    throw new ErreurCommande("Entrée attendue : un objet JSON.");
  }
  const action = (entree as Entree).action;
  if (typeof action !== "string" || !Object.hasOwn(actions, action)) {
    throw new ErreurCommande(`Action inconnue. Actions : ${Object.keys(actions).join(", ")}.`);
  }
  return actions[action as keyof typeof actions](db, entree as Entree, contexte);
}
