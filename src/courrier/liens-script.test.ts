import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Le script du Mac est testé avec un faux ssh qui renvoie ce qu'il reçoit.
const script = join(process.cwd(), "scripts/liens.sh");
const FAUX_SSH = '#!/bin/sh\nprintf "%s\\n" "$*" >&2\ncat\n';
let dossier: string;
let fauxSsh: string;

function liens(...args: string[]) {
  return execFileSync("sh", [script, ...args], {
    // Lancé depuis un dossier qui contient des fichiers, pour vérifier qu'aucun joker n'est développé.
    cwd: dossier,
    env: { ...process.env, LIENS_SSH: fauxSsh },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "liens-"));
  fauxSsh = join(dossier, "ssh");
  writeFileSync(fauxSsh, FAUX_SSH);
  chmodSync(fauxSsh, 0o755);
  writeFileSync(join(dossier, "cv-complet"), "");
});

afterAll(() => rmSync(dossier, { recursive: true, force: true }));

describe("scripts/liens.sh", () => {
  it("produit un JSON valide quels que soient les caractères saisis", () => {
    const sortie = liens(
      "creer",
      "--profil",
      "recruteur",
      "--destinataire",
      'Camille "C" \\ Élodie',
      "--message",
      "Bonjour,\nà bientôt\t!",
      "--documents",
      "cv-complet,references",
      "--duree",
      "45",
    );
    expect(JSON.parse(sortie)).toEqual({
      action: "creer",
      profil: "recruteur",
      destinataire: 'Camille "C" \\ Élodie',
      message: "Bonjour,\nà bientôt\t!",
      documents: ["cv-complet", "references"],
      dureeJours: 45,
    });
  });

  it("n'interprète pas les jokers et sépare l'hôte des options de ssh", () => {
    const argsSsh = join(dossier, "args");
    writeFileSync(fauxSsh, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsSsh}'\ncat\n`);
    try {
      expect(JSON.parse(liens("creer", "--documents", "*", "--destinataire", "cv*"))).toEqual({
        action: "creer",
        documents: ["*"],
        destinataire: "cv*",
      });
      expect(readFileSync(argsSsh, "utf8")).toBe("-T\n--\nnclsmgr-liens\n");
    } finally {
      writeFileSync(fauxSsh, FAUX_SSH);
    }
  });

  it("construit les autres actions", () => {
    expect(JSON.parse(liens("lister"))).toEqual({ action: "lister" });
    expect(JSON.parse(liens("lister", "--tous"))).toEqual({ action: "lister", tous: true });
    expect(JSON.parse(liens("prolonger", "l-7kq2mz", "30"))).toEqual({
      action: "prolonger",
      id: "l-7kq2mz",
      jours: 30,
    });
    expect(JSON.parse(liens("revoquer", "l-7kq2mz"))).toEqual({
      action: "revoquer",
      id: "l-7kq2mz",
    });
  });

  it.each([
    [["inconnue"]],
    [["creer", "--profil"]],
    [["creer", "--jeton", "x"]],
    [["prolonger", "l-7kq2mz", "030"]],
    [["prolonger", "l-7kq2mz", "-1"]],
    [["journal"]],
  ])("refuse %j sans rien envoyer", (args) => {
    expect(() => liens(...args)).toThrow();
  });
});
