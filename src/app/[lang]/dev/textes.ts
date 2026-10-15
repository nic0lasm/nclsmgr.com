import type { Locale } from "@/lib/i18n";

export const textes = {
  fr: {
    titrePage: "Dev",
    description:
      "Projets open source de Nicolas : présentation, stack, rôle et façon d'y contribuer.",
    intro:
      "Une sélection de projets présentés en détail, puis la liste de mes autres dépôts publics sur GitHub.",
    selection: "Projets mis en avant",
    probleme: "Le besoin",
    role: "Mon rôle",
    pointsForts: "Points forts",
    contribuer: "Contribuer",
    stack: "Technologies",
    autres: "Autres dépôts publics",
    aucunAutre: "Pas d'autre dépôt public pour le moment.",
    actifLe: "Dernière activité le",
    etoiles: (n: number) => (n > 1 ? `${n} étoiles` : `${n} étoile`),
    miseAJour: "Liste issue de GitHub, mise à jour le",
    surGithub: "Tous mes dépôts sur GitHub",
    accueil: "Accueil",
  },
  en: {
    titrePage: "Dev",
    description:
      "Nicolas's open source projects: what they do, the stack, his role and how to contribute.",
    intro:
      "A few projects described in detail, then the list of my other public repositories on GitHub.",
    selection: "Featured projects",
    probleme: "The need",
    role: "My role",
    pointsForts: "Highlights",
    contribuer: "Contributing",
    stack: "Technologies",
    autres: "Other public repositories",
    aucunAutre: "No other public repository yet.",
    actifLe: "Last active on",
    etoiles: (n: number) => (n > 1 ? `${n} stars` : `${n} star`),
    miseAJour: "List taken from GitHub, updated on",
    surGithub: "All my repositories on GitHub",
    accueil: "Home",
  },
} satisfies Record<Locale, Record<string, string | ((n: number) => string)>>;

export function formaterDate(iso: string, lang: Locale): string {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}
