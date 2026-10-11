/**
 * Lectura de Excel, Word y PDF (y escritura del Excel protegido) en el documento oculto de la extensión.
 * Las librerías se cargan solo cuando llega un archivo de ese tipo. Nada sale de la computadora.
 */
import type { CellValue } from '@securedata/detector';
import { extensionOf, fromBase64, toBase64, toSheet, type FileExcelResponse, type FileReadResponse, type ParsedFile, type Sheet } from '../lib/files';

/** Las fechas viajan como texto AAAA-MM-DD: los mensajes de Chrome solo llevan JSON (una fecha llegaría como "2025-09-18T03:00:00.000Z"). */
const dateAsText = (v: CellValue): CellValue => (v instanceof Date ? (isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)) : v);

async function parsePdf(bytes: Uint8Array): Promise<ParsedFile> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join(''));
  }
  await task.destroy();
  const text = pages.join('\n\n').trim();
  if (text.length < 20) throw new Error('el PDF no tiene texto seleccionable (parece escaneado)');
  return { kind: 'documento', format: 'pdf', text };
}

async function parse(name: string, bytes: Uint8Array): Promise<ParsedFile> {
  const ext = extensionOf(name);
  if (ext === '.pdf') return parsePdf(bytes);
  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    // La versión de navegador de mammoth lee arrayBuffer; la de Node (los tests), buffer.
    const { value } = await mammoth.extractRawText({ arrayBuffer, buffer: bytes } as { arrayBuffer: ArrayBuffer });
    return { kind: 'documento', format: 'docx', text: value.replace(/\n{3,}/g, '\n\n').trim() };
  }
  if (ext === '.xlsx' || ext === '.xls' || ext === '.ods') {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(bytes, { cellDates: true });
    const sheets = wb.SheetNames.map((n) =>
      toSheet(
        n,
        XLSX.utils.sheet_to_json<CellValue[]>(wb.Sheets[n]!, { header: 1, raw: true, defval: null, blankrows: false }).map((row) => row.map(dateAsText)),
      ),
    ).filter((s) => s.headers.length > 0);
    return { kind: 'tabla', format: 'xlsx', delimiter: ',', sheets };
  }
  throw new Error(`formato no soportado (${ext})`);
}

async function writeExcel(sheets: Sheet[]): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([s.headers, ...s.rows]), s.name.slice(0, 31) || 'Datos');
  return toBase64(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer));
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function readFile(name: string, base64: string): Promise<FileReadResponse> {
  try {
    return { ok: true, archivo: await parse(name, fromBase64(base64)) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function buildExcel(sheets: Sheet[]): Promise<FileExcelResponse> {
  try {
    return { ok: true, datos: await writeExcel(sheets) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
