import type { Champ, ErreurChamp, Valeurs } from "@/lib/contact/formulaire";

export type EtatContact =
  | { statut: "attente" }
  | { statut: "envoye" }
  | {
      statut: "erreur";
      valeurs: Valeurs;
      erreurs: Partial<Record<Champ, ErreurChamp>>;
      global?: "echec" | "tropDEnvois";
    };

export const etatInitial: EtatContact = { statut: "attente" };
