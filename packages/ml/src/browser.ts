/**
 * IA local en el navegador: descarga el modelo (una sola vez), lo guarda y lo corre con onnxruntime.
 * Lo usan la app web (en un Web Worker) y la extensión (en su documento oculto), así las dos corren
 * siempre el mismo modelo con la misma configuración. El texto analizado nunca sale de la computadora:
 * no hay ningún fetch con contenido del usuario.
 */
import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-web/wasm';
import { DEFAULT_CONFIG } from './gliner';
import { glinerTokenizer, MODEL, modelFileUrl, ortRunner, type ModelSpan } from './model';
import { detectInSegments } from './segments';
import { entryNames, modelDir } from './storage';

export interface LocalAiOptions {
  /** Carpeta donde está publicado el modelo (termina en "/"). */
  modelBase: string;
  /** URLs de los archivos de onnxruntime: cada app los empaqueta con su bundler. */
  wasmPaths: { wasm: string; mjs: string };
  /** Avance de la descarga (0 a 1). */
  onDownload?: (fraction: number) => void;
}

export interface LocalAi {
  /** Descarga (o toma del caché) y carga el modelo. Se puede llamar varias veces: carga una sola. */
  load(): Promise<void>;
  /** `windowWords: 0` analiza cada segmento por separado (celdas de planillas: juntas pierden contexto). */
  detect(segments: string[], options?: { windowWords?: number; onProgress?: (fraction: number) => void }): Promise<ModelSpan[][]>;
}

/** Lo que se guarda junto a cada archivo ("<nombre>.ok"): marca que la descarga terminó y de qué versión es. */
interface Stamp {
  bytes: number;
  /** sha256 del manifiesto publicado (solo los archivos partidos lo tienen). */
  sha256?: string;
}

/**
 * El nombre en el caché incluye la revisión del modelo: si cambia MODEL (en model.ts), la web y la
 * extensión bajan el nuevo aunque la URL sea la misma, y el viejo se borra.
 */
const cacheName = (url: string) => `${MODEL.revision.slice(0, 12)}_${url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_')}`;

interface Manifest {
  partes: { archivo: string }[];
  bytes: number;
  sha256?: string;
}

/**
 * En Pages el modelo está partido en pedazos de menos de 100 MB, con un manifiesto
 * "<archivo>.partes.json". Si no hay manifiesto (en desarrollo), se baja el archivo entero.
 */
