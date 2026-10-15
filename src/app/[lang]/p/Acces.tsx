"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n";
import { textes } from "./textes";

const FORMAT_JETON = /^[A-Za-z0-9_-]{43}$/;

// Le fragment est lu une seule fois puis effacé de la barre d'adresse et de l'historique :
// il ne survit ni à un rechargement, ni à un partage de l'adresse affichée.
let fragmentLu: string | null = null;

function lireFragment(): string {
  if (fragmentLu === null) {
    fragmentLu = window.location.hash.slice(1);
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }
  return fragmentLu;
}

// Un nouveau lien collé dans la même page ne change que le fragment : il est relu.
function abonner(prevenir: () => void) {
  const relire = () => {
    if (!window.location.hash) return;
    fragmentLu = null;
    prevenir();
  };
  window.addEventListener("hashchange", relire);
  return () => window.removeEventListener("hashchange", relire);
}

type Etat = "pret" | "envoi" | "refuse" | "attente" | "erreur";

export function Acces({ lang }: { lang: Locale }) {
  const t = textes[lang];
  const router = useRouter();
  // Côté serveur, aucun fragment : la page rendue est la même pour tous.
  const fragment = useSyncExternalStore(abonner, lireFragment, () => null);
  const [etat, setEtat] = useState<Etat>("pret");
  const [fragmentAffiche, setFragmentAffiche] = useState(fragment);
  if (fragmentAffiche !== fragment) {
    // Nouveau lien : l'état du précédent ne s'applique plus.
    setFragmentAffiche(fragment);
    setEtat("pret");
  }

  if (fragment === null) return null;

  if (fragment === "") {
    return (
      <>
        <p>{t.sansLien}</p>
        <div className="actions">
          <a className="button button--secondary" href={`/${lang}/espace`}>
            {t.allerEspace}
          </a>
        </div>
      </>
    );
  }

  async function entrer() {
    setEtat("envoi");
    try {
      const reponse = await fetch(`/${lang}/p/acces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton: fragment }),
        cache: "no-store",
        credentials: "same-origin",
      });
      if (reponse.status === 204) {
        // L'espace remplace cette page dans l'historique : revenir en arrière ne la rouvre pas.
        router.replace(`/${lang}/espace`);
        return;
      }
      setEtat(reponse.status === 429 ? "attente" : reponse.status === 403 ? "refuse" : "erreur");
    } catch {
      setEtat("erreur");
    }
  }

  // Un fragment qui ne peut pas être un jeton reçoit le même message qu'un lien refusé.
  const refuse = etat === "refuse" || !FORMAT_JETON.test(fragment);

  return (
    <>
      {!refuse && (
        <>
          <p>{t.information}</p>
          <p className="muted">
            <a href={`/${lang}/confidentialite`}>{t.confidentialite}</a>
          </p>
          <div className="actions">
            <button
              type="button"
              className="button button--primary"
              onClick={entrer}
              disabled={etat === "envoi"}
            >
              {t.bouton}
            </button>
          </div>
        </>
      )}
      <p role="status">
        {refuse ? (
          <>
            {t.refusAvant}
            <a href={`/${lang}/contact`}>{t.refusLien}</a>
            {t.refusApres}
          </>
        ) : etat === "envoi" ? (
          t.envoi
        ) : etat === "attente" ? (
          t.attente
        ) : etat === "erreur" ? (
          t.erreur
        ) : null}
      </p>
    </>
  );
}
