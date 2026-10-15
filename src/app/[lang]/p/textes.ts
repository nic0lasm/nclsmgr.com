import type { Locale } from "@/lib/i18n";

export type TextesAcces = {
  metaTitre: string;
  etiquette: string;
  titre: string;
  information: string;
  confidentialite: string;
  bouton: string;
  envoi: string;
  refusAvant: string;
  refusLien: string;
  refusApres: string;
  attente: string;
  erreur: string;
  sansLien: string;
  allerEspace: string;
  noscript: string;
};

export const textes: Record<Locale, TextesAcces> = {
  fr: {
    metaTitre: "Accès à l'espace privé",
    etiquette: "Espace privé",
    titre: "Votre espace privé",
    information:
      "Cet espace a été préparé pour vous. Quand vous y entrez, j'enregistre la date de votre visite, votre pays et le type de navigateur, sans adresse IP, pour savoir que vous l'avez consulté. Ces informations sont effacées après 3 mois. Un cookie technique maintient votre accès ; il n'y a aucun traceur.",
    confidentialite: "Politique de confidentialité",
    bouton: "Accéder à mon espace",
    envoi: "Ouverture de votre espace…",
    refusAvant: "Ce lien n'est pas ou plus valide. Vous pouvez m'écrire depuis la ",
    refusLien: "page Contact",
    refusApres: ".",
    attente: "Trop de tentatives depuis votre connexion. Réessayez dans quelques minutes.",
    erreur: "La connexion a échoué. Vérifiez votre réseau puis réessayez.",
    sansLien:
      "Pour entrer, rouvrez le lien personnel que vous avez reçu. Si vous êtes déjà entré depuis cet appareil, votre espace reste accessible.",
    allerEspace: "Aller à mon espace",
    noscript:
      "Cette page a besoin de JavaScript : votre lien est lu dans le navigateur et n'est envoyé qu'au moment où vous cliquez. Activez JavaScript, puis rouvrez le lien.",
  },
  en: {
    metaTitre: "Private space access",
    etiquette: "Private space",
    titre: "Your private space",
    information:
      "This space was prepared for you. When you enter, I record the date of your visit, your country and your browser type, without your IP address, so that I know you have seen it. This information is deleted after 3 months. A technical cookie keeps you signed in; there are no trackers.",
    confidentialite: "Privacy policy",
    bouton: "Enter my space",
    envoi: "Opening your space…",
    refusAvant: "This link is not valid or no longer valid. You can write to me from the ",
    refusLien: "Contact page",
    refusApres: ".",
    attente: "Too many attempts from your connection. Please try again in a few minutes.",
    erreur: "The connection failed. Check your network and try again.",
    sansLien:
      "To enter, open the personal link you received again. If you have already entered from this device, your space is still available.",
    allerEspace: "Go to my space",
    noscript:
      "This page needs JavaScript: your link is read in your browser and only sent when you click. Turn on JavaScript, then open the link again.",
  },
};
