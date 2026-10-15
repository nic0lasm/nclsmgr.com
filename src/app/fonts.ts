import localFont from "next/font/local";

// Polices servies par le site (sous-ensemble latin, licence SIL OFL 1.1 dans ./fonts).
export const serif = localFont({
  src: "./fonts/source-serif-4-latin-600.woff2",
  weight: "600",
  style: "normal",
  display: "swap",
  variable: "--font-serif",
  adjustFontFallback: "Times New Roman",
});

export const sans = localFont({
  src: "./fonts/public-sans-latin-wght.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  variable: "--font-sans",
});

export const mono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
});

export const fontVariables = [serif.variable, sans.variable, mono.variable].join(" ");
