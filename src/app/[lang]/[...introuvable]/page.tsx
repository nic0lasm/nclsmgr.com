import { notFound } from "next/navigation";

// Toute adresse inconnue sous /fr ou /en affiche la page introuvable de sa langue.
export default function Introuvable() {
  notFound();
}
