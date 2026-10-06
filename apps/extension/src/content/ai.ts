import type { Span } from '@securedata/detector';
import type { AiDetectResponse, AiRequest } from '../lib/ai';

/** Textos ya analizados que se recuerdan (solo en la memoria de la pestaña). */
const CACHE_SIZE = 20;
/** Cada cuánto, como mucho, se le avisa al service worker que conviene tener el modelo cargado. */
const PREPARE_EVERY_MS = 60_000;

const ask = async <T>(req: AiRequest): Promise<T | undefined> => {
  try {
    return (await chrome.runtime.sendMessage(req)) as T;
  } catch {
    return undefined; // extensión recargada: sin IA, protegen las reglas
  }
};

/**
 * La IA local vista desde la página. Se analiza mientras el usuario escribe, así al enviar el
 * resultado suele estar listo. El texto viaja solo dentro de la extensión, nunca a la red.
 */
export function createAiClient(isActive: () => boolean) {
  const cache = new Map<string, Span[]>();
  const inflight = new Map<string, Promise<Span[] | null>>();
  let lastPrepare = 0;

  const remember = (text: string, spans: Span[]) => {
    cache.delete(text);
    cache.set(text, spans);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  };

  return {
    active: isActive,
    /** Lo que encontró la IA en este texto, si ya se analizó. */
    get: (text: string) => cache.get(text),
    has: (text: string) => cache.has(text),
    /** Sin respuesta de la IA para este texto: queda revisado solo con las reglas (no se vuelve a esperar). */
    skip: (text: string) => remember(text, []),

    /** El usuario está escribiendo: que el modelo se vaya cargando. */
    prepare() {
      if (!isActive() || Date.now() - lastPrepare < PREPARE_EVERY_MS) return;
      lastPrepare = Date.now();
      void ask({ tipo: 'ia-preparar' });
    },

    /** Analiza un texto. null si la IA no está o no respondió a tiempo (protegen las reglas). */
    request(text: string, timeoutMs: number): Promise<Span[] | null> {
      const cached = cache.get(text);
      if (cached) return Promise.resolve(cached);
      if (!isActive()) return Promise.resolve(null);
      let pending = inflight.get(text);
      if (!pending) {
        pending = (async () => {
          const res = await ask<AiDetectResponse>({ tipo: 'ia-detectar', texto: text });
          inflight.delete(text);
          if (res?.spans) remember(text, res.spans);
          return res?.spans ?? null;
        })();
        inflight.set(text, pending);
      }
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
      return Promise.race([pending, timeout]);
    },
  };
}
