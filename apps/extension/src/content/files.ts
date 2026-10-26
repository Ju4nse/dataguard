/**
 * Archivos adjuntos en el chat: con el clip (input de archivo), arrastrándolos o pegándolos. Si hay
 * alguno que DataGuard sabe leer, se frena antes de que el sitio lo reciba, se analiza en la computadora
 * y, según lo que elija el usuario, se le entrega al sitio la versión protegida, el original o nada.
 * Lo que no se sabe leer (imágenes, audio, zip…) pasa sin cambios y sin demora.
 */
import type { PseudonymRegistry, Span } from '@securedata/detector';
import {
  extensionOf,
  fileDetections,
  fromBase64,
  isReviewable,
  MAX_FILE_MB,
  parseTextFile,
  protectFile,
  reviewFile,
  TEXT_EXTENSIONS,
  toBase64,
  type FileExcelResponse,
  type FileReadResponse,
  type FileRequest,
  type FileReview,
  type ParsedFile,
  type ProtectedContent,
} from '../lib/files';
import type { Decision, Message } from '../lib/messages';
import type { Policy } from '../lib/protect';
import { askAboutFiles, setChecking, setIdle } from './ui';

export interface FileGuardOptions {
  siteName: string;
  /** El usuario pausó DataGuard en esta pestaña: los archivos pasan sin revisar. */
  paused: () => boolean;
  policy: () => Policy;
  registry: () => PseudonymRegistry;
  organizacion: () => string | null;
  /** Lo que encuentra la IA local en el texto de un documento ([] si no está activa o no respondió). */
  aiSpans: (text: string) => Promise<Span[]>;
}

/** Los documentos más largos que esto se revisan solo con las reglas (la IA tardaría demasiado). */
const AI_MAX_CHARS = 20_000;
const PREVIEW_CHARS = 900;
/** Marca de orden de bytes que lleva el CSV (para Excel): no se muestra en la vista previa. */
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);

async function readParsed(file: File): Promise<ParsedFile> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`pesa más de ${MAX_FILE_MB} MB`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (TEXT_EXTENSIONS.includes(extensionOf(file.name))) return parseTextFile(file.name, bytes);
  const req: FileRequest = { tipo: 'archivo-leer', nombre: file.name, datos: toBase64(bytes) };
  const res = (await chrome.runtime.sendMessage(req).catch(() => undefined)) as FileReadResponse | undefined;
  if (!res) throw new Error('la extensión no respondió (probá recargar la página)');
  if (!res.ok) throw new Error(res.error);
  return res.archivo;
}

async function toFile(content: ProtectedContent): Promise<File> {
  if ('sheets' in content) {
    const req: FileRequest = { tipo: 'archivo-excel', hojas: content.sheets };
    const res = (await chrome.runtime.sendMessage(req).catch(() => undefined)) as FileExcelResponse | undefined;
    if (!res?.ok) throw new Error(res?.error ?? 'la extensión no respondió');
    const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return new File([fromBase64(res.datos) as BlobPart], content.name, { type, lastModified: Date.now() });
  }
  return new File([content.text], content.name, { type: content.type, lastModified: Date.now() });
}

function preview(content: ProtectedContent): string {
  if (!('sheets' in content)) return content.text.replace(BOM, '').slice(0, PREVIEW_CHARS);
  const [sheet] = content.sheets;
  if (!sheet) return '';
  const line = (cells: unknown[]) => cells.map((c) => (c === null || c === undefined ? '' : String(c))).join(' · ');
  return [line(sheet.headers), ...sheet.rows.slice(0, 6).map(line)].join('\n').slice(0, PREVIEW_CHARS);
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function report(review: FileReview, decision: Decision, uploadedProtected: boolean) {
  const { parsed } = review;
  const message: Message = {
    tipo: 'evento',
    decision,
    detecciones: fileDetections(review, uploadedProtected),
    archivo: {
      entrada: parsed.kind === 'tabla' ? 'tabla' : 'documento',
      formato: extensionOf(review.name).slice(1),
      filas: parsed.kind === 'tabla' ? parsed.sheets.reduce((n, s) => n + s.rows.length, 0) : undefined,
    },
  };
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // Extensión recargada: se pierde el evento, no la protección.
  }
}

/**
 * Revisa los archivos y devuelve los que hay que entregarle al sitio (null: no subir nada).
 * Los seudónimos son los de la pestaña: "Persona_01" en el archivo es la misma que en el prompt.
 */
