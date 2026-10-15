// Catalogue et PDF des tests. Tout est fictif : aucun vrai document n'entre dans le dépôt.
// Les entrées autres que cv servent aux cas de refus : fichier manquant, lien symbolique,
// dossier, fichier trop grand ou qui n'est pas un PDF.
export const CATALOGUE_FICTIF = {
  cv: {
    titre: { fr: "CV complet", en: "Full résumé" },
    fichiers: { fr: "cv-fr.pdf", en: "cv-en.pdf" },
    noms: { fr: "Exemple-CV.pdf", en: "Example-Resume.pdf" },
  },
  annexe: { titre: { fr: "Annexe fictive" }, fichiers: { fr: "annexe.pdf" } },
  manquant: { titre: { fr: "Manquant" }, fichiers: { fr: "manquant.pdf" } },
  symbolique: { titre: { fr: "Symbolique" }, fichiers: { fr: "symbolique.pdf" } },
  dossier: { titre: { fr: "Dossier" }, fichiers: { fr: "dossier.pdf" } },
  "trop-grand": { titre: { fr: "Trop grand" }, fichiers: { fr: "trop-grand.pdf" } },
  "pas-pdf": { titre: { fr: "Pas un PDF" }, fichiers: { fr: "pas-pdf.pdf" } },
};

/** PDF d'une page portant un seul mot, lisible par les visionneuses des navigateurs. */
export function pdfFictif(texte: string): Buffer {
  const flux = `BT /F1 24 Tf 20 100 Td (${texte}) Tj ET`;
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let sortie = "%PDF-1.4\n";
  const positions: number[] = [];
  objets.forEach((objet, i) => {
    positions.push(sortie.length);
    sortie += `${i + 1} 0 obj\n${objet}\nendobj\n`;
  });
  const xref = sortie.length;
  sortie += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  sortie += positions.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  sortie += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(sortie, "latin1");
}
