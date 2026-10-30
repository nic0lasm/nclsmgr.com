// Génère l'image d'aperçu des liens partagés (Open Graph, 1200 × 630) dans chaque langue :
// src/content/apercu/<langue>.png, à partir du profil et des polices du site.
// Lancé à la main après un changement du nom, de l'intitulé ou de l'accroche, jamais au build.
//
// Usage : pnpm apercu
// CHROMIUM : chemin d'un Chromium déjà installé, si celui de Playwright est absent.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const racine = resolve(fileURLToPath(import.meta.url), "../..");
const polices = resolve(racine, "src/app/fonts");
const langues = ["fr", "en"] as const;

type Profil = { nom: string; intitule: string; accroche: string };

const entites: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const echapper = (texte: string) => texte.replace(/[&<>"]/g, (c) => entites[c] ?? c);

// Polices embarquées en data: : une page chargée par setContent ne lit pas les fichiers locaux.
const police = async (fichier: string) =>
  `url("data:font/woff2;base64,${(await readFile(resolve(polices, fichier))).toString("base64")}")`;

async function page(profil: Profil): Promise<string> {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: "Apercu Serif"; src: ${await police("source-serif-4-latin-600.woff2")}; font-weight: 600; }
@font-face { font-family: "Apercu Sans"; src: ${await police("public-sans-latin-wght.woff2")}; font-weight: 400 700; }
@font-face { font-family: "Apercu Mono"; src: ${await police("ibm-plex-mono-latin-400.woff2")}; font-weight: 400; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #f5f6f4; color: #141b24; font-family: "Apercu Sans"; }
main { height: 100%; padding: 72px 88px; border-left: 16px solid #1c4c82; display: flex; flex-direction: column; }
.site { font: 400 24px "Apercu Mono"; color: #545e69; letter-spacing: 0.04em; }
h1 { margin-top: auto; font: 600 92px/1 "Apercu Serif"; letter-spacing: -0.01em; }
.intitule { margin-top: 20px; font: 400 28px "Apercu Mono"; color: #1c4c82; }
.accroche { margin-top: 36px; max-width: 960px; font: 400 32px/1.35 "Apercu Sans"; }
.filet { margin-top: auto; border-top: 1px solid #d3d8db; }
</style></head><body><main>
<p class="site">nclsmgr.com</p>
<h1>${echapper(profil.nom)}</h1>
<p class="intitule">${echapper(profil.intitule)}</p>
<p class="accroche">${echapper(profil.accroche)}</p>
<div class="filet"></div>
</main></body></html>`;
}

const navigateur = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
try {
  for (const lang of langues) {
    const profil = JSON.parse(
      await readFile(resolve(racine, `src/content/${lang}/profil.json`), "utf8"),
    ) as Profil;
    const onglet = await navigateur.newPage({ viewport: { width: 1200, height: 630 } });
    await onglet.setContent(await page(profil), { waitUntil: "load" });
    const chargees = await onglet.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === "loaded").length;
    });
    if (chargees !== 3) throw new Error(`Polices chargées : ${chargees} sur 3.`);
    const sortie = resolve(racine, `src/content/apercu/${lang}.png`);
    await onglet.screenshot({ path: sortie, type: "png" });
    console.log(`Aperçu écrit : ${sortie}`);
  }
} finally {
  await navigateur.close();
}
