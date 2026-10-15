import type { Locale } from "@/lib/i18n";

export const textes = {
  fr: {
    metaTitre: "Espace privé",
    etiquette: "Espace privé",
    titre: "Votre espace privé",
    bonjour: "Bonjour",
    quitter: "Quitter l'espace",
  },
  en: {
    metaTitre: "Private space",
    etiquette: "Private space",
    titre: "Your private space",
    bonjour: "Hello",
    quitter: "Leave the space",
  },
} satisfies Record<Locale, Record<string, string>>;
