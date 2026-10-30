import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { articleExists, getArticle } from "@/lib/articles";
import { getContent } from "@/lib/content";
import { formatDay } from "@/lib/dates";
import { isLocale } from "@/lib/i18n";
import { MarkdownView } from "@/lib/markdown-view";
import { resolveLocale } from "@/lib/route";

type Props = PageProps<"/[lang]/articles/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const article = await getArticle(lang, slug);
  if (!article) return {};
  const { seo } = getContent(lang);
  const route = `/articles/${article.slug}`;
  return {
    title: `${article.titre} · ${seo.site.auteur}`,
    description: article.description,
    alternates: {
      canonical: `/${lang}${route}`,
      // Seules les langues dans lesquelles l'article existe.
      languages: Object.fromEntries(article.langues.map((l) => [l, `/${l}${route}`])),
    },
    openGraph: {
      type: "article",
      siteName: seo.site.nom,
      locale: seo.site.locale,
      url: `/${lang}${route}`,
      title: article.titre,
      description: article.description,
      publishedTime: article.date,
      authors: [seo.site.auteur],
    },
  };
}

export default async function PageArticle({ params }: Props) {
  const lang = await resolveLocale(params);
  const { slug } = await params;
  const article = await getArticle(lang, slug);
  if (!article) {
    // Article écrit dans une autre langue seulement : retour à la liste, qui le propose.
    if (await articleExists(slug)) redirect(`/${lang}/articles`);
    notFound();
  }
  const { ui } = getContent(lang);

  return (
    <main id="contenu" className="wrap">
      <article className="section" aria-labelledby="titre">
        <p className="section__label">
          <Link href={`/${lang}/articles`}>{ui.articles.tous}</Link>
        </p>
        <div className="section__body prose">
          <h1 id="titre">{article.titre}</h1>
          <p className="muted">
            {ui.articles.publieLe}{" "}
            <time dateTime={article.date}>{formatDay(article.date, lang)}</time>
          </p>
          <MarkdownView blocks={article.doc.blocks} locale={lang} />
        </div>
      </article>
    </main>
  );
}