export async function reviewFiles(files: File[], o: FileGuardOptions): Promise<File[] | null> {
  const reviews = new Map<File, FileReview>();
  const unreadable: { file: File; reason: string }[] = [];
  setChecking(files.length > 1 ? 'Revisando los archivos…' : 'Revisando el archivo…');
  try {
    for (const file of files) {
      if (!isReviewable(file)) continue;
      try {
        const parsed = await readParsed(file);
        const spans = parsed.kind === 'documento' && parsed.text.length <= AI_MAX_CHARS ? await o.aiSpans(parsed.text) : [];
        const review = reviewFile(file.name, parsed, o.policy(), o.registry(), spans);
        if (review) reviews.set(file, review);
      } catch (e) {
        unreadable.push({ file, reason: e instanceof Error ? e.message : String(e) });
      }
    }
  } finally {
    setIdle();
  }
  if (reviews.size === 0 && unreadable.length === 0) return files;

  const registry = o.registry();
  const contents = new Map([...reviews].map(([file, review]) => [file, protectFile(review, registry)]));
  const first = [...contents.values()][0];
  const choice = await askAboutFiles({
    site: o.siteName,
    files: [...reviews].map(([file, review]) => ({ name: file.name, summary: review.summary, protectedName: contents.get(file)!.name })),
    unreadable: unreadable.map((u) => ({ name: u.file.name, reason: u.reason })),
    preview: first ? preview(first) : '',
    pseudonyms: registry.entries().map((r) => r.seudonimo),
    enforced: [...reviews.values()].some((r) => r.enforced),
    organizacion: o.organizacion(),
  });

  const reportAll = (decision: Decision, uploadedProtected: boolean) => {
    for (const review of reviews.values()) void report(review, decision, uploadedProtected);
  };
  if (choice === 'cancelar') {
    reportAll('cancelado', false);
    return null;
  }
  if (choice === 'subir-original') {
    reportAll('ignorado', false);
    return files;
  }

  let protectedFiles: Map<File, File>;
  try {
    protectedFiles = new Map(await Promise.all([...contents].map(async ([file, content]) => [file, await toFile(content)] as const)));
  } catch {
    reportAll('cancelado', false);
    setChecking('No pude armar el archivo protegido: no se subió nada');
    setTimeout(setIdle, 5000);
    return null;
  }
  reportAll('enmascarado', true);
  if (choice === 'descargar') {
    for (const f of protectedFiles.values()) download(f);
    return null;
  }
  // Los que no se pudieron leer no se suben con "Subir protegidos".
  const unreadableSet = new Set(unreadable.map((u) => u.file));
  return files.filter((f) => !unreadableSet.has(f)).map((f) => protectedFiles.get(f) ?? f);
}

/** Primer elemento real del evento (aunque esté dentro de un shadow DOM). */
const realTarget = (e: Event) => (e.composedPath()[0] ?? e.target) as EventTarget | null;

const transfer = (files: File[]) => {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt;
};

/** Escucha las tres formas de adjuntar un archivo, en fase de captura (antes que el sitio). */
export function guardFiles(o: FileGuardOptions) {
  /** Mientras se le entrega al sitio lo ya revisado, no se vuelve a interceptar. */
  let reinjecting = false;
  const needsReview = (files: FileList | null | undefined) => !o.paused() && !!files && [...files].some(isReviewable);
  const fileInput = (e: Event) => {
    const t = realTarget(e);
    return t instanceof HTMLInputElement && t.type === 'file' ? t : null;
  };
  const deliver = (fire: () => void) => {
    reinjecting = true;
    try {
      fire();
    } finally {
      reinjecting = false;
    }
  };

  // El navegador avisa "input" y después "change": el sitio no tiene que ver ninguno de los dos todavía.
  window.addEventListener(
    'input',
    (e) => {
      const input = fileInput(e);
      if (!reinjecting && input && needsReview(input.files)) e.stopImmediatePropagation();
    },
    true,
  );

  window.addEventListener(
    'change',
    (e) => {
      const input = fileInput(e);
      if (reinjecting || !input || !needsReview(input.files)) return;
      e.stopImmediatePropagation();
      const files = [...input.files!];
      void reviewFiles(files, o).then((result) => {
        if (!result?.length) {
          input.value = '';
          return;
        }
        input.files = transfer(result).files;
        deliver(() => {
          input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        });
      });
    },
    true,
  );

  window.addEventListener(
    'drop',
    (e) => {
      if (reinjecting || !needsReview(e.dataTransfer?.files)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const target = realTarget(e);
      const { clientX, clientY } = e;
      const files = [...e.dataTransfer!.files];
      void reviewFiles(files, o).then((result) => {
        const el = target instanceof Element && target.isConnected ? target : (document.elementFromPoint(clientX, clientY) ?? document.body);
        const init = { bubbles: true, cancelable: true, composed: true, clientX, clientY };
        // Sin nada que subir: que el sitio saque su cartel de "soltá el archivo acá".
        if (!result?.length) return void el.dispatchEvent(new DragEvent('dragleave', init));
        deliver(() => el.dispatchEvent(new DragEvent('drop', { ...init, dataTransfer: transfer(result) })));
      });
    },
    true,
  );

  window.addEventListener(
    'paste',
    (e) => {
      if (reinjecting || !needsReview(e.clipboardData?.files)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const target = realTarget(e);
      const files = [...e.clipboardData!.files];
      void reviewFiles(files, o).then((result) => {
        if (!result?.length || !(target instanceof Element) || !target.isConnected) return;
        deliver(() => target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: transfer(result) })));
      });
    },
    true,
  );
}
