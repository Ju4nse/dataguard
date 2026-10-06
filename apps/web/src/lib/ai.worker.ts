/// <reference lib="webworker" />
/**
 * IA local: corre GLiNER en un Web Worker para no trabar la página. La descarga, el caché y la
 * ejecución del modelo están en @securedata/ml/browser (los comparte la extensión). El texto
 * analizado nunca sale de este worker.
 */
import { MODEL_PATH, type ModelSpan } from '@securedata/ml';
import { createLocalAi } from '@securedata/ml/browser';
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
  | { type: 'resultado'; id: number; spans: ModelSpan[][] };

const post = (m: AiResponse) => self.postMessage(m);

/**
 * Carpeta donde está publicado el modelo (VITE_MODEL_BASE). Por defecto, junto a la app; en
 * desarrollo, Vite lo sirve desde .cache/modelos (ver vite.config.ts).
 */
const MODEL_BASE = new URL(import.meta.env.VITE_MODEL_BASE ?? `${import.meta.env.BASE_URL}${MODEL_PATH}`, self.location.origin).href;

const ai = createLocalAi({
  modelBase: MODEL_BASE,
  wasmPaths: { wasm: wasmUrl, mjs: mjsUrl },
  onDownload: (valor) => post({ type: 'descarga', valor }),
});

self.onmessage = async (e: MessageEvent<AiRequest>) => {
  const msg = e.data;
  if (msg.type === 'cargar') {
    try {
      await ai.load();
      post({ type: 'lista' });
    } catch (err) {
      post({ type: 'error', mensaje: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  try {
    const spans = await ai.detect(msg.segments, {
      windowWords: msg.windowWords,
      onProgress: (valor) => post({ type: 'avance', id: msg.id, valor }),
    });
    post({ type: 'resultado', id: msg.id, spans });
  } catch (err) {
    post({ type: 'error', id: msg.id, mensaje: err instanceof Error ? err.message : String(err) });
  }
};
