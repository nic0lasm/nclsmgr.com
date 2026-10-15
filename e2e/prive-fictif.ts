// Contenu de prive.json pour les tests. Tout est fictif : numéro de la plage réservée à la
// fiction, domaine example.com, noms inventés. Les vraies données ne vivent que sur le serveur.
export const PRIVE_FICTIF = {
  fr: {
    coordonnees: {
      telephone: "+33 6 39 98 00 00",
      email: "contact@example.com",
      ville: "Villefictive",
      linkedin: "https://www.linkedin.com/in/exemple-fictif",
    },
    references: [
      {
        nom: "Camille Fictive",
        role: "Directrice de programme",
        organisation: "Société Exemple",
        texte: "Référence fictive, première ligne.\nDeuxième ligne.",
        contact: "camille@example.com",
      },
    ],
  },
  en: {
    coordonnees: { email: "contact@example.com" },
    references: [{ nom: "Camille Fictive", role: "Programme director" }],
  },
};
