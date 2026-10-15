import "server-only";
import type { Base } from "./base";
import { empreinte, estSecretBienForme, genererSecret } from "./jetons";
import { colonnesLien, estActif, JOUR, versLien, type Lien, type LigneLien } from "./liens";

// Préfixe __Host- : le navigateur exige Secure, Path=/ et l'absence de Domain.
export const NOM_COOKIE = "__Host-espace";
export const INACTIVITE_MAX = 14 * JOUR;
// La date de dernière visite n'est réécrite qu'une fois par heure au plus.
const RAFRAICHISSEMENT = 60 * 60 * 1000;
// Au-delà, les sessions les plus anciennes du lien sont fermées : rejouer l'ouverture ne fait
// pas grossir la base.
export const MAX_SESSIONS_PAR_LIEN = 10;

type LigneSession = LigneLien & { session_vu_le: number; session_expire_le: number };

/** Ouvre une session pour un lien actif ; la valeur rendue va dans le cookie, seule son empreinte est stockée. */
export function ouvrirSession(
  db: Base,
  lien: Lien,
  maintenant: number,
): { valeur: string; expireLe: number } {
  if (!estActif(lien, maintenant)) throw new Error("Session refusée : le lien n'est plus actif.");
  const valeur = genererSecret();
  db.transaction(() => {
    db.prepare(
      "INSERT INTO sessions (id_sha256, lien_id, cree_le, vu_le, expire_le) VALUES (?, ?, ?, ?, ?)",
    ).run(empreinte(valeur), lien.id, maintenant, maintenant, lien.expireLe);
    db.prepare(
      `DELETE FROM sessions WHERE lien_id = ? AND rowid NOT IN (
         SELECT rowid FROM sessions WHERE lien_id = ? ORDER BY cree_le DESC, rowid DESC LIMIT ?
       )`,
    ).run(lien.id, lien.id, MAX_SESSIONS_PAR_LIEN);
  }).immediate();
  return { valeur, expireLe: lien.expireLe };
}

/**
 * Rend le lien de la session si elle est encore valable : lien ni expiré ni révoqué, session
 * non expirée et visitée depuis moins de 14 jours. Une session périmée est supprimée.
 */
export function lireSession(db: Base, valeur: unknown, maintenant: number): Lien | null {
  if (!estSecretBienForme(valeur)) return null;
  const id = empreinte(valeur);
  const ligne = db
    .prepare<[Buffer], LigneSession>(
      `SELECT ${colonnesLien("l")}, s.vu_le AS session_vu_le, s.expire_le AS session_expire_le
       FROM sessions s JOIN liens l ON l.id = s.lien_id
       WHERE s.id_sha256 = ?`,
    )
    .get(id);
  if (!ligne) return null;
  const lien = versLien(ligne);
  const valable =
    estActif(lien, maintenant) &&
    maintenant < ligne.session_expire_le &&
    maintenant - ligne.session_vu_le < INACTIVITE_MAX;
  if (!valable) {
    db.prepare("DELETE FROM sessions WHERE id_sha256 = ?").run(id);
    return null;
  }
  if (maintenant - ligne.session_vu_le >= RAFRAICHISSEMENT) {
    db.prepare("UPDATE sessions SET vu_le = ? WHERE id_sha256 = ?").run(maintenant, id);
  }
  return lien;
}

export function fermerSession(db: Base, valeur: unknown): void {
  if (!estSecretBienForme(valeur)) return;
  db.prepare("DELETE FROM sessions WHERE id_sha256 = ?").run(empreinte(valeur));
}
