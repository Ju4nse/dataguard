/// <reference lib="webworker" />
/**
 * IA local de la extensión: el mismo cargador y modelo que la app web (@securedata/ml/browser).
 * Corre en un worker para que un análisis largo no frene los mensajes del documento oculto.
 */
import type { ModelSpan } from '@securedata/ml';
import { createLocalAi } from '@securedata/ml/browser';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { MODEL_BASE } from '../lib/ai';

export type WorkerRequest = { type: 'cargar' } | { type: 'detectar'; id: number; texto: string };
export type WorkerResponse =
  | { type: 'descarga'; valor: number }
  | { type: 'lista' }
  | { type: 'error'; mensaje: string; id?: number }
  | { type: 'resultado'; id: number; spans: ModelSpan[] };

const post = (m: WorkerResponse) => self.postMessage(m);

const ai = createLocalAi({
  modelBase: MODEL_BASE,
  wasmPaths: { wasm: wasmUrl, mjs: mjsUrl },
  onDownload: (valor) => post({ type: 'descarga', valor }),
});

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'cargar') {
      await ai.load();
      post({ type: 'lista' });
    } else {
      const [spans] = await ai.detect([msg.texto]);
      post({ type: 'resultado', id: msg.id, spans: spans ?? [] });
    }
  } catch (err) {
    post({ type: 'error', mensaje: err instanceof Error ? err.message : String(err), id: msg.type === 'detectar' ? msg.id : undefined });
  }
};
