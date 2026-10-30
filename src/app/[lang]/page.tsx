import Link from "next/link";
import { getContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import { resolveLocale } from "@/lib/route";

export function generateMetadata({ params }: PageProps<"/[lang]">) {
  return pageMetadata(params, "accueil", "");
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const lang = await resolveLocale(params);
  const { accueil, profil, ui } = getContent(lang);
  const { referentiels } = accueil;

  return (
    <main id="contenu" className="wrap">
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{ui.accueil.profil}</p>
        <div className="section__body">
          <h1 id="titre">{profil.nom}</h1>
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
                  <th scope="col">{referentiels.colonnes.niveau}</th>
                </tr>
              </thead>
              <tbody>
                {referentiels.elements.map((r) => (
                  <tr key={r.id}>
                    <td>{r.nom}</td>
                    <td>{r.application}</td>
                    <td className="is-numeric">{referentiels.niveaux[r.niveau]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="controles">
        <h2 className="section__label" id="controles">
          {ui.accueil.controles}
        </h2>
        <div className="section__body">
          <dl className="facts">
            {accueil.controles.map((c) => (
              <div key={c.libelle}>
                <dt>{c.libelle}</dt>
                <dd>{c.valeur}</dd>
              </div>
            ))}
          </dl>
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
    </main>
  );
}
