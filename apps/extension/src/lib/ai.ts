import { MODEL_PATH, PUBLISHED_APP_URL, type ModelSpan } from '@securedata/ml';

/**
 * IA local en la extensión: el mismo modelo que la app web (definido en @securedata/ml) y bajado del
 * mismo lugar, así cuando se publica otro modelo las dos usan el nuevo. VITE_MODEL_BASE permite
 * probar con un modelo local al compilar.
 */
export const MODEL_BASE: string = import.meta.env.VITE_MODEL_BASE ?? `${PUBLISHED_APP_URL}${MODEL_PATH}`;

export type AiState = 'apagada' | 'descargando' | 'lista' | 'error';

export interface AiStatus {
  estado: AiState;
  /** Avance de la descarga (0 a 1). */
  avance: number;
  error: string | null;
}

export const AI_OFF: AiStatus = { estado: 'apagada', avance: 0, error: null };

/** Del popup y del script de contenido al service worker. */
export type AiRequest =
  | { tipo: 'ia-activar' }
  | { tipo: 'ia-desactivar' }
  /** El usuario empezó a escribir: conviene tener el modelo cargado. */
  | { tipo: 'ia-preparar' }
  /** El texto viaja solo dentro de la extensión (service worker → documento oculto): nunca a la red. */
  | { tipo: 'ia-detectar'; texto: string };

export interface AiDetectResponse {
  /** null: la IA no está activa o no pudo analizar (protegen solo las reglas). */
  spans: ModelSpan[] | null;
}

/** Del service worker al documento oculto, y su respuesta de estado. */
export type OffscreenRequest = { destino: 'ia'; tipo: 'cargar' } | { destino: 'ia'; tipo: 'detectar'; texto: string };
export type OffscreenEvent = { tipo: 'ia-estado'; estado: AiState; avance?: number; error?: string };
