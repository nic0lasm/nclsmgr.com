"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

const abonner = () => () => {};

/**
 * Revérifie la session quand une page privée s'affiche sans avoir été redemandée au serveur :
 * - restaurée depuis le cache du navigateur (bouton Retour après une navigation complète) :
 *   la page est rechargée ;
 * - montée par une navigation côté client (Retour après un lien interne) : le cache du routeur
 *   peut la resservir telle quelle, on la redemande au serveur avec router.refresh().
 * Au premier affichage d'un chargement complet, la page vient d'être vérifiée : rien à faire.
 */
export function Rechargement() {
  const router = useRouter();
  // Vrai pendant l'hydratation d'un chargement complet, faux lors d'un montage côté client.
  const hydratation = useSyncExternalStore(
    abonner,
    () => false,
    () => true,
  );
  const montageClient = useRef(!hydratation);

  useEffect(() => {
    if (montageClient.current) router.refresh();
  }, [router]);

  useEffect(() => {
    function surAffichage(evenement: PageTransitionEvent) {
      if (evenement.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", surAffichage);
    return () => window.removeEventListener("pageshow", surAffichage);
  }, []);
  return null;
}
