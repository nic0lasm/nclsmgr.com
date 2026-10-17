import type { MetadataRoute } from "next";
import { getContent } from "@/lib/content";
import { locales } from "@/lib/i18n";
import { legalSegments, localizedPath, navEntries } from "@/lib/navigation";

// Pages publiques : menu, onglet Dev (hors menu) et pages légales, dans chaque langue.
const segmentsPublics = [
  ...navEntries.filter((entry) => entry.published).map((entry) => entry.segment),
  "dev",
  legalSegments.legal,
  legalSegments.privacy,
];

export default function sitemap(): MetadataRoute.Sitemap {
  const { url } = getContent("fr").seo.site;
  return segmentsPublics.flatMap((segment) =>
    locales.map((lang) => ({
      url: `${url}${localizedPath(lang, segment)}`,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${url}${localizedPath(l, segment)}`]),
        ),
      },
    })),
  );
}
