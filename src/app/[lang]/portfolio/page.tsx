import Link from "next/link";
import type { EtudeDeCas, Interface } from "@/content/types";
import { getContent } from "@/lib/content";
import { caseMeta } from "@/lib/dates";
import type { Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { resolveLocale } from "@/lib/route";

export function generateMetadata({ params }: PageProps<"/[lang]/portfolio">) {
  return pageMetadata(params, "portfolio", "/portfolio");
}

function Liste({ titre, items }: { titre: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4>{titre}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Etude({ etude, lang, ui }: { etude: EtudeDeCas; lang: Locale; ui: Interface }) {
  const t = ui.portfolio;
  return (
    <article className="project" aria-labelledby={`etude-${etude.id}`}>
      <h3 id={`etude-${etude.id}`}>{etude.titre}</h3>
      <p className="project__meta">{caseMeta(etude, lang, ui.cv.enCours)}</p>
      <div>
        <h4>{t.contexte}</h4>
        <p>{etude.contexte}</p>
      </div>
      <div>
        <h4>{t.role}</h4>
        <p>{etude.role}</p>
      </div>
      <Liste titre={t.enjeux} items={etude.enjeux} />
      <Liste titre={t.actions} items={etude.actions} />
      <Liste titre={t.resultats} items={etude.resultats} />
      {etude.note ? <p className="muted">{etude.note}</p> : null}
      {etude.liens.length > 0 ? (
        <ul className="project__links">
          {etude.liens.map((l) => (
            <li key={l.url}>
              <a href={l.url} rel="noopener noreferrer">
                {l.libelle}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export default async function PagePortfolio({ params }: PageProps<"/[lang]/portfolio">) {
  const lang = await resolveLocale(params);
  const { portfolio, ui } = getContent(lang);

  return (
    <main id="contenu" className="wrap">
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{ui.portfolio.titre}</p>
        <div className="section__body">
          <h1 id="titre">{ui.portfolio.titre}</h1>
          <p className="lead">{portfolio.intro}</p>
        </div>
      </section>

      <section className="section" aria-labelledby="etudes">
        <h2 className="section__label" id="etudes">
          {ui.portfolio.etudes}
        </h2>
        <div className="section__body">
          {portfolio.etudes.map((etude) => (
            <Etude key={etude.id} etude={etude} lang={lang} ui={ui} />
          ))}
        </div>
      </section>

      {portfolio.annexe.length > 0 ? (
        <section className="section" aria-labelledby="annexe">
          <h2 className="section__label" id="annexe">
            {ui.portfolio.annexe}
          </h2>
          <div className="section__body">
            {portfolio.annexe.map((etude) => (
              <Etude key={etude.id} etude={etude} lang={lang} ui={ui} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="section" aria-labelledby="autres">
        <h2 className="section__label" id="autres">
          {portfolio.autres.titre}
        </h2>
        <div className="section__body">
          <p>{portfolio.autres.texte}</p>
          <p>
            <Link href={`/${lang}${portfolio.autres.lien.chemin}`}>
              {portfolio.autres.lien.libelle}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
