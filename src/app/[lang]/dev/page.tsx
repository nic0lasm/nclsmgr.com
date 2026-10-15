import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isLocale, type Locale } from "@/lib/i18n";
import { donneesOngletDev, type FicheAffichee } from "@/lib/projets";
import { formaterDate, textes } from "./textes";

export async function generateMetadata({ params }: PageProps<"/[lang]/dev">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = textes[lang];
  return {
    title: `${t.titrePage} · nclsmgr.com`,
    description: t.description,
    alternates: { languages: { fr: "/fr/dev", en: "/en/dev" } },
  };
}

function FicheProjet({ fiche, lang }: { fiche: FicheAffichee; lang: Locale }) {
  const t = textes[lang];
  const meta = [
    fiche.depot,
    fiche.github?.langage,
    fiche.github?.licence,
    fiche.github && fiche.github.etoiles > 0 ? t.etoiles(fiche.github.etoiles) : null,
    fiche.github ? `${t.misAJour} ${formaterDate(fiche.github.actifLe, lang)}` : null,
  ].filter(Boolean);

  return (
    <article className="project" aria-labelledby={`projet-${fiche.id}`}>
      <h3 id={`projet-${fiche.id}`}>{fiche.titre}</h3>
      <p>{fiche.pitch}</p>
      {fiche.chiffres && fiche.chiffres.length > 0 && (
        <p className="project__figures">
          {fiche.chiffres.map((c) => `${c.valeur} ${c.libelle}`).join(" · ")}
        </p>
      )}
      {fiche.visuel && fiche.image && (
        // next/image ajoute un attribut style que la CSP refuse : balise img simple.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fiche.visuel.src}
          width={fiche.visuel.width}
          height={fiche.visuel.height}
          alt={fiche.image.alt}
          loading="lazy"
          decoding="async"
        />
      )}
      <div>
        <h4>{t.probleme}</h4>
        <p>{fiche.probleme}</p>
      </div>
      <div>
        <h4>{t.role}</h4>
        <p>{fiche.role}</p>
      </div>
      <div>
        <h4>{t.pointsForts}</h4>
        <ul>
          {fiche.points_forts.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      {fiche.contribuer && (
        <div>
          <h4>{t.contribuer}</h4>
          <p>{fiche.contribuer}</p>
        </div>
      )}
      <ul className="tag-list" aria-label={t.stack}>
        {fiche.stack.map((s) => (
          <li key={s} className="tag">
            {s}
          </li>
        ))}
      </ul>
      {meta.length > 0 && <p className="project__meta">{meta.join(" · ")}</p>}
      <ul className="project__links">
        {fiche.liens.map((l) => (
          <li key={l.url}>
            <a href={l.url} rel="noopener noreferrer">
              {l.libelle}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default async function PageDev({ params }: PageProps<"/[lang]/dev">) {
  // Rendu à la requête pour le nonce CSP ; les données viennent de l'instantané du build.
  await connection();
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = textes[lang];
  const { fiches, autres, genereLe } = donneesOngletDev(lang);

  return (
    <main id="contenu" className="wrap">
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{t.titrePage}</p>
        <div className="section__body">
          <h1 id="titre">{t.titre}</h1>
          <p className="lead">{t.intro}</p>
        </div>
      </section>

      <section className="section" aria-labelledby="selection">
        <h2 id="selection" className="section__label">
          {t.selection}
        </h2>
        <div className="section__body">
          {fiches.map((f) => (
            <FicheProjet key={f.id} fiche={f} lang={lang} />
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="autres">
        <h2 id="autres" className="section__label">
          {t.autres}
        </h2>
        <div className="section__body">
          {autres.length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t.colDepot}</th>
                    <th scope="col">{t.colLangage}</th>
                    <th scope="col" className="is-optional">
                      {t.colLicence}
                    </th>
                    <th scope="col" className="is-numeric">
                      {t.colMaj}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {autres.map((d) => (
                    <tr key={d.depot}>
                      <td>
                        <a href={d.url} rel="noopener noreferrer">
                          {d.nom}
                        </a>
                        {d.description && <p className="muted">{d.description}</p>}
                      </td>
                      <td>{d.langage ?? "·"}</td>
                      <td className="is-optional">{d.licence ?? "·"}</td>
                      <td className="is-numeric">
                        <time dateTime={d.actifLe}>{formaterDate(d.actifLe, lang)}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{t.aucunAutre}</p>
          )}
          <p className="muted">
            {genereLe && `${t.miseAJour} ${formaterDate(genereLe, lang)}. `}
            <a href="https://github.com/nic0lasm" rel="noopener noreferrer">
              {t.surGithub}
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
