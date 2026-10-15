"use client";

import { useEffect } from "react";

/**
 * Une page privée restaurée depuis le cache du navigateur (bouton Retour) n'a pas été
 * redemandée au serveur : on la recharge pour revérifier la session.
 */
export function Rechargement() {
  useEffect(() => {
    function surAffichage(evenement: PageTransitionEvent) {
      if (evenement.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", surAffichage);
    return () => window.removeEventListener("pageshow", surAffichage);
  }, []);
  return null;
}
