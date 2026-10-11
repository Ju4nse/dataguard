/**
 * Archivos que se adjuntan en el chat de una IA: se leen, se analizan y se arma la versión protegida,
 * todo en la computadora. Los formatos de texto (CSV, TXT, Markdown, JSON) se leen acá mismo; Excel,
 * Word y PDF los lee el documento oculto de la extensión (ver offscreen/files.ts), para no cargar esas
 * librerías en cada página del chat.
 */
import Papa from 'papaparse';
import { analyzeTable, applyDecisions, type CellValue, type ColumnDecision, type PseudonymRegistry, type Span, type Table } from '@securedata/detector';
import { PSEUDONYM_PREFIXES, type DetectionType } from '@securedata/shared';
import type { Detection } from './messages';
import { analyzePrompt, protectPrompt, type Policy, type PromptAnalysis } from './protect';

/** Se leen en la página. */
export const TEXT_EXTENSIONS = ['.csv', '.tsv', '.txt', '.md', '.json'];
/** Los lee el documento oculto de la extensión. */
export const BINARY_EXTENSIONS = ['.xlsx', '.xls', '.ods', '.docx', '.pdf'];
/** Más grande que esto no se revisa (leerlo y analizarlo trabaría la página). */
export const MAX_FILE_MB = 15;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/** Lo que DataGuard sabe revisar. El resto (imágenes, audio, zip…) pasa sin cambios. */
export function isReviewable(file: File): boolean {
  const ext = extensionOf(file.name);
  return TEXT_EXTENSIONS.includes(ext) || BINARY_EXTENSIONS.includes(ext);
}

export interface Sheet extends Table {
  name: string;
}

export type ParsedFile =
  | { kind: 'tabla'; format: 'csv' | 'xlsx'; delimiter: string; sheets: Sheet[] }
  | { kind: 'documento'; format: 'txt' | 'md' | 'json' | 'docx' | 'pdf'; text: string };

/** Los CSV/TXT exportados en Windows en Argentina suelen venir en Windows-1252, no en UTF-8. */
export function decode(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Primera fila con algo = encabezados; filas vacías afuera; todas del mismo ancho. */
export function toSheet(name: string, matrix: CellValue[][]): Sheet {
  const nonEmpty = matrix.filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
  const [head = [], ...rest] = nonEmpty;
  const width = Math.max(head.length, ...rest.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => {
    const h = head[i];
    return h === null || h === undefined || String(h).trim() === '' ? `Columna ${i + 1}` : String(h).trim();
  });
  return { name, headers, rows: rest.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null)) };
}

/** Formatos de texto, en la página. */
export function parseTextFile(name: string, bytes: ArrayBuffer | Uint8Array): ParsedFile {
  const ext = extensionOf(name);
  const text = decode(bytes);
  if (ext === '.csv' || ext === '.tsv') {
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
    return { kind: 'tabla', format: 'csv', delimiter: parsed.meta.delimiter, sheets: [toSheet('CSV', parsed.data)] };
  }
  // JSON como texto: se reemplaza adentro de los valores sin tocar la estructura (los seudónimos no llevan comillas).
  return { kind: 'documento', format: ext === '.md' ? 'md' : ext === '.json' ? 'json' : 'txt', text };
}

export interface TypeCount {
  type: DetectionType;
  count: number;
}

export interface FileReview {
  name: string;
  parsed: ParsedFile;
  summary: TypeCount[];
  /** La política de la empresa exige proteger alguno de estos tipos. */
  enforced: boolean;
  /** Documentos: el análisis del texto (mismo que un prompt). */
  document?: PromptAnalysis;
  /** Planillas: qué hacer con cada columna, por hoja. */
  columns?: Record<number, ColumnDecision>[];
}

/** Acción por columna: la política de la empresa manda sobre la sugerida (igual que la app web). */
function columnDecisions(sheet: Sheet, policy: Policy): { decisions: Record<number, ColumnDecision>; counts: Map<DetectionType, number> } {
  const decisions: Record<number, ColumnDecision> = {};
  const counts = new Map<DetectionType, number>();
  const add = (t: DetectionType, n: number) => n > 0 && counts.set(t, (counts.get(t) ?? 0) + n);
  for (const f of analyzeTable(sheet)) {
    if (f.kind === 'columna' && f.type) {
      const action = policy[f.type] ?? f.suggestedAction;
      if (action === 'mantener') continue;
      decisions[f.index] = { action, type: f.type, kind: 'columna', prefix: PSEUDONYM_PREFIXES[f.type] };
      add(f.type, f.detectionCount);
    } else if (f.kind === 'texto') {
      // Texto libre ("Observaciones"): puede mezclar tipos, así que no siempre tiene uno solo.
      const found = (Object.entries(f.textCounts) as [DetectionType, number][]).filter(([t]) => policy[t] !== 'mantener');
      if (found.length === 0) continue;
      decisions[f.index] = { action: f.suggestedAction, type: f.type, kind: 'texto', prefix: f.type ? PSEUDONYM_PREFIXES[f.type] : undefined };
      for (const [t, n] of found) add(t, n);
    }
  }
  return { decisions, counts };
}

