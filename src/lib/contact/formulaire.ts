// Lecture et vérification du formulaire de contact. La file de courriels revérifie et nettoie
// chaque champ : ici, on ne fait que renvoyer au visiteur une erreur compréhensible par champ.

export const LIMITES = { nom: 120, courriel: 254, message: 4000 } as const;

/** Champ piège : invisible pour un visiteur, souvent rempli par les robots. */
export const CHAMP_PIEGE = "site";

// Même forme d'adresse que celle acceptée par la file de courriels (ASCII seulement).
const FORMAT_COURRIEL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export type Champ = "nom" | "courriel" | "message";
export type ErreurChamp = "manquant" | "invalide";

export type Valeurs = { nom: string; courriel: string; objet: string; message: string };

export type Lecture =
  | { type: "piege" }
  | { type: "erreurs"; valeurs: Valeurs; erreurs: Partial<Record<Champ, ErreurChamp>> }
  | { type: "valide"; valeurs: Valeurs; objet: number };

function chaine(donnees: FormData, cle: string): string {
  const valeur = donnees.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

/**
 * Lit le formulaire. `objets` est la liste des objets proposés dans la langue de la page :
 * un objet inconnu retombe sur le dernier (« Autre »).
 */
export function lireFormulaire(donnees: FormData, objets: readonly string[]): Lecture {
  if (chaine(donnees, CHAMP_PIEGE) !== "") return { type: "piege" };

  // Les valeurs renvoyées pour réafficher le formulaire sont tronquées à leur limite.
  const valeurs: Valeurs = {
    nom: chaine(donnees, "nom").trim().slice(0, LIMITES.nom),
    courriel: chaine(donnees, "courriel").trim().slice(0, LIMITES.courriel),
    objet: chaine(donnees, "objet"),
    message: chaine(donnees, "message").trim().slice(0, LIMITES.message),
  };
  const brut = {
    nom: chaine(donnees, "nom").trim(),
    courriel: chaine(donnees, "courriel").trim(),
    message: chaine(donnees, "message").trim(),
  };

  const erreurs: Partial<Record<Champ, ErreurChamp>> = {};
  for (const champ of ["nom", "courriel", "message"] as const) {
    if (!brut[champ]) erreurs[champ] = "manquant";
    else if (brut[champ].length > LIMITES[champ]) erreurs[champ] = "invalide";
  }
  if (!erreurs.courriel && !FORMAT_COURRIEL.test(brut.courriel)) erreurs.courriel = "invalide";

  if (Object.keys(erreurs).length > 0) return { type: "erreurs", valeurs, erreurs };

  const index = objets.indexOf(valeurs.objet);
  return { type: "valide", valeurs, objet: index === -1 ? objets.length - 1 : index };
}

/** Texte mis en file : l'objet choisi et la langue de la page précèdent le message. */
export function composerMessage(objet: string, langue: string, message: string): string {
  return [`Objet : ${objet}`, `Langue de la page : ${langue.toUpperCase()}`, "", message].join(
    "\n",
  );
}
