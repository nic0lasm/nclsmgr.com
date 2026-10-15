import "server-only";
import type { Base } from "./base";
import { MAX_ESSAIS } from "./courriels";
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
};

/**
 * Supprime ce qui a dépassé sa durée de conservation, puis vide le journal WAL pour que les
 * pages effacées ne survivent pas dans le fichier -wal.
 */
export function purger(db: Base, maintenant: number): BilanPurge {
  const bilan = db
    .transaction((): BilanPurge => ({
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
      courriels: db
        .prepare(
          `DELETE FROM courriels
             WHERE (envoye_le IS NOT NULL AND envoye_le <= ?)
                OR (envoye_le IS NULL AND essais >= ? AND cree_le <= ?)`,
        )
        .run(maintenant - CONSERVATION_COURRIELS, MAX_ESSAIS, maintenant - CONSERVATION_COURRIELS)
        .changes,
    }))
    .immediate();
  db.pragma("wal_checkpoint(TRUNCATE)");
  return bilan;
}
