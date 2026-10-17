import type { MetadataRoute } from "next";
import { getContent } from "@/lib/content";
import { locales } from "@/lib/i18n";

// Les pages de l'espace privé portent déjà noindex ; on évite aussi qu'elles soient explorées.
// « /fr/p » seul couvrirait aussi « /fr/portfolio » : la page d'accès est donc fermée par « $ ».
export default function robots(): MetadataRoute.Robots {
  const { url } = getContent("fr").seo.site;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: locales.flatMap((l) => [`/${l}/p$`, `/${l}/p/`, `/${l}/espace`]),
    },
    sitemap: `${url}/sitemap.xml`,
  };
}
