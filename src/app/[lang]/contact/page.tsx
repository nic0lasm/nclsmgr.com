import { ContactForm } from "@/components/ContactForm";
import { getContent } from "@/lib/content";
import { textPage } from "@/lib/text-page";

const { generateMetadata, Page } = textPage("contact", "contact", (lang) => (
  <ContactForm lang={lang} textes={getContent(lang).ui.contact.formulaire} />
));

export { generateMetadata };
export default Page;
