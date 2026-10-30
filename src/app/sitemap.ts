import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/articles";
import { getContent } from "@/lib/content";
import { locales } from "@/lib/i18n";
import { legalSegments, localizedPath, navEntries } from "@/lib/navigation";

// Pages publiques : menu (onglet Dev compris) et pages légales, dans chaque langue.
const segmentsPublics = [
  ...navEntries.filter((entry) => entry.published).map((entry) => entry.segment),
  legalSegments.legal,
  legalSegments.privacy,
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { url } = getContent("fr").seo.site;
  const pages = segmentsPublics.flatMap((segment) =>
    locales.map((lang) => ({
      url: `${url}${localizedPath(lang, segment)}`,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${url}${localizedPath(l, segment)}`]),
        ),
      },
    })),
  );
  // Un article n'annonce que les langues dans lesquelles il existe.
  const articles = (await Promise.all(locales.map((lang) => getArticles(lang)))).flatMap(
    (liste, i) =>
      liste.map((a) => ({
        url: `${url}${localizedPath(locales[i], `articles/${a.slug}`)}`,
        lastModified: a.date,
        alternates: {
          languages: Object.fromEntries(
            a.langues.map((l) => [l, `${url}${localizedPath(l, `articles/${a.slug}`)}`]),
          ),
        },
      })),
  );
  return [...pages, ...articles];
}
