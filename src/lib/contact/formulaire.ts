// Lecture et vérification du formulaire de contact. La file de courriels revérifie et nettoie
// chaque champ ; ici, les mêmes règles servent à renvoyer au visiteur une erreur par champ
// plutôt qu'un échec global. formulaire.test.ts vérifie que tout formulaire accepté ici l'est
// aussi par la file.

export const LIMITES = { nom: 120, courriel: 254, message: 4000 } as const;

/** Champ piège : invisible pour un visiteur, souvent rempli par les robots. */
export const CHAMP_PIEGE = "verification";

// Mêmes règles que la file de courriels (src/lib/espace/courriels.ts), qui ne peut pas être
// importée ici : adresse en ASCII seulement, caractères invisibles retirés.
const FORMAT_COURRIEL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const INVISIBLE =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}\u{115F}\u{1160}\u{2800}\u{3164}\u{FFA0}]/gu;

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

/** Texte tel que la file le gardera, pour juger s'il est vide ou trop long. */
function significatif(texte: string): string {
  return texte.normalize("NFKC").replace(/\r\n?/g, "\n").replace(INVISIBLE, "").trim();
}

function verifier(champ: Champ, valeur: string): ErreurChamp | undefined {
  const propre = significatif(valeur);
  // Un nom sans chevrons ni guillemets : la file les retire.
  if (!(champ === "nom" ? propre.replace(/[<>"]/g, "").trim() : propre)) return "manquant";
  if (Math.max(valeur.length, valeur.normalize("NFKC").length) > LIMITES[champ]) return "invalide";
  if (champ === "courriel" && !FORMAT_COURRIEL.test(valeur)) return "invalide";
  return undefined;
}

/**
 * Lit le formulaire. `objets` est la liste des objets proposés dans la langue de la page :
 * un objet inconnu retombe sur le dernier (« Autre »).
 */
export function lireFormulaire(donnees: FormData, objets: readonly string[]): Lecture {
  if (chaine(donnees, CHAMP_PIEGE) !== "") return { type: "piege" };

  const brut = {
    nom: chaine(donnees, "nom").trim(),
    courriel: chaine(donnees, "courriel").trim(),
    message: chaine(donnees, "message").trim(),
  };
  // Les valeurs renvoyées pour réafficher le formulaire sont tronquées à leur limite.
  const valeurs: Valeurs = {
    nom: brut.nom.slice(0, LIMITES.nom),
    courriel: brut.courriel.slice(0, LIMITES.courriel),
    objet: chaine(donnees, "objet"),
    message: brut.message.slice(0, LIMITES.message),
  };

  const erreurs: Partial<Record<Champ, ErreurChamp>> = {};
  for (const champ of ["nom", "courriel", "message"] as const) {
    const erreur = verifier(champ, brut[champ]);
    if (erreur) erreurs[champ] = erreur;
  }
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
