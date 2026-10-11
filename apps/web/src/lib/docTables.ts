/**
 * Tablas dentro de un documento de Word: se sacan del HTML que arma mammoth y se protegen con los
 * mismos seudónimos que el texto del documento (para los gráficos "con seudónimos").
 */
import {
  analyzeDocument,
  cellToString,
  documentActionFor,
  transformDocument,
  type CellValue,
  type CustomTerm,
  type PseudonymRegistry,
  type Segment,
  type Table,
  type TypeDecision,
} from '@securedata/detector';
import { PSEUDONYM_PREFIXES, type Action, type DetectionType } from '@securedata/shared';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Texto de una celda: párrafos y saltos de línea como espacios, sin etiquetas. */
const cellText = (html: string) =>
  decodeEntities(
    html
      .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();

/** Filas y celdas de cada tabla del HTML (sin tablas anidadas: en documentos de oficina casi no hay). */
export function tablesFromHtml(html: string): string[][][] {
  const tables: string[][][] = [];
  for (const t of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows: string[][] = [];
    for (const tr of t[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => cellText(m[1]!));
      if (cells.some((c) => c !== '')) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

/**
 * Versión protegida de una tabla: cada celda se analiza con el encabezado de su columna como pista
 * ("Vendedor: Juan Pérez" es una persona) y se reemplaza con el registro del documento, así
 * "Persona_01" es la misma en el texto y en la tabla. Lo que no cambia conserva su valor (los números
 * siguen siendo números para los gráficos).
 */
export function protectTable(
  table: Table,
  decisions: Partial<Record<DetectionType, TypeDecision>>,
  policy: Partial<Record<DetectionType, Action>>,
  registry: PseudonymRegistry,
  customTerms: CustomTerm[] = [],
  ignoredValues: string[] = [],
): Table {
  const width = table.headers.length;
  const segments: Segment[] = table.rows.flatMap((row) => row.map((cell, c) => ({ text: cellToString(cell), hint: table.headers[c] })));
  const analysis = analyzeDocument(segments, customTerms, ignoredValues);
  // Tipos que aparecen solo en la tabla: la política de la empresa o la acción sugerida.
  const all = { ...decisions };
  for (const { type } of analysis.summary) all[type] ??= { action: documentActionFor(type, policy), prefix: PSEUDONYM_PREFIXES[type] };
  const texts = transformDocument(segments, analysis.spans, all, registry).texts;
  return {
    headers: table.headers,
    rows: table.rows.map((row, r) =>
      row.map((cell, c): CellValue => {
        const out = texts[r * width + c]!;
        return out === segments[r * width + c]!.text ? cell : out;
      }),
    ),
  };
}
