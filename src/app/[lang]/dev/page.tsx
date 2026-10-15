import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isLocale, type Locale } from "@/lib/i18n";
import { donneesOngletDev, type FicheAffichee } from "@/lib/projets";
import type { Depot } from "@/lib/github";
import { formaterDate, textes } from "./textes";
import "./dev.css";

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

function Fiche({ fiche, lang }: { fiche: FicheAffichee; lang: Locale }) {
  const t = textes[lang];
  return (
    <article className="fiche" aria-labelledby={`fiche-${fiche.id}`}>
      <header className="fiche-entete">
        <h3 id={`fiche-${fiche.id}`}>{fiche.titre}</h3>
        <p className="pitch">{fiche.pitch}</p>
        {fiche.github && (
          <p className="meta">
            {[
              fiche.github.langage,
              fiche.github.licence,
              fiche.github.etoiles > 0 ? t.etoiles(fiche.github.etoiles) : null,
              `${t.actifLe} ${formaterDate(fiche.github.actifLe, lang)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </header>

      {fiche.visuel && fiche.image && (
        // next/image ajoute un attribut style que la CSP refuse : balise img simple.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="visuel"
          src={fiche.visuel.src}
          width={fiche.visuel.width}
          height={fiche.visuel.height}
          alt={fiche.image.alt}
          loading="lazy"
          decoding="async"
        />
      )}

      {fiche.chiffres && fiche.chiffres.length > 0 && (
        <dl className="chiffres">
          {fiche.chiffres.map((c) => (
            <div key={c.libelle}>
              <dt>{c.libelle}</dt>
              <dd>{c.valeur}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="fiche-corps">
        <section>
          <h4>{t.probleme}</h4>
          <p>{fiche.probleme}</p>
        </section>
        <section>
          <h4>{t.role}</h4>
          <p>{fiche.role}</p>
        </section>
        <section>
          <h4>{t.pointsForts}</h4>
          <ul>
            {fiche.points_forts.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
        {fiche.contribuer && (
          <section>
            <h4>{t.contribuer}</h4>
            <p>{fiche.contribuer}</p>
          </section>
        )}
      </div>

      <footer className="fiche-pied">
        <ul className="stack" aria-label={t.stack}>
          {fiche.stack.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <ul className="liens">
          {fiche.liens.map((l) => (
            <li key={l.url}>
              <a href={l.url} rel="noopener noreferrer">
                {l.libelle}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </article>
  );
}

function CarteDepot({ depot, lang }: { depot: Depot; lang: Locale }) {
  const t = textes[lang];
  return (
    <li className="depot">
      <a href={depot.url} rel="noopener noreferrer" className="depot-nom">
        {depot.nom}
      </a>
      {depot.description && <p>{depot.description}</p>}
      <p className="meta">
        {[
          depot.langage,
          depot.etoiles > 0 ? t.etoiles(depot.etoiles) : null,
          `${t.actifLe} ${formaterDate(depot.actifLe, lang)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </li>
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
    <main className="dev">
      <nav className="fil">
        <Link href={`/${lang}`}>{t.accueil}</Link>
      </nav>
      <header className="dev-entete">
        <h1>{t.titrePage}</h1>
        <p>{t.intro}</p>
      </header>

      <section aria-labelledby="selection">
        <h2 id="selection">{t.selection}</h2>
        <div className="fiches">
          {fiches.map((f) => (
            <Fiche key={f.id} fiche={f} lang={lang} />
          ))}
        </div>
      </section>

      <section aria-labelledby="autres">
        <h2 id="autres">{t.autres}</h2>
        {autres.length > 0 ? (
          <ul className="depots">
            {autres.map((d) => (
              <CarteDepot key={d.depot} depot={d} lang={lang} />
            ))}
          </ul>
        ) : (
          <p className="muted">{t.aucunAutre}</p>
        )}
        <p className="muted source">
          {genereLe && `${t.miseAJour} ${formaterDate(genereLe, lang)}. `}
          <a href="https://github.com/nic0lasm" rel="noopener noreferrer">
            {t.surGithub}
          </a>
        </p>
      </section>
    </main>
  );
}
