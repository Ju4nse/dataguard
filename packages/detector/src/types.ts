import type { Action, Confidence, DetectionType } from '@securedata/shared';

export type CellValue = string | number | boolean | Date | null | undefined;

export interface Table {
  headers: string[];
  rows: CellValue[][];
}

/** Dato sensible encontrado dentro de un texto. */
export interface Span {
  type: DetectionType;
  start: number;
  end: number;
  value: string;
  /** alta: validado (dígito verificador, formato inequívoco) · media: por contexto · baja: posible, revisar. */
  confidence: Confidence;
  /** El usuario marcó este valor como "no ocultar". */
  ignored?: boolean;
  /** Lo encontró la IA local (sin este campo: las reglas). */
  source?: 'ia';
}

export interface ColumnFinding {
  index: number;
  header: string;
  /**
   * - columna: toda la columna es de un tipo (ej. "CUIT").
   * - texto:   columna de texto libre con datos sensibles adentro.
   * - ninguno: no se detectó nada.
   */
  kind: 'columna' | 'texto' | 'ninguno';
  type: DetectionType | null;
  confidence: Confidence | null;
  /** Proporción de valores (no vacíos, de la muestra) que cumplen el patrón. */
  matchRatio: number;
  /** Cantidad de celdas (o fragmentos, en texto libre) detectadas en toda la columna. */
  detectionCount: number;
  /** Para kind = 'texto': cantidad de fragmentos por tipo. */
  textCounts: Partial<Record<DetectionType, number>>;
  /** Ejemplos enmascarados, seguros para mostrar en pantalla. */
  examples: string[];
  suggestedAction: Action;
  /** Explicación breve para el usuario. */
  reason: string;
  /** La IA local intervino: clasificó la columna o encontró datos en su texto libre. */
  aiAssisted?: boolean;
  /** Celdas de texto libre que la IA local no llegó a revisar (por el límite); quedan solo con reglas. */
  aiSkipped?: number;
}

export interface ColumnDecision {
  action: Action;
  /** Tipo que se aplica (el usuario puede corregir el detectado o marcar una columna a mano). */
  type: DetectionType | null;
  kind: 'columna' | 'texto';
  /** Prefijo del seudónimo; por defecto según el tipo (Persona, Empresa…). */
  prefix?: string;
}

export interface EquivalenceRow {
  seudonimo: string;
  original: string;
  grupo: string;
}

export interface TransformResult {
  table: Table;
  equivalences: EquivalenceRow[];
  /** Celdas o fragmentos efectivamente modificados, por tipo. */
  transformedCounts: Partial<Record<DetectionType, number>>;
}
