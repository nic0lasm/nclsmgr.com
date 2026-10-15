import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRIVE_FICTIF } from "./prive-fictif";

// Début de campagne : écrit le prive.json fictif dans le dossier temporaire créé par
// playwright.config.ts. La configuration ne l'importe pas elle-même : e2e/ n'entre pas dans
// l'image Docker, où playwright.config.ts est vérifié par le build.
export default function preparation() {
  const dossier = process.env.ESPACE_DOSSIER_PRIVE_E2E;
  if (!dossier) return;
  writeFileSync(join(dossier, "prive.json"), JSON.stringify(PRIVE_FICTIF), { mode: 0o600 });
}
