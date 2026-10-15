import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { fontVariables } from "@/app/fonts";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale, locales } from "@/lib/i18n";
import { chrome } from "@/lib/navigation";
import { themeInitScript } from "@/lib/theme";
import "../globals.css";

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = getDictionary(lang);
  return {
    title: dict.title,
    description: dict.description,
    alternates: { languages: { fr: "/fr", en: "/en" } },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // data-theme est posé par le script initial avant l'hydratation.
    <html lang={lang} className={fontVariables} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a className="skip-link" href="#contenu">
          {chrome[lang].skipLink}
        </a>
        <SiteHeader lang={lang} />
        {children}
        <SiteFooter lang={lang} />
      </body>
    </html>
  );
}
