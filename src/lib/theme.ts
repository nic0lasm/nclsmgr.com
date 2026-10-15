export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];

export const THEME_STORAGE_KEY = "theme";
export const THEME_CHANGE_EVENT = "nclsmgr:theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (themes as readonly string[]).includes(value);
}

// Thème affiché : le choix enregistré s'il existe, sinon celui du système.
export function resolveTheme(stored: string | null | undefined, prefersDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersDark ? "dark" : "light";
}

export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

// Exécuté dans <head> avant l'affichage, autorisé par le nonce CSP : applique le choix
// enregistré sans flash. Sans choix, aucun attribut n'est posé et le CSS suit le système.
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
