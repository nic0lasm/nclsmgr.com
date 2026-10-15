import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { Block, Inline } from "@/lib/markdown";

function Inlines({ content, locale }: { content: Inline[]; locale: Locale }) {
  return content.map((part, i) => {
    switch (part.type) {
      case "strong":
        return <strong key={i}>{part.value}</strong>;
      case "code":
        return <code key={i}>{part.value}</code>;
      case "link":
        // Les liens internes reçoivent le préfixe de langue ; les autres ouvrent le site cible.
        return part.href.startsWith("/") ? (
          <Link key={i} href={`/${locale}${part.href}`}>
            {part.value}
          </Link>
        ) : (
          <a key={i} href={part.href} rel="noopener noreferrer">
            {part.value}
          </a>
        );
      default:
        return part.value;
    }
  });
}

export function MarkdownView({ blocks, locale }: { blocks: Block[]; locale: Locale }) {
  return blocks.map((block, i) => {
    switch (block.type) {
      case "heading": {
        const Tag = block.level === 2 ? "h2" : "h3";
        return (
          <Tag key={i}>
            <Inlines content={block.content} locale={locale} />
          </Tag>
        );
      }
      case "list":
        return (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines content={item} locale={locale} />
              </li>
            ))}
          </ul>
        );
      case "table":
        return (
          <div key={i} className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {block.header.map((cell, j) => (
                    <th key={j} scope="col">
                      <Inlines content={cell} locale={locale} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, j) => (
                  <tr key={j}>
                    {row.map((cell, k) => (
                      <td key={k}>
                        <Inlines content={cell} locale={locale} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return (
          <p key={i}>
            <Inlines content={block.content} locale={locale} />
          </p>
        );
    }
  });
}
