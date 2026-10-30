import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { locales, type Locale } from "@/lib/i18n";
import { parseMarkdown, type Document } from "@/lib/markdown";

// Articles en Markdown : src/content/<langue>/articles/<slug>.md.
// Un article peut n'exister que dans une langue ; le slug est le même d'une langue à l'autre.

export interface Article {
  slug: string;
  titre: string;
  description: string;
  date: string;
  langues: Locale[];
  doc: Document;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// « 2026-02-31 » a la bonne forme mais n'existe pas : Date.UTC le décalerait au 3 mars.
function dateValide(date: string | undefined): date is string {
  if (!date || !DATE.test(date)) return false;
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

function dossier(locale: Locale): string {
  return path.join(process.cwd(), "src", "content", locale, "articles");
}

async function slugs(locale: Locale): Promise<string[]> {
  try {
    const fichiers = await readdir(dossier(locale));
    return fichiers
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .filter((s) => SLUG.test(s));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function lire(locale: Locale, slug: string): Promise<Article> {
  const doc = parseMarkdown(await readFile(path.join(dossier(locale), `${slug}.md`), "utf8"));
  const { titre, description, date } = doc.frontmatter;
  if (!titre || !description || !dateValide(date)) {
    throw new Error(`Article ${locale}/${slug} : titre, description ou date manquant ou invalide`);
  }
  const langues: Locale[] = [];
  for (const l of locales) if ((await slugs(l)).includes(slug)) langues.push(l);
  return { slug, titre, description, date, langues, doc };
}

// Du plus récent au plus ancien.
export async function getArticles(locale: Locale): Promise<Article[]> {
  const articles = await Promise.all((await slugs(locale)).map((s) => lire(locale, s)));
  return articles.sort((a, b) => b.date.localeCompare(a.date));
}

// Le slug vient de l'URL : il n'est lu que s'il figure dans la liste des fichiers.
export async function getArticle(locale: Locale, slug: string): Promise<Article | null> {
  if (!SLUG.test(slug) || !(await slugs(locale)).includes(slug)) return null;
  return lire(locale, slug);
}

export async function articleExists(slug: string): Promise<boolean> {
  if (!SLUG.test(slug)) return false;
  for (const l of locales) if ((await slugs(l)).includes(slug)) return true;
  return false;
}
