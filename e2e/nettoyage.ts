import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

// Fin de campagne : supprime le dossier temporaire de la base créé par playwright.config.ts.
// Seul un dossier créé par la configuration elle-même est supprimé, jamais une base fournie.
export default function nettoyage() {
  const dossier = process.env.ESPACE_DOSSIER_E2E;
  if (!dossier) return;
  const chemin = resolve(dossier);
  if (dirname(chemin) !== resolve(tmpdir()) || !basename(chemin).startsWith("nclsmgr-e2e-")) {
    return;
  }
  rmSync(chemin, { recursive: true, force: true });
}
