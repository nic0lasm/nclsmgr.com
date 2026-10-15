import { createTransport } from "nodemailer";
import type { MessageCourriel } from "@/lib/espace/courriels";
import type { ConfigurationSmtp } from "./configuration";

export type Expediteur = {
  envoyer: (message: MessageCourriel) => Promise<void>;
  fermer: () => void;
};

/** Connexion SMTP chiffrée et certificat vérifié ; les courriels ne partent que vers Nico. */
export function creerExpediteur(config: ConfigurationSmtp): Expediteur {
  const transport = createTransport({
    host: config.hote,
    port: config.port,
    secure: config.port === 465,
    requireTLS: true,
    auth: { user: config.utilisateur, pass: config.motDePasse },
    tls: { minVersion: "TLSv1.2", servername: config.hote },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    envoyer: async (message) => {
      await transport.sendMail({
        from: config.expediteur,
        to: config.destinataire,
        replyTo: message.repondreA,
        subject: message.sujet,
        text: message.texte,
      });
    },
    fermer: () => transport.close(),
  };
}
