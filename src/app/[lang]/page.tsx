import Link from "next/link";
import { getContent } from "@/lib/content";
import { fichesMisesEnAvant } from "@/lib/projets";
import { pageMetadata } from "@/lib/metadata";
import { resolveLocale } from "@/lib/route";

export function generateMetadata({ params }: PageProps<"/[lang]">) {
  return pageMetadata(params, "accueil", "");
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const lang = await resolveLocale(params);
  const { accueil, profil, ui } = getContent(lang);
  const { referentiels } = accueil;
  // Les deux premières fiches illustrées de l'onglet Dev, dans son ordre.
  const projets = fichesMisesEnAvant(lang, [])
    .filter((f) => f.image)
    .slice(0, 2);

  return (
    <main id="contenu" className="wrap">
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{ui.accueil.site}</p>
        <div className="section__body">
          <h1 id="titre">{accueil.site.titre}</h1>
          <p className="lead">{accueil.site.accroche}</p>
          {accueil.site.texte.map((paragraphe) => (
            <p className="prose" key={paragraphe}>
              {paragraphe}
            </p>
          ))}
          <div className="actions">
            <a className="button button--primary" href="#securite">
              {ui.accueil.voirMesures}
            </a>
            <a className="button button--secondary" href={accueil.code.liens[0]?.url}>
              {ui.accueil.lireCode}
            </a>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="controles">
        <h2 className="section__label" id="controles">
          {ui.accueil.controles}
        </h2>
        <div className="section__body">
          <dl className="facts facts--badges">
            {accueil.controles.map((c) => (
              <div key={c.libelle}>
                <dt>{c.libelle}</dt>
                <dd className="facts__grade">{c.valeur}</dd>
                {c.url ? (
                  <dd className="facts__link">
                    <a href={c.url}>
                      {ui.accueil.voirResultat}
                      <span className="visually-hidden">{`${lang === "fr" ? " : " : ": "}${c.libelle}`}</span>
                    </a>
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section" aria-labelledby="securite">
        <h2 className="section__label" id="securite">
          {ui.accueil.securite}
        </h2>
        <div className="section__body">
          <p className="prose">{accueil.securite.intro}</p>
          <ul className="timeline">
            {accueil.securite.mesures.map((m) => (
              <li className="timeline__item" key={m.titre}>
                <h3 className="timeline__period">{m.titre}</h3>
                <p className="timeline__text">{m.texte}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="referentiels">
        <h2 className="section__label" id="referentiels">
          {ui.accueil.referentiels}
        </h2>
        <div className="section__body">
          <p className="prose">{referentiels.intro}</p>
          <div className="table-scroll">
            <table className="data-table" aria-labelledby="referentiels">
              <thead>
                <tr>
                  <th scope="col">{referentiels.colonnes.referentiel}</th>
                  <th scope="col">{referentiels.colonnes.application}</th>
                </tr>
              </thead>
              <tbody>
                {referentiels.elements.map((r) => (
                  <tr key={r.id}>
                    <td>{r.nom}</td>
                    <td>{r.application}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="code">
        <h2 className="section__label" id="code">
          {ui.accueil.code}
        </h2>
        <div className="section__body">
          <p className="prose">{accueil.code.texte}</p>
          <ul className="project__links">
            {accueil.code.liens.map((l) => (
              <li key={l.url}>
                <a href={l.url}>{l.libelle}</a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="projets">
        <h2 className="section__label" id="projets">
          {ui.accueil.projets}
        </h2>
        <div className="section__body">
          <p className="prose">{ui.accueil.projetsIntro}</p>
          {projets.map((f) => (
            <article className="project" key={f.id} aria-labelledby={`accueil-${f.id}`}>
              <h3 id={`accueil-${f.id}`}>
                <Link href={`/${lang}/dev#projet-${f.id}`}>{f.titre}</Link>
              </h3>
              <p>{f.pitch}</p>
              {f.chiffres && f.chiffres.length > 0 && (
                <p className="project__figures">
                  {f.chiffres.map((c) => `${c.valeur} ${c.libelle}`).join(" · ")}
                </p>
              )}
              <ul className="project__links">
                {f.liens.slice(0, 2).map((l) => (
                  <li key={l.url}>
                    <a href={l.url}>{l.libelle}</a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
          <div className="actions">
            <Link className="button button--secondary" href={`/${lang}/dev`}>
              {ui.accueil.voirDev}
            </Link>
            <Link className="button button--secondary" href={`/${lang}/portfolio`}>
              {ui.accueil.voirPortfolio}
            </Link>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="auteur">
        <h2 className="section__label" id="auteur">
          {ui.accueil.auteur}
        </h2>
        <div className="section__body">
          <h3>{profil.nom}</h3>
          <p className="profile__role">{profil.intitule}</p>
          <p className="lead">{profil.accroche}</p>
          {accueil.presentation.map((paragraphe) => (
            <p className="prose" key={paragraphe}>
              {paragraphe}
            </p>
          ))}
          <div className="actions">
            <Link className="button button--primary" href={`/${lang}/cv`}>
              {ui.accueil.voirCv}
            </Link>
            <Link className="button button--secondary" href={`/${lang}/contact`}>
              {ui.accueil.meContacter}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
