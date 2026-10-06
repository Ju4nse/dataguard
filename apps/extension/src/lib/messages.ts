import type { Action, DetectionType } from '@securedata/shared';

/** Qué hizo el usuario con el aviso (mismos valores que app.decision_usuario en la base). */
export type Decision = 'enmascarado' | 'ignorado' | 'cancelado';

export interface Detection {
  tipo: DetectionType;
  accion: Action;
  cantidad: number;
}

/**
 * Mensaje del script de contenido al service worker. Solo metadatos: nunca lleva el texto
 * del prompt (el sitio lo deduce el service worker de la pestaña que manda el mensaje).
 */
export interface Message {
  tipo: 'evento';
  decision: Decision;
  detecciones: Detection[];
}
