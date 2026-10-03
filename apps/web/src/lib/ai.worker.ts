/// <reference lib="webworker" />
/**
 * IA local: corre GLiNER en un Web Worker para no trabar la página. El modelo se descarga una sola
 * vez desde Hugging Face y queda en el Cache Storage del navegador. El texto analizado nunca sale
 * de este worker: no hay ningún fetch con contenido del usuario.
 */
import { Tokenizer } from '@huggingface/tokenizers';
import { DEFAULT_CONFIG, detectInSegments, glinerTokenizer, MODEL, modelFileUrl, ortRunner, type GlinerRunner, type GlinerTokenizer } from '@securedata/ml';
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
// Con varios hilos, onnxruntime crea un worker por hilo cargando este .mjs: tiene que ser una URL real.
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

/** windowWords: palabras por ventana (0 = cada frase o celda por separado, para planillas). */
export type AiRequest = { type: 'cargar' } | { type: 'detectar'; id: number; segments: string[]; windowWords?: number };
export type AiResponse =
  | { type: 'descarga'; valor: number }
  | { type: 'lista' }
  | { type: 'error'; mensaje: string; id?: number }
  | { type: 'avance'; id: number; valor: number }
  | { type: 'resultado'; id: number; spans: Awaited<ReturnType<typeof detectInSegments>> };

const post = (m: AiResponse) => self.postMessage(m);

/**
 * Caché del modelo en el sistema de archivos privado del navegador (OPFS): aguanta archivos de
 * cientos de MB (Cache Storage falla con respuestas tan grandes en algunos navegadores).
 * Cada archivo se marca como completo con un "<nombre>.ok" que guarda su tamaño.
 */
async function modelDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('dataguard-modelos-v1', { create: true });
  } catch {
    return null; // sin OPFS: funciona igual, pero se vuelve a descargar en cada visita
  }
}

const cacheName = (url: string) => url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_');

async function readCached(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | null> {
  try {
    const ok = await (await (await dir.getFileHandle(`${name}.ok`)).getFile()).text();
    const file = await (await dir.getFileHandle(name)).getFile();
    if (String(file.size) !== ok.trim()) return null;
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * En Pages el modelo está partido en pedazos de menos de 100 MB, con un manifiesto
 * "<archivo>.partes.json". Si no hay manifiesto (en desarrollo), se baja el archivo entero.
 */
async function sourcesOf(url: string): Promise<{ urls: string[]; total: number }> {
  try {
    const res = await fetch(`${url}.partes.json`, { cache: 'no-cache' });
    if (res.ok) {
      const m = (await res.json()) as { partes: { archivo: string }[]; bytes: number };
      return { urls: m.partes.map((p) => new URL(p.archivo, url).href), total: m.bytes };
    }
  } catch {
    // sin manifiesto: archivo entero
  }
  return { urls: [url], total: 0 };
}

/** Descarga un archivo del modelo (o lo toma del caché), informando el avance en bytes. */
async function fetchCached(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const dir = await modelDir();
  const name = cacheName(url);
  const hit = dir && (await readCached(dir, name));
  if (hit) {
    onBytes(hit.byteLength);
    return hit;
  }

  const sources = await sourcesOf(url);
  // Se escribe al disco a medida que llega; si el navegador no deja, se sigue sin caché.
  let writable: FileSystemWritableFileStream | null = null;
  try {
    writable = dir ? await (await dir.getFileHandle(name, { create: true })).createWritable() : null;
  } catch {
    writable = null;
  }
  // Un único buffer en memoria (el modelo no queda duplicado); las partes se escriben una detrás de otra.
  let buf = new Uint8Array(sources.total || 1 << 20);
  let received = 0;
  for (const source of sources.urls) {
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
  if (sources.total && received !== sources.total) {
    await writable?.abort().catch(() => {});
    throw new Error('La descarga del modelo quedó incompleta. Probá de nuevo.');
  }
  if (writable && dir) {
    try {
      await writable.close();
      const ok = await (await dir.getFileHandle(`${name}.ok`, { create: true })).createWritable();
      await ok.write(String(received));
      await ok.close();
    } catch {
      // Si no se pudo guardar, la próxima vez se descarga de nuevo.
    }
  }
  return buf.subarray(0, received);
}

/**
 * Carpeta donde está publicado el modelo (VITE_MODEL_BASE). En desarrollo, Vite lo sirve desde
 * .cache/modelos (ver vite.config.ts).
 */
const MODEL_BASE = new URL(import.meta.env.VITE_MODEL_BASE ?? `${import.meta.env.BASE_URL}modelos/${MODEL.id.split('/')[1]}/`, self.location.origin).href;

/** Borra del caché los archivos de versiones anteriores del modelo (pesan cientos de MB). */
async function removeStale(keep: string[]) {
  const dir = await modelDir();
  if (!dir) return;
  const names = new Set(keep.flatMap((n) => [n, `${n}.ok`]));
  try {
    // keys() existe en todos los navegadores con OPFS, pero falta en los tipos de TypeScript.
    const entries = (dir as unknown as { keys(): AsyncIterable<string> }).keys();
    for await (const name of entries) if (!names.has(name)) await dir.removeEntry(name);
  } catch {
    // Si no se puede limpiar, no afecta el funcionamiento.
  }
}

let ready: Promise<{ tok: GlinerTokenizer; runner: GlinerRunner }> | null = null;

function load() {
  ready ??= (async () => {
    ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
    // Varios hilos solo si la página está aislada (COOP/COEP); en GitHub Pages corre en uno.
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

    // El avance se mide sobre el total aproximado (el ONNX es casi todo).
    const totalBytes = MODEL.sizeMb * 1_000_000;
    let loaded = 0;
    const onBytes = (n: number) => {
      loaded += n;
      post({ type: 'descarga', valor: Math.min(0.99, loaded / totalBytes) });
    };
    const decode = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b));
    const urls = [MODEL.tokenizer, MODEL.tokenizerConfig, MODEL.onnx].map((f) => modelFileUrl(f, MODEL_BASE));
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
}

self.onmessage = async (e: MessageEvent<AiRequest>) => {
  const msg = e.data;
  if (msg.type === 'cargar') {
    try {
      await load();
      post({ type: 'lista' });
    } catch (err) {
      post({ type: 'error', mensaje: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  try {
    const { tok, runner } = await load();
    const spans = await detectInSegments(msg.segments, tok, runner, {
      config: { ...DEFAULT_CONFIG, windowWords: msg.windowWords ?? DEFAULT_CONFIG.windowWords },
      onProgress: (done, total) => post({ type: 'avance', id: msg.id, valor: total ? done / total : 1 }),
    });
    post({ type: 'resultado', id: msg.id, spans });
  } catch (err) {
    post({ type: 'error', id: msg.id, mensaje: err instanceof Error ? err.message : String(err) });
  }
};
