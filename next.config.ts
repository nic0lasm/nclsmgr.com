import type { NextConfig } from "next";
import { reglesEnTetesEspace } from "./src/lib/espace/en-tetes";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Les pages et articles Markdown sont lus à la requête : on les embarque dans le serveur autonome.
  outputFileTracingIncludes: {
    "/[lang]/**": ["./src/content/*/pages/*.md", "./src/content/*/articles/*.md"],
  },
  experimental: {
    // Seule action serveur : le formulaire de contact, dont le message fait 4 000 caractères au plus.
    serverActions: { bodySizeLimit: "64kb" },
  },
  // Non-indexation et absence de cache sur l'espace privé (à doubler par Caddy : voir en-tetes.ts).
  async headers() {
    return reglesEnTetesEspace();
  },
};

export default nextConfig;
