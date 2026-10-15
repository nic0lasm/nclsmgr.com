// Met à jour l'instantané des dépôts publics avant `next build`.
// GITHUB_TOKEN est facultatif (60 requêtes par heure sans jeton suffisent pour un appel).
// --strict : échoue si l'API ne répond pas, au lieu de garder l'instantané précédent.
// INSTANTANE_GITHUB=0 : ne contacte pas GitHub et garde l'instantané tel quel.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  actualiserInstantane,
  lireInstantane,
  recupererDepots,
  type Instantane,
} from "../src/lib/github.ts";

const fichier = fileURLToPath(
  new URL("../src/content/projets/depots-github.json", import.meta.url),
);
const strict = process.argv.includes("--strict");

if (process.env.INSTANTANE_GITHUB === "0") {
  console.log("Instantané GitHub conservé (INSTANTANE_GITHUB=0).");
  process.exit(0);
}

let precedent: Instantane | null = null;
try {
  precedent = lireInstantane(JSON.parse(await readFile(fichier, "utf8")));
} catch {
  precedent = null;
}

try {
  const { instantane, source } = await actualiserInstantane({
    recuperer: () => recupererDepots(fetch, process.env.GITHUB_TOKEN || undefined),
    precedent,
    strict,
  });
  if (source === "api") {
    await writeFile(fichier, JSON.stringify(instantane, null, 2) + "\n");
    console.log(`Instantané GitHub : ${instantane.depots.length} dépôts.`);
  } else {
    console.warn(`API GitHub indisponible, instantané du ${instantane.genereLe} conservé.`);
  }
} catch (erreur) {
  console.error(`Instantané GitHub impossible : ${(erreur as Error).message}`);
  process.exit(1);
}
