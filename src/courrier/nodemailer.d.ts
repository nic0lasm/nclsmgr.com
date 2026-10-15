// Nodemailer ne publie pas ses types : seule la partie utilisée par le service courrier est décrite.
declare module "nodemailer" {
  export type OptionsTransport = {
    host: string;
    port: number;
    secure: boolean;
    requireTLS?: boolean;
    auth: { user: string; pass: string };
    tls?: { minVersion?: "TLSv1.2" | "TLSv1.3"; servername?: string };
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
    disableFileAccess?: boolean;
    disableUrlAccess?: boolean;
  };

  export type Envoi = {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    text: string;
  };

  export type Transport = {
    sendMail(envoi: Envoi): Promise<{ messageId: string }>;
    verify(): Promise<true>;
    close(): void;
  };

  export function createTransport(options: OptionsTransport): Transport;
}
