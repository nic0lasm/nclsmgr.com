import { FILTRE_MESURE, filtreMesureScript, identifiantMesure } from "@/lib/mesure";

/** Script Umami servi par Caddy sous /stats ; rien n'est rendu tant que la mesure n'est pas activée. */
export function MesureAudience({ nonce }: { nonce?: string }) {
  const site = identifiantMesure();
  if (!site) return null;
  return (
    <>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: filtreMesureScript }} />
      <script
        nonce={nonce}
        defer
        src="/stats/script.js"
        data-website-id={site}
        data-before-send={FILTRE_MESURE}
        data-exclude-search="true"
        data-exclude-hash="true"
        data-do-not-track="true"
      />
    </>
  );
}
