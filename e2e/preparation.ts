import { mkdirSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOGUE_FICTIF, pdfFictif } from "./documents-fictifs";
import { PRIVE_FICTIF } from "./prive-fictif";

// Début de campagne : écrit le prive.json fictif, le catalogue et les PDF fictifs dans le
// dossier temporaire créé par playwright.config.ts. La configuration ne l'importe pas
// elle-même : e2e/ n'entre pas dans l'image Docker, où playwright.config.ts est vérifié par le
// build.
export default function preparation() {
  const dossier = process.env.ESPACE_DOSSIER_PRIVE_E2E;
  if (!dossier) return;
  const ecrire = (chemin: string, contenu: string | Buffer) =>
    writeFileSync(chemin, contenu, { mode: 0o600 });
  ecrire(join(dossier, "prive.json"), JSON.stringify(PRIVE_FICTIF));

  const documents = join(dossier, "documents");
  mkdirSync(documents, { mode: 0o700 });
  ecrire(join(documents, "catalogue.json"), JSON.stringify(CATALOGUE_FICTIF));
  ecrire(join(documents, "cv-fr.pdf"), pdfFictif("CV-fictif-FR"));
  ecrire(join(documents, "cv-en.pdf"), pdfFictif("CV-fictif-EN"));
  ecrire(join(documents, "annexe.pdf"), pdfFictif("Annexe-fictive"));
  // Cas de refus : manquant.pdf n'est pas créé.
  symlinkSync(join(documents, "cv-fr.pdf"), join(documents, "symbolique.pdf"));
  mkdirSync(join(documents, "dossier.pdf"), { mode: 0o700 });
  ecrire(join(documents, "trop-grand.pdf"), pdfFictif("Trop-grand"));
  truncateSync(join(documents, "trop-grand.pdf"), 10 * 1024 * 1024 + 1);
  ecrire(join(documents, "pas-pdf.pdf"), "<html><body>Pas un PDF</body></html>");
}
