import "server-only";
import type { Base } from "./base";
import { JOUR } from "./liens";
import { INACTIVITE_MAX } from "./sessions";

// Durées de conservation annoncées dans la politique de confidentialité.
export const CONSERVATION_JOURNAL = 90 * JOUR;
export const CONSERVATION_LIEN_TERMINE = 90 * JOUR;
export const CONSERVATION_COURRIELS = 7 * JOUR;

export type BilanPurge = {
  sessions: number;
  liens: number;
  consultations: number;
  courriels: number;
  /** Faux si un lecteur a empêché de vider le journal WAL : à refaire avec viderWal. */
  walVide: boolean;
};

/** Vide le journal WAL ; faux si une lecture en cours l'en empêche. */
export function viderWal(db: Base): boolean {
  const [resultat] = db.pragma("wal_checkpoint(TRUNCATE)") as { busy: number }[];
  return resultat?.busy === 0;
}

/**
 * Supprime ce qui a dépassé sa durée de conservation, puis vide le journal WAL pour que les
 * pages effacées ne survivent pas dans le fichier -wal.
 */
export function purger(db: Base, maintenant: number): BilanPurge {
  const bilan = db
    .transaction(() => ({
      sessions: db
        .prepare("DELETE FROM sessions WHERE expire_le <= ? OR vu_le <= ?")
        .run(maintenant, maintenant - INACTIVITE_MAX).changes,
      // Un lien terminé (expiré ou révoqué) part avec ses sessions et son journal.
      liens: db
        .prepare("DELETE FROM liens WHERE min(expire_le, coalesce(revoque_le, expire_le)) <= ?")
        .run(maintenant - CONSERVATION_LIEN_TERMINE).changes,
      consultations: db
        .prepare("DELETE FROM consultations WHERE le <= ?")
        .run(maintenant - CONSERVATION_JOURNAL).changes,
      // Un courriel envoyé part 7 jours après son envoi ; un courriel qui n'a pas pu partir,
      // 7 jours après sa création.
      courriels: db
        .prepare("DELETE FROM courriels WHERE coalesce(envoye_le, cree_le) <= ?")
        .run(maintenant - CONSERVATION_COURRIELS).changes,
    }))
    .immediate();
  return { ...bilan, walVide: viderWal(db) };
}
