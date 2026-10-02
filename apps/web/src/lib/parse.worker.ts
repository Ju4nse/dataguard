/// <reference lib="webworker" />
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { jsonAsTable, type CellValue } from '@securedata/detector';
import type { ParsedSheet, ParseRequest, ParseResponse } from './files';

/** Los CSV/TXT exportados en Windows en Argentina suelen venir en Windows-1252, no en UTF-8. */
function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function toSheet(name: string, matrix: CellValue[][]): ParsedSheet {
  const nonEmpty = matrix.filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
  const [head = [], ...rest] = nonEmpty;
  const width = Math.max(head.length, ...rest.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => {
    const h = head[i];
    return h === null || h === undefined || String(h).trim() === '' ? `Columna ${i + 1}` : String(h).trim();
  });
  const rows = rest.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null));
  return { name, headers, rows };
}

async function parse(file: File): Promise<ParseResponse> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

  if (ext === '.csv' || ext === '.tsv') {
    const parsed = Papa.parse<string[]>(decode(await file.arrayBuffer()), { skipEmptyLines: 'greedy' });
    return { ok: true, kind: 'tabla', format: 'csv', delimiter: parsed.meta.delimiter, sheets: [toSheet('CSV', parsed.data)] };
  }

  if (ext === '.xlsx' || ext === '.xls' || ext === '.ods') {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheets = wb.SheetNames.map((n) =>
      toSheet(n, XLSX.utils.sheet_to_json<CellValue[]>(wb.Sheets[n]!, { header: 1, raw: true, defval: null, blankrows: false })),
    ).filter((s) => s.headers.length > 0);
    return { ok: true, kind: 'tabla', format: 'xlsx', delimiter: ',', sheets };
  }

  if (ext === '.json') {
    let root: unknown;
    try {
      root = JSON.parse(decode(await file.arrayBuffer()));
    } catch {
      return { ok: false, error: 'El archivo no es un JSON válido.' };
    }
    const table = jsonAsTable(root);
    if (table) return { ok: true, kind: 'tabla', format: 'json', delimiter: ',', sheets: [{ name: 'JSON', ...table }] };
    return { ok: true, kind: 'json', root };
  }

  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    // mammoth separa los párrafos con líneas en blanco dobles.
    return { ok: true, kind: 'documento', format: 'docx', text: value.replace(/\n{3,}/g, '\n\n').trim() };
  }

  if (ext === '.txt' || ext === '.md') {
    return { ok: true, kind: 'documento', format: ext === '.md' ? 'md' : 'txt', text: decode(await file.arrayBuffer()) };
  }

  return { ok: false, error: `Formato no soportado (${ext}).` };
}

self.onmessage = async (e: MessageEvent<ParseRequest>) => {
  try {
    self.postMessage(await parse(e.data.file));
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies ParseResponse);
  }
};
