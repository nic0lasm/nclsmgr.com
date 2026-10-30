import Link from "next/link";
import { getArticles } from "@/lib/articles";
import { getContent } from "@/lib/content";
import { formatDay } from "@/lib/dates";
import { locales } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { resolveLocale } from "@/lib/route";

export function generateMetadata({ params }: PageProps<"/[lang]/articles">) {
  return pageMetadata(params, "articles", "/articles");
}

export default async function PageArticles({ params }: PageProps<"/[lang]/articles">) {
  const lang = await resolveLocale(params);
  const { ui } = getContent(lang);
  const t = ui.articles;

  // Une langue sans article propose ceux des autres langues, signalés comme tels.
  let articles = await getArticles(lang);
  let autreLangue = false;
  if (articles.length === 0) {
    for (const l of locales) {
      if (l === lang) continue;
      articles = await getArticles(l);
      if (articles.length > 0) {
        autreLangue = true;
        break;
      }
    }
  }

  return (
    <main id="contenu" className="wrap">
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{t.titre}</p>
        <div className="section__body">
          <h1 id="titre">{t.titre}</h1>
          {articles.length === 0 ? <p className="lead">{t.aucun}</p> : null}
          {autreLangue ? <p className="muted">{t.enFrancais}</p> : null}
          {articles.map((a) => {
            const langue = a.langues.includes(lang) ? lang : a.langues[0];
            return (
              <article key={a.slug} className="project" aria-labelledby={`article-${a.slug}`}>
                <h2 id={`article-${a.slug}`} lang={langue === lang ? undefined : langue}>
                  <Link href={`/${langue}/articles/${a.slug}`}>{a.titre}</Link>
                </h2>
                <p className="project__meta">
                  <time dateTime={a.date}>{formatDay(a.date, lang)}</time>
                </p>
                <p lang={langue === lang ? undefined : langue}>{a.description}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
