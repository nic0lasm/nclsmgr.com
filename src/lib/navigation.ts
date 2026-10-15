import type { Locale } from "@/lib/i18n";

export const siteOwner = "Nicolas Maigre";
export const sourceUrl = "https://github.com/nic0lasm/nclsmgr.com";

// Pages légales, liées depuis le pied de chaque page.
export const legalSegments = { legal: "mentions-legales", privacy: "confidentialite" } as const;

// Onglet Dev : hors du menu principal, lié depuis le pied de page et le portfolio.
export const devSegment = "dev";

type NavEntry = {
  segment: string;
  label: Record<Locale, string>;
  // Passe à true quand la page existe : seules les pages publiées apparaissent dans le menu.
  published: boolean;
};

export const navEntries: readonly NavEntry[] = [
  { segment: "", label: { fr: "Accueil", en: "Home" }, published: true },
  { segment: "cv", label: { fr: "CV", en: "Résumé" }, published: true },
  { segment: "portfolio", label: { fr: "Portfolio", en: "Portfolio" }, published: true },
  { segment: "articles", label: { fr: "Articles", en: "Articles" }, published: true },
  { segment: "contact", label: { fr: "Contact", en: "Contact" }, published: true },
];

export type NavLink = { href: string; label: string };

export function localizedPath(lang: Locale, segment: string): string {
  return segment ? `/${lang}/${segment}` : `/${lang}`;
}

export function navLinks(lang: Locale): NavLink[] {
  return navEntries
    .filter((entry) => entry.published)
    .map((entry) => ({ href: localizedPath(lang, entry.segment), label: entry.label[lang] }));
}

// L'accueil n'est actif que sur sa propre adresse ; une rubrique l'est aussi sur ses sous-pages.
export function isCurrentPath(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (href.split("/").length === 2) return path === href;
  return path === href || path.startsWith(`${href}/`);
}

// Même page dans l'autre langue : seul le premier segment change.
export function switchLocalePath(pathname: string, target: Locale): string {
  const [, , ...rest] = pathname.split("/");
  const tail = rest.filter(Boolean).join("/");
  return tail ? `/${target}/${tail}` : `/${target}`;
}

export const chrome = {
  fr: {
    skipLink: "Aller au contenu",
    navLabel: "Navigation principale",
    menu: "Menu",
    themeToDark: "Passer en thème sombre",
    themeToLight: "Passer en thème clair",
    themeGeneric: "Changer de thème",
    otherLanguage: "English",
    dev: "Projets dev",
    source: "Code source",
    legal: "Mentions légales",
    privacy: "Confidentialité",
  },
  en: {
    skipLink: "Skip to content",
    navLabel: "Main navigation",
    menu: "Menu",
    themeToDark: "Switch to dark theme",
    themeToLight: "Switch to light theme",
    themeGeneric: "Change theme",
    otherLanguage: "Français",
    dev: "Dev projects",
    source: "Source code",
    legal: "Legal notice",
    privacy: "Privacy",
  },
} satisfies Record<Locale, Record<string, string>>;
