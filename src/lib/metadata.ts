import type { Metadata } from "next";
import apercuEn from "@/content/apercu/en.png";
import apercuFr from "@/content/apercu/fr.png";
import type { PageSeo } from "@/content/types";
import { getContent } from "@/lib/content";
import { isLocale, locales } from "@/lib/i18n";

// Aperçu des liens partagés, produit par `pnpm apercu` ; une page peut le remplacer par son og_image.
const apercus = { fr: apercuFr, en: apercuEn };

// Titre, description, Open Graph et versions linguistiques d'une page.
// `route` est le chemin sans préfixe de langue : "" pour l'accueil, "/cv" pour le CV.
export async function pageMetadata(
  params: Promise<{ lang: string }>,
  page: PageSeo,
  route: string,
): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const { seo, profil } = getContent(lang);
  const { titre, description, og_image } = seo.pages[page];
  const apercu = og_image
    ? og_image
    : {
        url: apercus[lang].src,
        width: apercus[lang].width,
        height: apercus[lang].height,
        alt: `${profil.nom}, ${profil.intitule}`,
      };
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
      images: [apercu],
    },
    twitter: { card: "summary_large_image" },
  };
}
