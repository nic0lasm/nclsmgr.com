import Link from "next/link";
import { getContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import { resolveLocale } from "@/lib/route";

export function generateMetadata({ params }: PageProps<"/[lang]">) {
  return pageMetadata(params, "accueil", "");
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const lang = await resolveLocale(params);
  const { profil, ui } = getContent(lang);

  return (
    <main id="contenu" className="wrap">
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{ui.accueil.profil}</p>
        <div className="section__body">
          <h1 id="titre">{profil.nom}</h1>
          <p className="profile__role">{profil.intitule}</p>
          <p className="lead">{profil.accroche}</p>
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

      <section className="section" aria-labelledby="parcours">
        <h2 className="section__label" id="parcours">
          {ui.accueil.parcours}
        </h2>
        <div className="section__body prose">
          {profil.resume.map((paragraphe) => (
            <p key={paragraphe}>{paragraphe}</p>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="chiffres">
        <h2 className="section__label" id="chiffres">
          {ui.accueil.chiffresCles}
        </h2>
        <div className="section__body">
          <dl className="facts">
            {profil.chiffres_cles.map((c) => (
              <div key={c.libelle}>
                <dt>{c.libelle}</dt>
                <dd>{c.valeur}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
