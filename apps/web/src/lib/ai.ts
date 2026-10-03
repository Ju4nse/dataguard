import type { Span } from '@securedata/detector';
import { create } from 'zustand';
import type { AiRequest, AiResponse } from './ai.worker';

export type AiStatus = 'apagada' | 'descargando' | 'lista' | 'error';

interface AiState {
  status: AiStatus;
  /** Avance de la descarga (0 a 1). */
  progress: number;
  error: string | null;
  enable: () => void;
  disable: () => void;
}

const PREF = 'dataguard.ia-local';
const readPref = () => {
  try {
    return localStorage.getItem(PREF) === 'on';
  } catch {
    return false;
  }
};
const writePref = (on: boolean) => {
  try {
    if (on) localStorage.setItem(PREF, 'on');
    else localStorage.removeItem(PREF);
  } catch {
    // Sin almacenamiento (modo privado): la preferencia dura solo esta visita.
  }
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (s: Span[][]) => void; reject: (e: Error) => void; onProgress?: (v: number) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<AiResponse>) => {
    const m = e.data;
    if (m.type === 'descarga') useAi.setState({ status: 'descargando', progress: m.valor });
    else if (m.type === 'lista') useAi.setState({ status: 'lista', progress: 1, error: null });
    else if (m.type === 'avance') pending.get(m.id)?.onProgress?.(m.valor);
    else if (m.type === 'resultado') {
      pending.get(m.id)?.resolve(m.spans);
      pending.delete(m.id);
    } else if (m.type === 'error') {
      if (m.id !== undefined) {
        pending.get(m.id)?.reject(new Error(m.mensaje));
        pending.delete(m.id);
      } else useAi.setState({ status: 'error', error: m.mensaje });
    }
  };
  return worker;
}

const send = (req: AiRequest) => getWorker().postMessage(req);

export const useAi = create<AiState>((set) => ({
  status: 'apagada',
  progress: 0,
  error: null,
  enable: () => {
    writePref(true);
    set({ status: 'descargando', progress: 0, error: null });
    send({ type: 'cargar' });
  },
  disable: () => {
    writePref(false);
    worker?.terminate();
    worker = null;
    for (const p of pending.values()) p.reject(new Error('IA local desactivada'));
    pending.clear();
    set({ status: 'apagada', progress: 0, error: null });
  },
}));

/** Si el usuario ya la había activado, se carga al abrir la página (desde el caché, sin volver a descargar). */
export function restoreAi() {
  if (readPref() && useAi.getState().status === 'apagada') useAi.getState().enable();
}

/** Corre la IA local sobre los segmentos de un documento. Solo llamar con status 'lista'. */
export function detectWithAi(segments: string[], onProgress?: (v: number) => void): Promise<Span[][]> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    send({ type: 'detectar', id, segments });
  });
}
