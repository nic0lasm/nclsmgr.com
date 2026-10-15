import type { Metadata } from "next";
import type { PageSeo } from "@/content/types";
import { getContent } from "@/lib/content";
import { isLocale, locales } from "@/lib/i18n";

// Titre, description, Open Graph et versions linguistiques d'une page.
// `route` est le chemin sans préfixe de langue : "" pour l'accueil, "/cv" pour le CV.
export async function pageMetadata(
  params: Promise<{ lang: string }>,
  page: PageSeo,
  route: string,
): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const { seo } = getContent(lang);
  const { titre, description, og_image } = seo.pages[page];
  return {
    title: titre,
    description,
    alternates: {
      canonical: `/${lang}${route}`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}${route}`])),
    },
    openGraph: {
      type: page === "accueil" ? "profile" : "website",
      siteName: seo.site.nom,
      locale: seo.site.locale,
      url: `/${lang}${route}`,
      title: titre,
      description,
      ...(og_image ? { images: [og_image] } : {}),
    },
  };
}
