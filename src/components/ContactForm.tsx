"use client";

import { useActionState } from "react";
import { envoyerMessage } from "@/app/[lang]/contact/actions";
import { etatInitial } from "@/app/[lang]/contact/etat";
import { CHAMP_PIEGE, LIMITES, type Champ } from "@/lib/contact/formulaire";
import type { Locale } from "@/lib/i18n";
import type { Interface } from "@/content/types";

type Textes = Interface["contact"]["formulaire"];

// Fonctionne sans JavaScript : sans script, le formulaire est envoyé normalement et la page
// revient avec le résultat.
export function ContactForm({ lang, textes }: { lang: Locale; textes: Textes }) {
  const [etat, action, enCours] = useActionState(envoyerMessage, etatInitial);

  if (etat.statut === "envoye") {
    return (
      <p className="lead" role="status">
        {textes.succes}
      </p>
    );
  }

  const valeurs = etat.statut === "erreur" ? etat.valeurs : undefined;
  const erreurs = etat.statut === "erreur" ? etat.erreurs : {};
  const global = etat.statut === "erreur" ? etat.global : undefined;

  function erreur(champ: Champ) {
    const code = erreurs[champ];
    if (!code) return null;
    const texte =
      code === "manquant"
        ? textes.champManquant
        : champ === "courriel"
          ? textes.emailInvalide
          : textes.trop;
    return (
      <p className="field__error" id={`${champ}-erreur`}>
        {texte}
      </p>
    );
  }

  function decrit(champ: Champ, aide?: string) {
    const ids = [aide, erreurs[champ] ? `${champ}-erreur` : undefined].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  }

  return (
    // section__body empile les champs avec l'espacement de la charte.
    <form className="section__body" action={action} noValidate>
      <input type="hidden" name="langue" value={lang} />
      {global ? (
        <p className="field__error" role="alert">
          {textes[global]}
        </p>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="nom">
          {textes.nom}
        </label>
        <input
          className="field__input"
          id="nom"
          name="nom"
          type="text"
          autoComplete="name"
          required
          maxLength={LIMITES.nom}
          defaultValue={valeurs?.nom}
          aria-invalid={erreurs.nom ? true : undefined}
          aria-describedby={decrit("nom")}
        />
        {erreur("nom")}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="courriel">
          {textes.email}
        </label>
        <p className="field__hint" id="courriel-aide">
          {textes.emailAide}
        </p>
        <input
          className="field__input"
          id="courriel"
          name="courriel"
          type="email"
          autoComplete="email"
          required
          maxLength={LIMITES.courriel}
          defaultValue={valeurs?.courriel}
          aria-invalid={erreurs.courriel ? true : undefined}
          aria-describedby={decrit("courriel", "courriel-aide")}
        />
        {erreur("courriel")}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="objet">
          {textes.objet}
        </label>
        <select className="field__input" id="objet" name="objet" defaultValue={valeurs?.objet}>
          {textes.objets.map((objet) => (
            <option key={objet} value={objet}>
              {objet}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="message">
          {textes.message}
        </label>
        <textarea
          className="field__input"
          id="message"
          name="message"
          rows={8}
          required
          maxLength={LIMITES.message}
          defaultValue={valeurs?.message}
          aria-invalid={erreurs.message ? true : undefined}
          aria-describedby={decrit("message")}
        />
        {erreur("message")}
      </div>

      {/* Champ piège : hors de la vue et du clavier, il reste vide pour un visiteur. */}
      <div className="visually-hidden" aria-hidden="true">
        <label htmlFor={CHAMP_PIEGE}>{textes.piege}</label>
        <input id={CHAMP_PIEGE} name={CHAMP_PIEGE} type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="field__hint">{textes.mention}</p>
      <div className="actions">
        <button className="button button--primary" type="submit" disabled={enCours}>
          {textes.envoyer}
        </button>
      </div>
    </form>
  );
}
