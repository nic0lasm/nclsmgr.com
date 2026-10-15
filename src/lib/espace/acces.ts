import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { base, espaceConfigure } from "./base";
import { LimiteurDebit } from "./debit";
import { empreinte } from "./jetons";
import type { Lien } from "./liens";
import { lireSession, NOM_COOKIE } from "./sessions";

// 120 requêtes par minute et par session sur l'espace et ses documents.
const globale = globalThis as typeof globalThis & { espaceDebitSessions?: LimiteurDebit };
const debitSessions = (globale.espaceDebitSessions ??= new LimiteurDebit(120, 60_000));

export type SessionCourante = { lien: Lien; cle: string };

/**
 * Session de la requête en cours, lue depuis le cookie et revérifiée en base : lien actif,
 * session ni expirée ni inactive depuis 14 jours. Rend null dans tous les autres cas.
 */
export async function sessionCourante(): Promise<SessionCourante | null> {
  const valeur = (await cookies()).get(NOM_COOKIE)?.value;
  if (!valeur || !espaceConfigure()) return null;
  try {
    const lien = lireSession(base(), valeur, Date.now());
    return lien ? { lien, cle: empreinte(valeur).toString("hex") } : null;
  } catch {
    // Jamais la valeur du cookie ni le lien dans le journal.
    console.error("Espace privé : lecture de session impossible.");
    return null;
  }
}

/** Compte une requête de la session ; false au-delà de la limite. */
export function sessionDansLaLimite(session: SessionCourante): boolean {
  return debitSessions.consommer(session.cle, Date.now()).autorise;
}

/**
 * À appeler en tête de chaque page de l'espace, avant tout rendu : sans session valide, ou
 * au-delà de la limite de débit, la réponse est un 404 (une page ne peut pas répondre 429).
 *
 * Règle pour les layouts : aucune donnée privée dans un layout de /[lang]/espace, ou bien ce
 * layout appelle lui-même exigerSession(). Next.js envoie les segments de layout avant la page
 * (réponses RSC, préchargements) : un layout qui afficherait le nom du destinataire sans
 * vérifier la session le livrerait même quand la page répond 404.
 */
export async function exigerSession(): Promise<Lien> {
  const session = await sessionCourante();
  if (!session || !sessionDansLaLimite(session)) notFound();
  return session.lien;
}
