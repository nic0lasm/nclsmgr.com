import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

// Fin de campagne : supprime les dossiers temporaires (base, données privées fictives) créés
// par playwright.config.ts. Seul un dossier temporaire de la configuration est supprimé.
function supprimer(dossier: string | undefined) {
  if (!dossier) return;
  const chemin = resolve(dossier);
  if (dirname(chemin) !== resolve(tmpdir()) || !basename(chemin).startsWith("nclsmgr-e2e-")) {
    return;
  }
  rmSync(chemin, { recursive: true, force: true });
}

export default function nettoyage() {
  supprimer(process.env.ESPACE_DOSSIER_E2E);
  supprimer(process.env.ESPACE_DOSSIER_PRIVE_E2E);
}
