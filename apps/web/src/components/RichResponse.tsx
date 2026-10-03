import type { RestoredPart } from '@securedata/detector';
import type { ReactNode } from 'react';

/**
 * Muestra la respuesta traducida de la IA con su formato markdown (títulos, listas, negritas,
 * código, tablas) y los datos reales resaltados. Arma elementos de React, nunca HTML: una
 * respuesta no puede inyectar código en la página.
 */

// Los datos reales se marcan con caracteres de uso privado: <índice><texto>.
const OPEN = '';
const SEP = '';
const CLOSE = '';

function encode(parts: RestoredPart[]): { text: string; pseudonyms: string[] } {
  const pseudonyms: string[] = [];
  const text = parts
    .map((p) => {
      if (!p.seudonimo) return p.text;
      pseudonyms.push(p.seudonimo);
      return `${OPEN}${pseudonyms.length - 1}${SEP}${p.text}${CLOSE}`;
    })
    .join('');
  return { text, pseudonyms };
}

const strip = (s: string) => s.replace(new RegExp(`${OPEN}\\d+${SEP}|${CLOSE}`, 'g'), '');

/** Negritas, cursivas, código y datos reales dentro de una línea. */
function inline(text: string, pseudonyms: string[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const token = new RegExp(`(\`[^\`]+\`)|\\*\\*(.+?)\\*\\*|__(.+?)__|(?<![*\\w])\\*(?!\\s)(.+?)\\*(?!\\*)|${OPEN}(\\d+)${SEP}(.*?)${CLOSE}`, 'gs');
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(token)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const id = `${key}-${k++}`;
    if (m[1]) out.push(<code key={id} className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[0.85em]">{strip(m[1].slice(1, -1))}</code>);
    else if (m[2] !== undefined || m[3] !== undefined) out.push(<strong key={id} className="font-semibold">{inline(m[2] ?? m[3]!, pseudonyms, id)}</strong>);
    else if (m[4] !== undefined) out.push(<em key={id}>{inline(m[4], pseudonyms, id)}</em>);
    else
      out.push(
        <mark key={id} title={`En la respuesta decía ${pseudonyms[Number(m[5])]}`} className="rounded bg-emerald-50 px-0.5 font-medium text-emerald-900 ring-1 ring-inset ring-emerald-200">
          {m[6]}
        </mark>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export function RichResponse({ parts }: { parts: RestoredPart[] }) {
  const { text, pseudonyms } = encode(parts);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key}>
        {paragraph.map((l, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {inline(l, pseudonyms, `${key}-${j}`)}
          </span>
        ))}
      </p>,
    );
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i]!;
    const key = `b${blocks.length}`;

    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i++]!);
      i++;
      blocks.push(
        <pre key={key} className="overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs leading-relaxed text-slate-100">
          {strip(code.join('\n'))}
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1]!.length;
      const cls = level <= 2 ? 'text-base font-bold text-slate-900' : 'font-semibold text-slate-900';
      blocks.push(
        <p key={key} className={cls} role="heading" aria-level={Math.min(level + 2, 6)}>
          {inline(heading[2]!, pseudonyms, key)}
        </p>,
      );
      i++;
      continue;
    }

    // Tabla: | a | b | seguida de |---|---|.
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      flush();
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {head.map((h, j) => (
                  <th key={j} className="border-b border-slate-300 px-2 py-1 font-semibold text-slate-900">
                    {inline(h, pseudonyms, `${key}-h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-slate-200">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-1 align-top">
                      {inline(c, pseudonyms, `${key}-${ri}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Listas con viñetas o numeradas (líneas seguidas).
    const bullet = /^\s*[-*+•]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      flush();
      const ordered = numbered.test(line);
      const re = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i]!)) items.push(lines[i++]!.match(re)![1]!);
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag key={key} className={`space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, pseudonyms, `${key}-${j}`)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flush();
      blocks.push(
        <blockquote key={key} className="border-l-2 border-slate-300 pl-3 text-slate-600">
          {inline(quote[1]!, pseudonyms, key)}
        </blockquote>,
      );
      i++;
      continue;
    }

    if (!line.trim()) flush();
    else paragraph.push(line);
    i++;
  }
  flush();

  return <div className="space-y-3 break-words text-sm leading-relaxed text-slate-800">{blocks}</div>;
}
