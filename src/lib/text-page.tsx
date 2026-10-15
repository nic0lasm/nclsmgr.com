import type { Metadata } from "next";
import type { PageSeo } from "@/content/types";
import { getContent, getPage, type PageTexte } from "@/lib/content";
import { MarkdownView } from "@/lib/markdown-view";
import { pageMetadata } from "@/lib/metadata";
import { resolveLocale } from "@/lib/route";

// Pages de texte rédigées en Markdown : contact, mentions légales, confidentialité.
export function textPage(page: PageTexte, seoKey: PageSeo) {
  async function generateMetadata({
    params,
  }: {
    params: Promise<{ lang: string }>;
  }): Promise<Metadata> {
    return pageMetadata(params, seoKey, `/${page}`);
  }

  async function Page({ params }: { params: Promise<{ lang: string }> }) {
    const lang = await resolveLocale(params);
    const { ui, profil } = getContent(lang);
    const doc = await getPage(lang, page);
    const linkedin = profil.liens.find((l) => l.type === "linkedin");

    return (
      <main id="contenu" className="wrap">
        <section className="section" aria-labelledby="titre">
          <p className="section__label">{profil.nom}</p>
          <div className="section__body prose">
            <h1 id="titre">{doc.frontmatter.titre}</h1>
            <MarkdownView blocks={doc.blocks} locale={lang} />
            {page === "contact" && linkedin ? (
              <div className="actions">
                <a
                  className="button button--secondary"
                  href={linkedin.url}
                  rel="noopener noreferrer"
                >
                  {ui.contact.linkedin}
                </a>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  return { generateMetadata, Page };
}
