import type { Locale } from "@/lib/i18n";

const dictionaries = {
  fr: {
    title: "nclsmgr.com",
    description: "Site personnel d'un chef de projet cyber. Ouverture en novembre 2026.",
    role: "Chef de projet cyber",
    status: "Le site ouvre en novembre 2026.",
    detail: "Parcours, projets et réalisations seront présentés ici.",
    switchLabel: "English",
  },
  en: {
    title: "nclsmgr.com",
    description: "Personal website of a cybersecurity project manager. Opening in November 2026.",
    role: "Cybersecurity project manager",
    status: "The site opens in November 2026.",
    detail: "Background, projects and case studies will be presented here.",
    switchLabel: "Français",
  },
} satisfies Record<Locale, Record<string, string>>;

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}
