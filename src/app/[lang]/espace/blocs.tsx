import Link from "next/link";
import type { ReactNode } from "react";
import { getContent } from "@/lib/content";
import { formatPeriod } from "@/lib/dates";
import type { DocumentAffiche } from "@/lib/espace/documents";
import type { Lien } from "@/lib/espace/liens";
import { typeContact, type Coordonnees, type Reference } from "@/lib/espace/prive";
import { paragraphes, projetsPourContributeurs, type DocumentProjet } from "@/lib/espace/profils";
import type { Locale } from "@/lib/i18n";
import { donneesOngletDev } from "@/lib/projets";
import type { TextesEspace } from "./textes";

// Blocs de l'espace privé. Tous les textes, y compris ceux venant du lien ou de prive.json,
// sont rendus comme texte brut : React les échappe, aucun HTML ni Markdown n'est interprété.

type Commun = { lang: Locale; t: TextesEspace };

// Typographie : espace avant les deux-points en français seulement.
const separateur = (lang: Locale) => (lang === "fr" ? " : " : ": ");

function formaterJour(ms: number, lang: Locale): string {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(ms));
}

function LienExterne({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** Message nominatif : salutation, puis le message de Nico découpé en paragraphes. */
export function Message({ lien, lang, t }: Commun & { lien: Lien }) {
  // Le message est écrit dans la langue du lien, qui peut différer de celle de la page.
  const langueMessage = lien.langue === lang ? undefined : lien.langue;
  return (
    <div className="private-slip">
      <p className="private-slip__header">
        <span>{t.messagePersonnel}</span>
        {lien.organisation ? <span>{lien.organisation}</span> : null}
        <span>{`${t.accesJusquau} ${formaterJour(lien.expireLe, lang)}`}</span>
      </p>
      <div className="private-slip__body">
        <p className="private-slip__greeting">{`${t.bonjour} ${lien.destinataire},`}</p>
        {paragraphes(lien.message).map((paragraphe, i) => (
          <p key={i} lang={langueMessage}>
            {paragraphe}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Documents réservés du lien, présents au catalogue. Masqué s'il n'y en a aucun. Un lien <a>
 * simple et non next/link : le PDF n'est jamais préchargé, il n'est lu qu'au clic.
 */
export function Documents({ documents, lang, t }: Commun & { documents: DocumentAffiche[] }) {
  if (documents.length === 0) return null;
  return (
    <section className="section" aria-labelledby="documents">
      <h2 className="section__label" id="documents">
        {t.documents}
      </h2>
      <div className="section__body">
        <ul>
          {documents.map((d) => (
            <li key={d.id}>
              <a href={`/${lang}/espace/documents/${d.id}`}>
                <span lang={d.langue === lang ? undefined : d.langue}>{d.titre}</span>
                {` (${t.formatPdf})`}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Mise en avant du parcours, pour un recruteur. */
export function Parcours({ lang }: Commun) {
  const { profil, parcours, ui } = getContent(lang);
  return (
    <section className="section" aria-labelledby="parcours">
      <h2 className="section__label" id="parcours">
        {ui.accueil.parcours}
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
        <ol className="timeline">
          {parcours.experiences.map((exp) => (
            <li className="timeline__item" key={exp.id}>
              <p className="timeline__period">
                {formatPeriod(exp.debut, exp.fin, lang, ui.cv.enCours)}
              </p>
              <div>
                <h3>{exp.poste}</h3>
                <p className="timeline__org">{exp.organisation}</p>
                {exp.contexte ? <p className="timeline__text">{exp.contexte}</p> : null}
              </div>
            </li>
          ))}
        </ol>
        <div className="actions">
          <Link className="button button--primary" href={`/${lang}/cv`}>
            {ui.accueil.voirCv}
          </Link>
        </div>
      </div>
    </section>
  );
}

function Contact({ contact, lang, t }: Commun & { contact: string }) {
  const type = typeContact(contact);
  const valeur =
    type === "email" ? (
      <a href={`mailto:${contact}`}>{contact}</a>
    ) : type === "telephone" ? (
      <a href={`tel:${contact.replace(/[ .-]/g, "")}`}>{contact}</a>
    ) : (
      contact
    );
  return (
    <p>
      {t.contact}
      {separateur(lang)}
      {valeur}
    </p>
  );
}

/** Références, lues dans prive.json. Masquées s'il n'y en a pas. */
export function References({ references, lang, t }: Commun & { references: Reference[] }) {
  if (references.length === 0) return null;
  return (
    <section className="section" aria-labelledby="references">
      <h2 className="section__label" id="references">
        {t.references}
      </h2>
      <div className="section__body">
        {references.map((r, i) => (
          <article className="project" key={i} aria-labelledby={`reference-${i}`}>
            <h3 id={`reference-${i}`}>{r.nom}</h3>
            {r.role || r.organisation ? (
              <p className="project__meta">
                {[r.role, r.organisation].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {paragraphes(r.texte).map((paragraphe, j) => (
              <p key={j}>{paragraphe}</p>
            ))}
            {r.contact ? <Contact contact={r.contact} lang={lang} t={t} /> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Coordonnées, lues dans prive.json. Masquées si elles manquent. */
export function BlocCoordonnees({
  coordonnees,
  t,
}: Pick<Commun, "t"> & {
  coordonnees: Coordonnees | null;
}) {
  if (!coordonnees) return null;
  const { telephone, email, ville, linkedin } = coordonnees;
  const lignes: { libelle: string; valeur: ReactNode }[] = [];
  if (telephone) {
    lignes.push({
      libelle: t.telephone,
      valeur: <a href={`tel:${telephone.replace(/[ .-]/g, "")}`}>{telephone}</a>,
    });
  }
  if (email) lignes.push({ libelle: t.email, valeur: <a href={`mailto:${email}`}>{email}</a> });
  if (ville) lignes.push({ libelle: t.ville, valeur: ville });
  if (linkedin) {
    const affichage = linkedin.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
    lignes.push({
      libelle: t.linkedin,
      valeur: <LienExterne href={linkedin}>{affichage}</LienExterne>,
    });
  }
  return (
    <section className="section" aria-labelledby="coordonnees">
      <h2 className="section__label" id="coordonnees">
        {t.coordonnees}
      </h2>
      <div className="section__body">
        <dl className="facts">
          {lignes.map((l) => (
            <div key={l.libelle}>
              <dt>{l.libelle}</dt>
              <dd>{l.valeur}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function ListeDocuments({
  id,
  titre,
  documents,
  lang,
}: {
  id: string;
  titre: string;
  documents: DocumentProjet[];
  lang: Locale;
}) {
  if (documents.length === 0) return null;
  return (
    <section className="section" aria-labelledby={id}>
      <h2 className="section__label" id={id}>
        {titre}
      </h2>
      <div className="section__body">
        <ul>
          {documents.map((d) => (
            <li key={d.url}>
              {d.projet}
              {separateur(lang)}
              <LienExterne href={d.url}>{d.libelle}</LienExterne>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Projets ouverts aux contributions, feuilles de route et guides, pour un développeur. */
export function Contributions({ lang, t }: Commun) {
  const { fiches } = donneesOngletDev(lang);
  const { ouverts, projets, feuillesDeRoute, guides } = projetsPourContributeurs(fiches);
  return (
    <>
      <section className="section" aria-labelledby="contributions">
        <h2 className="section__label" id="contributions">
          {ouverts ? t.contributions : t.projetsPublics}
        </h2>
        <div className="section__body">
          {projets.map((f) => (
            <article className="project" key={f.id} aria-labelledby={`projet-${f.id}`}>
              <h3 id={`projet-${f.id}`}>{f.titre}</h3>
              <p>{f.pitch}</p>
              {f.contribuer ? (
                <div>
                  <h4>{t.commentContribuer}</h4>
                  <p>{f.contribuer}</p>
                </div>
              ) : null}
              <ul className="project__links">
                {f.liens.map((l) => (
                  <li key={l.url}>
                    <LienExterne href={l.url}>{l.libelle}</LienExterne>
                  </li>
                ))}
              </ul>
            </article>
          ))}
          <p>
            <Link href={`/${lang}/dev`}>{t.voirDev}</Link>
          </p>
        </div>
      </section>
      <ListeDocuments
        id="feuilles-de-route"
        titre={t.feuillesDeRoute}
        documents={feuillesDeRoute}
        lang={lang}
      />
      <ListeDocuments id="guides" titre={t.guides} documents={guides} lang={lang} />
    </>
  );
}

/** Études de cas du portfolio, pour un client ou un partenaire. */
export function Etudes({ lang, t }: Commun) {
  const { portfolio, ui } = getContent(lang);
  return (
    <section className="section" aria-labelledby="etudes">
      <h2 className="section__label" id="etudes">
        {ui.portfolio.etudes}
      </h2>
      <div className="section__body">
        {portfolio.etudes.map((etude) => (
          <article className="project" key={etude.id} aria-labelledby={`etude-${etude.id}`}>
            <h3 id={`etude-${etude.id}`}>{etude.titre}</h3>
            <p className="project__meta">
              {etude.organisation} · {formatPeriod(etude.debut, etude.fin, lang, ui.cv.enCours)}
            </p>
            <p>{etude.contexte}</p>
            {etude.resultats.length > 0 ? (
              <div>
                <h4>{ui.portfolio.resultats}</h4>
                <ul>
                  {etude.resultats.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}
        <div className="actions">
          <Link className="button button--secondary" href={`/${lang}/portfolio`}>
            {t.voirPortfolio}
          </Link>
        </div>
      </div>
    </section>
  );
}