/**
 * Analiza un archivo ya leído. Devuelve null si no hay nada que proteger. No asigna seudónimos.
 * @param modelSpans lo que encontró la IA local en el texto de un documento (si está activa).
 */
export function reviewFile(name: string, parsed: ParsedFile, policy: Policy, registry: PseudonymRegistry, modelSpans: Span[] = []): FileReview | null {
  if (parsed.kind === 'documento') {
    const document = analyzePrompt(parsed.text, policy, registry, modelSpans);
    if (!document) return null;
    return { name, parsed, summary: document.summary.map((s) => ({ type: s.type, count: s.count })), enforced: document.enforced, document };
  }
  const total = new Map<DetectionType, number>();
  const columns = parsed.sheets.map((sheet) => {
    const { decisions, counts } = columnDecisions(sheet, policy);
    for (const [t, n] of counts) total.set(t, (total.get(t) ?? 0) + n);
    return decisions;
  });
  if (total.size === 0) return null;
  const summary = [...total].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  return { name, parsed, summary, enforced: summary.some((s) => policy[s.type] !== undefined), columns };
}

/** Versión protegida, lista para escribir: texto (CSV, TXT…) u hojas para armar el Excel. */
export type ProtectedContent = { name: string; type: string; text: string } | { name: string; type: 'xlsx'; sheets: Sheet[] };

const baseName = (name: string) => name.replace(/\.[^.]+$/, '');

function csvCell(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v);
}

/**
 * Arma la versión protegida con los seudónimos de la pestaña. Word y PDF se suben como texto (.txt):
 * no se puede reescribir el archivo original sin perder el formato.
 */
export function protectFile(review: FileReview, registry: PseudonymRegistry): ProtectedContent {
  const { parsed } = review;
  const base = baseName(review.name);
  if (parsed.kind === 'documento') {
    const text = protectPrompt(review.document!, registry);
    if (parsed.format === 'json') return { name: review.name, type: 'application/json', text };
    if (parsed.format === 'md') return { name: review.name, type: 'text/markdown', text };
    return { name: parsed.format === 'txt' ? review.name : `${base}.txt`, type: 'text/plain', text };
  }
  const sheets = parsed.sheets.map((sheet, i) => ({ name: sheet.name, ...applyDecisions(sheet, review.columns![i]!, undefined, registry).table }));
  if (parsed.format === 'xlsx') return { name: `${base}.xlsx`, type: 'xlsx', sheets };
  const [sheet] = sheets;
  // BOM al principio para que Excel abra bien las tildes.
  const text =
    String.fromCharCode(0xfeff) + Papa.unparse({ fields: sheet!.headers, data: sheet!.rows.map((r) => r.map(csvCell)) }, { delimiter: parsed.delimiter });
  return { name: review.name, type: 'text/csv', text };
}

/** Metadatos para el panel (tipos y cantidades, nunca el contenido). */
export function fileDetections(review: FileReview, uploadedProtected: boolean): Detection[] {
  const action = (t: DetectionType) => {
    if (!uploadedProtected) return 'mantener' as const;
    if (review.document) return review.document.decisions[t]!.action;
    const d = review.columns?.flatMap((c) => Object.values(c)).find((c) => c.type === t);
    return d?.action ?? 'seudonimizar';
  };
  return review.summary.map((s) => ({ tipo: s.type, accion: action(s.type), cantidad: s.count }));
}

/** Base64 para mandar bytes entre partes de la extensión (los mensajes de Chrome solo llevan JSON). */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Pedidos del script de contenido al service worker (que los pasa al documento oculto). */
export type FileRequest = { tipo: 'archivo-leer'; nombre: string; datos: string } | { tipo: 'archivo-excel'; hojas: Sheet[] };
/** Del service worker al documento oculto. */
export type OffscreenFileRequest = { destino: 'archivo'; tipo: 'leer'; nombre: string; datos: string } | { destino: 'archivo'; tipo: 'excel'; hojas: Sheet[] };
export type FileReadResponse = { ok: true; archivo: ParsedFile } | { ok: false; error: string };
export type FileExcelResponse = { ok: true; datos: string } | { ok: false; error: string };
