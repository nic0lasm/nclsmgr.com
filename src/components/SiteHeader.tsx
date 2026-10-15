import Link from "next/link";
import { LanguageLink } from "@/components/LanguageLink";
import { MobileMenu } from "@/components/MobileMenu";
import { NavLinks } from "@/components/NavLinks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getContent } from "@/lib/content";
import type { Locale } from "@/lib/i18n";
import { chrome, navLinks, siteOwner } from "@/lib/navigation";

export function SiteHeader({ lang }: { lang: Locale }) {
  const t = chrome[lang];
  const other: Locale = lang === "fr" ? "en" : "fr";
  const links = navLinks(lang);
  // Tant qu'une seule page est publiée, ni menu ni navigation : le nom mène à l'accueil.
  const hasNav = links.length > 1;

  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Link className="site-brand" href={`/${lang}`}>
          <span className="site-brand__name">{siteOwner}</span>
          <span className="site-brand__role">{getContent(lang).profil.intitule}</span>
        </Link>
        {hasNav && (
          <nav className="site-nav" aria-label={t.navLabel}>
            <NavLinks links={links} listClassName="site-nav__list" linkClassName="site-nav__link" />
          </nav>
        )}
        <div className="header-tools">
          <LanguageLink
            target={other}
            name={t.otherLanguage}
            className={hasNav ? "lang-switch lang-switch--desktop" : "lang-switch"}
          />
          <ThemeToggle
            labels={{ toDark: t.themeToDark, toLight: t.themeToLight, generic: t.themeGeneric }}
          />
          {hasNav && (
            <MobileMenu label={t.menu}>
              <nav aria-label={t.navLabel}>
                <NavLinks links={links} />
              </nav>
              <LanguageLink target={other} name={t.otherLanguage} />
            </MobileMenu>
          )}
        </div>
      </div>
    </header>
  );
}
