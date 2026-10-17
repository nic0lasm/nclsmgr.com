"use client";

import { useParams } from "next/navigation";
import { defaultLocale, isLocale } from "@/lib/i18n";
import { chrome, localizedPath, siteOwner } from "@/lib/navigation";

// Page 404 dans la langue de l'adresse, rendue dans la mise en page du site.
// Une page qui appelle notFound() ne transmet pas ses paramètres : la langue vient de l'URL.
export default function NotFound() {
  const params = useParams<{ lang?: string }>();
  const lang = params.lang && isLocale(params.lang) ? params.lang : defaultLocale;
  const t = chrome[lang];

  return (
    <main id="contenu" className="wrap">
      <title>{`${t.notFoundTitle} · ${siteOwner}`}</title>
      <section className="section" aria-labelledby="titre">
        <p className="section__label">404</p>
        <div className="section__body prose">
          <h1 id="titre">{t.notFoundTitle}</h1>
          <p>{t.notFoundText}</p>
          <p>
            <a href={localizedPath(lang, "")}>{t.notFoundHome}</a>
          </p>
        </div>
      </section>
    </main>
  );
}
