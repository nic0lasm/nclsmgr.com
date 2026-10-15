import path from "node:path";

// Base de l'espace privé du serveur de test : `next build` vide .next, elle repart donc vide.
export const BASE_E2E = path.resolve(".next", "e2e-espace.db");
