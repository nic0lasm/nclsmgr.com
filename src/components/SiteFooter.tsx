import type { Locale } from "@/lib/i18n";
import { chrome, siteOwner, sourceUrl } from "@/lib/navigation";

export function SiteFooter({ lang }: { lang: Locale }) {
  const t = chrome[lang];
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__inner">
        <span>
          © {new Date().getFullYear()} {siteOwner}
        </span>
        <ul>
          <li>
            <a href={sourceUrl} rel="noopener">
              {t.source}
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