async function manifestOf(url: string): Promise<Manifest | null> {
  try {
    const res = await fetch(`${url}.partes.json`, { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as Manifest) : null;
  } catch {
    return null; // sin manifiesto o sin conexión
  }
}

async function readCached(dir: FileSystemDirectoryHandle, name: string, published: Manifest | null): Promise<Uint8Array | null> {
  try {
    const stamp = JSON.parse(await (await (await dir.getFileHandle(`${name}.ok`)).getFile()).text()) as Stamp;
    // Se publicó otro modelo con el mismo nombre: el guardado quedó viejo.
    if (published?.sha256 && stamp.sha256 !== published.sha256) return null;
    const file = await (await dir.getFileHandle(name)).getFile();
    if (file.size !== stamp.bytes) return null;
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

/** Descarga un archivo del modelo (o lo toma del caché), informando el avance en bytes. */
async function fetchCached(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const dir = await modelDir();
  const name = cacheName(url);
  const published = await manifestOf(url);
  const hit = dir && (await readCached(dir, name, published));
  if (hit) {
    onBytes(hit.byteLength);
    return hit;
  }

  const urls = published ? published.partes.map((p) => new URL(p.archivo, url).href) : [url];
  // Se escribe al disco a medida que llega; si el navegador no deja, se sigue sin caché.
  let writable: FileSystemWritableFileStream | null = null;
  try {
    writable = dir ? await (await dir.getFileHandle(name, { create: true })).createWritable() : null;
  } catch {
    writable = null;
  }
  // Un único buffer en memoria (el modelo no queda duplicado); las partes se escriben una detrás de otra.
  let buf = new Uint8Array(published?.bytes || 1 << 20);
  let received = 0;
  for (const source of urls) {
    const res = await fetch(source);
    if (!res.ok || !res.body) {
      await writable?.abort().catch(() => {});
      throw new Error(`No se pudo descargar el modelo (${res.status})`);
    }
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.length > buf.length) {
        const bigger = new Uint8Array(Math.max(buf.length * 2, received + value.length));
        bigger.set(buf.subarray(0, received));
        buf = bigger;
      }
      buf.set(value, received);
      received += value.length;
      if (writable) {
        try {
          await writable.write(value);
        } catch {
          await writable.abort().catch(() => {});
          writable = null;
        }
      }
      onBytes(value.length);
    }
  }
  if (published && received !== published.bytes) {
    await writable?.abort().catch(() => {});
    throw new Error('La descarga del modelo quedó incompleta. Probá de nuevo.');
  }
  if (writable && dir) {
    try {
      await writable.close();
      const stamp: Stamp = { bytes: received, sha256: published?.sha256 };
      const ok = await (await dir.getFileHandle(`${name}.ok`, { create: true })).createWritable();
      await ok.write(JSON.stringify(stamp));
      await ok.close();
    } catch {
      // Si no se pudo guardar, la próxima vez se descarga de nuevo.
    }
  }
  return buf.subarray(0, received);
}

/** Borra del caché los archivos de versiones anteriores del modelo (pesan cientos de MB). */
async function removeStale(keep: string[]) {
  const dir = await modelDir();
  if (!dir) return;
  const names = new Set(keep.flatMap((n) => [n, `${n}.ok`]));
  try {
    for await (const name of entryNames(dir)) if (!names.has(name)) await dir.removeEntry(name);
  } catch {
    // Si no se puede limpiar, no afecta el funcionamiento.
  }
}

export function createLocalAi(options: LocalAiOptions): LocalAi {
  let ready: Promise<{ tok: ReturnType<typeof glinerTokenizer>; runner: ReturnType<typeof ortRunner> }> | null = null;

  const load = () => {
    ready ??= (async () => {
      ort.env.wasm.wasmPaths = options.wasmPaths;
      // Varios hilos solo si la página está aislada (COOP/COEP); si no, uno.
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

      // El avance se mide sobre el total aproximado (el ONNX es casi todo).
      const totalBytes = MODEL.sizeMb * 1_000_000;
      let loaded = 0;
      const onBytes = (n: number) => {
        loaded += n;
        options.onDownload?.(Math.min(0.99, loaded / totalBytes));
      };
      const decode = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b));
      const urls = [MODEL.tokenizer, MODEL.tokenizerConfig, MODEL.onnx].map((f) => modelFileUrl(f, options.modelBase));
      const [tokJson, tokConfig, onnx] = await Promise.all([
        fetchCached(urls[0]!, onBytes).then(decode),
        fetchCached(urls[1]!, onBytes).then(decode),
        fetchCached(urls[2]!, onBytes),
      ]);
      const session = await ort.InferenceSession.create(onnx, { executionProviders: ['wasm'] });
      void removeStale(urls.map(cacheName));
      return { tok: glinerTokenizer(new Tokenizer(tokJson, tokConfig)), runner: ortRunner(session, ort.Tensor) };
    })();
    ready.catch(() => {
      ready = null; // permite reintentar
    });
    return ready;
  };

  return {
    load: async () => {
      await load();
    },
    detect: async (segments, opts = {}) => {
      const { tok, runner } = await load();
      return detectInSegments(segments, tok, runner, {
        config: { ...DEFAULT_CONFIG, windowWords: opts.windowWords ?? DEFAULT_CONFIG.windowWords },
        onProgress: (done, total) => opts.onProgress?.(total ? done / total : 1),
      });
    },
  };
}
