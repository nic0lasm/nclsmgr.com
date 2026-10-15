export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

// Choisit la langue préférée du visiteur parmi celles du site, selon l'en-tête Accept-Language.
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { lang: tag.trim().slice(0, 2).toLowerCase(), q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((entry) => !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q);
  const match = ranked.find((entry) => isLocale(entry.lang));
  return match ? (match.lang as Locale) : defaultLocale;
}
