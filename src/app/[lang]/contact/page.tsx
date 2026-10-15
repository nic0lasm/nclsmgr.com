import { ContactForm } from "@/components/ContactForm";
import { getContent } from "@/lib/content";
import { textPage } from "@/lib/text-page";

const { generateMetadata, Page } = textPage("contact", "contact", (lang) => {
  const { ui, profil } = getContent(lang);
  const linkedin = profil.liens.find((l) => l.type === "linkedin");
  return (
    <>
      <ContactForm lang={lang} textes={ui.contact.formulaire} />
      {linkedin ? (
        <div className="actions">
          <a className="button button--secondary" href={linkedin.url} rel="noopener noreferrer">
            {ui.contact.linkedin}
          </a>
        </div>
      ) : null}
    </>
  );
});

export { generateMetadata };
export default Page;
