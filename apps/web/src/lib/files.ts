import Papa from 'papaparse';
import { tableToJson, type CellValue, type EquivalenceRow, type Table } from '@securedata/detector';

export interface ParsedSheet extends Table {
  name: string;
}

/** Formato de origen; define en qué formato se descarga el resultado. */
export type FileFormat = 'csv' | 'xlsx' | 'json' | 'pdf' | 'docx' | 'txt' | 'md';

export interface ParseRequest {
  file: File;
}

export type ParseOk =
  | { ok: true; kind: 'tabla'; format: 'csv' | 'xlsx' | 'json'; delimiter: string; sheets: ParsedSheet[] }
  | { ok: true; kind: 'documento'; format: 'docx' | 'txt' | 'md' | 'pdf'; text: string }
  | { ok: true; kind: 'json'; root: unknown };

export type ParseResponse = ParseOk | { ok: false; error: string };

export const TABLE_EXTENSIONS = ['.csv', '.tsv', '.xlsx', '.xls', '.ods'];
export const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.json'];
export const ACCEPTED_EXTENSIONS = [...TABLE_EXTENSIONS, ...DOCUMENT_EXTENSIONS];
export const MAX_SIZE_MB = 50;

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

/** Extrae el texto de un PDF con pdf.js (corre en el navegador; se carga solo si hace falta). */
async function parsePdf(file: File): Promise<ParseOk> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join(''));
  }
  await task.destroy();
  const text = pages.join('\n\n').trim();
  if (text.length < 20) {
    throw new Error('Este PDF no tiene texto seleccionable (parece escaneado). Todavía no podemos leer texto dentro de imágenes.');
  }
  return { ok: true, kind: 'documento', format: 'pdf', text };
}

/** Lee el archivo sin enviarlo a ningún lado: PDF con pdf.js, el resto en un Web Worker. */
export async function parseFile(file: File): Promise<ParseOk> {
  if (extensionOf(file.name) === '.pdf') return parsePdf(file);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<ParseResponse>) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'No se pudo leer el archivo'));
    };
    worker.postMessage({ file } satisfies ParseRequest);
  });
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v);
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

/** BOM al principio para que Excel abra bien las tildes. */
function csvBlob(fields: string[], data: string[][], delimiter: string): Blob {
  return new Blob(['﻿' + Papa.unparse({ fields, data }, { delimiter })], { type: 'text/csv;charset=utf-8' });
}

export async function downloadTable(table: Table, opts: { fileName: string; format: FileFormat; delimiter: string; sheetName: string }) {
  const base = baseName(opts.fileName);
  if (opts.format === 'csv') {
    download(
      csvBlob(
        table.headers,
        table.rows.map((r) => r.map(csvCell)),
        opts.delimiter,
      ),
      `${base}_depurado.csv`,
    );
    return;
  }
  if (opts.format === 'json') {
    download(new Blob([JSON.stringify(tableToJson(table), null, 2)], { type: 'application/json' }), `${base}_depurado.json`);
    return;
  }
  // SheetJS se carga solo cuando hace falta exportar a Excel.
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows], { cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName.slice(0, 31) || 'Datos');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}_depurado.xlsx`);
}

/** Documentos: JSON se descarga como JSON, Markdown como .md y el resto (PDF, Word, TXT) como texto plano. */
export function documentOutputExtension(format: FileFormat): 'json' | 'md' | 'txt' {
  return format === 'json' ? 'json' : format === 'md' ? 'md' : 'txt';
}

export function downloadDocument(text: string, fileName: string, format: FileFormat) {
  const ext = documentOutputExtension(format);
  const type = ext === 'json' ? 'application/json' : 'text/plain;charset=utf-8';
  download(new Blob([text], { type }), `${baseName(fileName)}_depurado.${ext}`);
}

export function downloadEquivalences(rows: EquivalenceRow[], fileName: string) {
  download(
    csvBlob(
      ['seudonimo', 'valor_original', 'grupo'],
      rows.map((r) => [r.seudonimo, r.original, r.grupo]),
      ',',
    ),
    `${baseName(fileName)}_equivalencias.csv`,
  );
}

/**
 * Lee un "_equivalencias.csv" descargado antes (columnas seudonimo, valor_original, grupo) para
 * traducir respuestas de la IA más tarde. Se lee en el navegador; no se sube a ningún lado.
 */
export async function readEquivalences(file: File): Promise<EquivalenceRow[]> {
  // Excel agrega una marca de orden de bytes (BOM) al principio de los CSV.
  const raw = await file.text();
  const text = raw.startsWith(String.fromCharCode(0xfeff)) ? raw.slice(1) : raw;
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const rows = parsed.data
    .map((r) => ({ seudonimo: (r.seudonimo ?? '').trim(), original: r.valor_original ?? r.original ?? '', grupo: (r.grupo ?? '').trim() }))
    .filter((r) => r.seudonimo && r.original);
  if (rows.length === 0) throw new Error('El archivo no parece una tabla de equivalencias (faltan las columnas seudonimo y valor_original).');
  return rows;
}

/** Tabla de equivalencias cifrada con contraseña (ver lib/crypto.ts). */
export async function downloadEncryptedEquivalences(rows: EquivalenceRow[], fileName: string, password: string) {
  const { encryptEquivalences } = await import('./crypto');
  download(await encryptEquivalences(rows, password), `${baseName(fileName)}_equivalencias.cifradas.json`);
}
