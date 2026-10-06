/**
 * Documento oculto de la extensión: hace de puente entre el service worker (que no puede correr
 * la IA) y el worker que tiene el modelo cargado. Lo crea el service worker cuando hace falta y lo
 * cierra cuando la IA no se usa por un rato, para liberar la memoria del modelo.
 */
import type { ModelSpan } from '@securedata/ml';
import type { AiDetectResponse, OffscreenEvent, OffscreenRequest } from '../lib/ai';
import type { WorkerRequest, WorkerResponse } from './ai.worker';

const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
let nextId = 1;
const pending = new Map<number, (spans: ModelSpan[] | null) => void>();

const report = async (e: OffscreenEvent) => {
  try {
    await chrome.runtime.sendMessage(e);
  } catch {
    // El service worker se reinicia solo con el próximo evento.
  }
};

/** Último avance informado: se avisa de a 1% (el modelo llega en miles de pedazos). */
let lastProgress = -1;

worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
  const m = e.data;
  if (m.type === 'descarga') {
    if (m.valor - lastProgress < 0.01) return;
    lastProgress = m.valor;
    void report({ tipo: 'ia-estado', estado: 'descargando', avance: m.valor });
  } else if (m.type === 'lista') void report({ tipo: 'ia-estado', estado: 'lista' });
  else if (m.type === 'resultado') {
    pending.get(m.id)?.(m.spans);
    pending.delete(m.id);
  } else if (m.type === 'error') {
    if (m.id !== undefined) {
      pending.get(m.id)?.(null);
      pending.delete(m.id);
    } else void report({ tipo: 'ia-estado', estado: 'error', error: m.mensaje });
  }
};

// El worker se cayó (por ejemplo, sin memoria): se avisa y lo pendiente sigue solo con reglas.
worker.onerror = (e) => {
  e.preventDefault();
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
  void report({ tipo: 'ia-estado', estado: 'error', error: e.message || 'La IA local se detuvo' });
};

const send = (req: WorkerRequest) => worker.postMessage(req);

chrome.runtime.onMessage.addListener((message: OffscreenRequest, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.destino !== 'ia') return;
  if (message.tipo === 'cargar') {
    send({ type: 'cargar' });
    return;
  }
  const id = nextId++;
  pending.set(id, (spans) => sendResponse({ spans } satisfies AiDetectResponse));
  send({ type: 'detectar', id, texto: message.texto });
  return true; // respuesta asíncrona
});
