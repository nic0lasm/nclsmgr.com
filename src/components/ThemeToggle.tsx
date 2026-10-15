"use client";

import { useSyncExternalStore } from "react";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  otherTheme,
  resolveTheme,
  type Theme,
} from "@/lib/theme";

const darkQuery = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(darkQuery);
  media.addEventListener("change", onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

function currentTheme(): Theme {
  return resolveTheme(document.documentElement.dataset.theme, window.matchMedia(darkQuery).matches);
}

type Labels = { toDark: string; toLight: string; generic: string };

export function ThemeToggle({ labels }: { labels: Labels }) {
  // Côté serveur, le thème est inconnu : le libellé reste générique jusqu'à l'hydratation.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);
  const label = theme === null ? labels.generic : theme === "dark" ? labels.toLight : labels.toDark;

  function toggle() {
    const next = otherTheme(currentTheme());
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Stockage bloqué : le choix vaut pour la page en cours seulement.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <button type="button" className="icon-button" aria-label={label} title={label} onClick={toggle}>
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
      </svg>
    </button>
  );
}
