// Analyseur Markdown volontairement restreint pour les pages de texte du site :
// titres, paragraphes, listes à puces, tableaux, gras, code et liens.
// Aucun HTML brut n'est interprété : le rendu passe par des éléments React.

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; href: string; value: string };

export type Block =
  | { type: "heading"; level: 2 | 3; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

export interface Document {
  frontmatter: Record<string, string>;
  blocks: Block[];
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of source.matchAll(INLINE)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ type: "text", value: source.slice(last, index) });
    if (m[1] !== undefined) out.push({ type: "strong", value: m[1] });
    else if (m[2] !== undefined) out.push({ type: "code", value: m[2] });
    else out.push({ type: "link", value: m[3], href: m[4] });
    last = index + m[0].length;
  }
  if (last < source.length) out.push({ type: "text", value: source.slice(last) });
  return out;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseFrontmatter(source: string): { data: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const sep = line.indexOf(":");
    if (sep > 0) data[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return { data, body: source.slice(match[0].length) };
}

export function parseMarkdown(source: string): Document {
  const { data, body } = parseFrontmatter(source.replace(/\r\n/g, "\n"));
  const lines = body.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 2 | 3,
        content: parseInline(heading[2]),
      });
      i++;
    } else if (/^[-*]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^[-*]\s+/, "")));
        i++;
      }
      blocks.push({ type: "list", items });
    } else if (line.trim().startsWith("|") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "")) {
      const header = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ type: "table", header, rows });
    } else {
      const parts: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{2,3}\s|[-*]\s)/.test(lines[i]) &&
        !lines[i].trim().startsWith("|")
      ) {
        parts.push(lines[i].trim());
        i++;
      }
      blocks.push({ type: "paragraph", content: parseInline(parts.join(" ")) });
    }
  }
  return { frontmatter: data, blocks };
}
