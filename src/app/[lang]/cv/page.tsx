import { getContent } from "@/lib/content";
import { formatMonth, formatPeriod } from "@/lib/dates";
import { pageMetadata } from "@/lib/metadata";
import { resolveLocale } from "@/lib/route";

export function generateMetadata({ params }: PageProps<"/[lang]/cv">) {
  return pageMetadata(params, "cv", "/cv");
}

export default async function Cv({ params }: PageProps<"/[lang]/cv">) {
  const lang = await resolveLocale(params);
  const { profil, parcours, competences, ui } = getContent(lang);
  // Typographie : espace avant les deux-points en français seulement.
  const sep = lang === "fr" ? " : " : ": ";

  return (
    <main id="contenu" className="wrap">
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{ui.cv.titre}</p>
        <div className="section__body">
          <h1 id="titre">{profil.nom}</h1>
          <p className="profile__role">{profil.intitule}</p>
          <p className="lead">{profil.accroche}</p>
        </div>
      </section>

      <section className="section" aria-labelledby="experiences">
        <h2 className="section__label" id="experiences">
          {ui.cv.experiences}
        </h2>
        <div className="section__body">
          <ol className="timeline">
            {parcours.experiences.map((exp) => (
              <li className="timeline__item" key={exp.id}>
                <p className="timeline__period">
                  {formatPeriod(exp.debut, exp.fin, lang, ui.cv.enCours)}
                </p>
                <div>
                  <h3>{exp.poste}</h3>
                  <p className="timeline__org">
                    {exp.organisation}
                    {exp.lieu ? ` · ${exp.lieu}` : null}
                  </p>
                  {exp.contexte ? <p className="timeline__text">{exp.contexte}</p> : null}
                  {exp.realisations.length > 0 ? (
                    <ul className="timeline__text">
                      {exp.realisations.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="competences">
        <h2 className="section__label" id="competences">
          {ui.cv.competences}
        </h2>
        <div className="section__body skill-groups">
          {competences.domaines.map((d) => (
            <div key={d.id}>
              <h3>{d.libelle}</h3>
              <ul>
                {d.elements.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {parcours.certifications.length > 0 ? (
        <section className="section" aria-labelledby="certifications">
          <h2 className="section__label" id="certifications">
            {ui.cv.certifications}
          </h2>
          <div className="section__body">
            <ul>
              {parcours.certifications.map((c) => (
                <li key={c.id}>
                  {c.nom}, {c.organisme} · {formatMonth(c.obtention, lang)}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="section" aria-labelledby="formations">
        <h2 className="section__label" id="formations">
          {ui.cv.formations}
        </h2>
        <div className="section__body">
          <ol className="timeline">
            {parcours.formations.map((f) => (
              <li className="timeline__item" key={f.id}>
                <p className="timeline__period">
                  {formatPeriod(f.debut, f.fin, lang, ui.cv.enCours)}
                </p>
                <div>
                  <h3>{f.diplome}</h3>
                  <p className="timeline__org">
                    {f.etablissement}
                    {f.lieu ? ` · ${f.lieu}` : null}
                  </p>
                  {f.detail ? <p className="timeline__text">{f.detail}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="langues">
        <h2 className="section__label" id="langues">
          {ui.cv.langues}
        </h2>
        <div className="section__body">
          <ul>
            {profil.langues.map((l) => (
              <li key={l.langue}>
                {l.langue}
                {sep}
                {l.niveau}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="interets">
        <h2 className="section__label" id="interets">
          {ui.cv.centresInteret}
        </h2>
        <div className="section__body">
          <ul>
            {profil.centres_interet.map((c) => (
              <li key={c.libelle}>
                {c.libelle}
                {c.detail ? `${sep}${c.detail}` : null}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
