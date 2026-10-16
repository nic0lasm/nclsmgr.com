import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import {
  chrome,
  devSegment,
  legalSegments,
  localizedPath,
  siteOwner,
  sourceUrl,
} from "@/lib/navigation";

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
            <Link href={localizedPath(lang, devSegment)} prefetch={false}>
              {t.dev}
            </Link>
          </li>
          <li>
            <Link href={localizedPath(lang, legalSegments.legal)} prefetch={false}>
              {t.legal}
            </Link>
          </li>
          <li>
            <Link href={localizedPath(lang, legalSegments.privacy)} prefetch={false}>
              {t.privacy}
            </Link>
          </li>
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
