// Met à jour l'instantané des dépôts publics (src/content/projets/depots-github.json).
// Lancé par la CI avant le build de l'image, jamais par `next build` : le build n'a pas
// besoin du réseau et l'image ne voit jamais de jeton.
//
// Options :
//   --depuis <fichier>  lit une réponse de l'API déjà téléchargée au lieu d'appeler GitHub
//   --sortie <fichier>  écrit l'instantané ailleurs que dans src/content/projets/
//   --strict            échoue si l'API ne répond pas (aussi INSTANTANE_GITHUB_STRICT=1),
//                       au lieu de garder l'instantané précédent
// GITHUB_TOKEN est facultatif (60 requêtes par heure sans jeton suffisent pour un appel).
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  actualiserInstantane,
  lireInstantane,
  lireReponse,
  recupererDepots,
  type Instantane,
} from "../src/lib/github.ts";

const { values } = parseArgs({
  // pnpm transmet le séparateur « -- » tel quel.
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    depuis: { type: "string" },
    sortie: { type: "string" },
    strict: { type: "boolean", default: false },
  },
});

const fichier = values.sortie
  ? resolve(values.sortie)
  : fileURLToPath(new URL("../src/content/projets/depots-github.json", import.meta.url));
const strict = values.strict || process.env.INSTANTANE_GITHUB_STRICT === "1";

let precedent: Instantane | null = null;
try {
  precedent = lireInstantane(JSON.parse(await readFile(fichier, "utf8")));
} catch {
  precedent = null;
}

const recuperer = values.depuis
  ? async () => lireReponse(JSON.parse(await readFile(resolve(values.depuis!), "utf8")))
  : () => recupererDepots(fetch, process.env.GITHUB_TOKEN || undefined);

try {
  const { instantane, source } = await actualiserInstantane({ recuperer, precedent, strict });
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
