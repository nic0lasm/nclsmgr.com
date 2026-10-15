import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { PageSeo } from "@/content/types";
import { getContent, getPage, type PageTexte } from "@/lib/content";
import { MarkdownView } from "@/lib/markdown-view";
import { pageMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/route";

// Pages de texte rédigées en Markdown : contact, mentions légales, confidentialité.
// `suite` ajoute un bloc sous le texte, comme le formulaire de la page contact.
export function textPage(page: PageTexte, seoKey: PageSeo, suite?: (lang: Locale) => ReactNode) {
  async function generateMetadata({
    params,
  }: {
    params: Promise<{ lang: string }>;
  }): Promise<Metadata> {
    return pageMetadata(params, seoKey, `/${page}`);
  }

  async function Page({ params }: { params: Promise<{ lang: string }> }) {
    const lang = await resolveLocale(params);
    const { profil } = getContent(lang);
    const doc = await getPage(lang, page);

    return (
      <main id="contenu" className="wrap">
        <section className="section" aria-labelledby="titre">
          <p className="section__label">{profil.nom}</p>
          <div className="section__body prose">
            <h1 id="titre">{doc.frontmatter.titre}</h1>
            <MarkdownView blocks={doc.blocks} locale={lang} />
            {suite?.(lang)}
          </div>
        </section>
      </main>
    );
  }

  return { generateMetadata, Page };
}
