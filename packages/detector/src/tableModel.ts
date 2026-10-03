import type { DetectionType } from '@securedata/shared';
import { DETECTION_LABELS } from '@securedata/shared';
import { DEFAULT_ACTIONS, isFreeText } from './classifyColumn';
import { combineModelSpans } from './combine';
import { countByType, scanText } from './scanText';
import type { ColumnFinding, Span, Table } from './types';
import { cellToString, maskForDisplay } from './util';

/**
 * IA local sobre planillas. Dos usos:
 * - "muestra": columnas que las reglas no pudieron clasificar (o con confianza baja). Se le pasa al
 *   modelo una muestra de valores con el encabezado como contexto ("Cliente: Graciela Benítez"); si
 *   reconoce el mismo tipo en la mayoría, se clasifica la columna entera.
 * - "texto": columnas de texto libre (observaciones, notas). Se analiza cada celda y lo que encuentra
 *   se suma a las reglas al protegerla.
 */
export interface ModelRequest {
  column: number;
  mode: 'muestra' | 'texto';
  /** Fila de cada texto. */
  rows: number[];
  /** Lo que se le pasa al modelo. */
  texts: string[];
  /** Dónde empieza el valor de la celda dentro del texto (después del encabezado de contexto). */
  offsets: number[];
  /** Celdas de texto libre que quedaron afuera por el límite (se protegen solo con reglas). */
  skipped: number;
}

/** Lo que encontró el modelo en cada celda de texto libre: columna → fila → fragmentos. */
export type CellSpans = Map<number, Map<number, Span[]>>;

const SAMPLE = 40;
const MAX_TEXT_CELLS = 2000;
/** Tipos que el modelo puede reconocer en una columna entera. */
const COLUMN_TYPES = new Set<DetectionType>(['NOMBRE_PERSONA', 'RAZON_SOCIAL', 'DIRECCION', 'DATO_SENSIBLE']);
/** Proporción de la muestra en la que el modelo tiene que reconocer el tipo para clasificar la columna. */
const COLUMN_RATIO = 0.6;

const hasLetters = (s: string) => /\p{L}{2,}/u.test(s);

/** Qué celdas analizar con la IA local. */
export function planTableModel(table: Table, findings: ColumnFinding[]): ModelRequest[] {
  const requests: ModelRequest[] = [];
  for (const f of findings) {
    const values = table.rows.map((r) => cellToString(r[f.index]).trim());
    const nonEmpty = values.filter(Boolean);
    if (nonEmpty.length === 0) continue;

    // Texto libre de verdad (frases), no nombres largos de empresas ("Metalúrgica Santa Lucía").
    const sample = nonEmpty.slice(0, 500);
    const avgWords = sample.reduce((n, v) => n + v.split(/\s+/).length, 0) / sample.length;
    if (f.kind !== 'columna' && avgWords >= 5 && (f.kind === 'texto' || isFreeText(sample))) {
      const rows: number[] = [];
      values.forEach((v, r) => v && rows.length < MAX_TEXT_CELLS && rows.push(r));
      requests.push({ column: f.index, mode: 'texto', rows, texts: rows.map((r) => values[r]!), offsets: rows.map(() => 0), skipped: nonEmpty.length - rows.length });
      continue;
    }

    const doubtful = f.kind === 'columna' && f.confidence === 'baja' && f.type !== null && COLUMN_TYPES.has(f.type);
    // Sin clasificar, o "texto" con valores cortos ("Ferretería Don Tito"): conviene clasificar la columna entera.
    const unclassified = f.kind !== 'columna' && nonEmpty.filter(hasLetters).length >= nonEmpty.length * COLUMN_RATIO;
    if (!doubtful && !unclassified) continue;

    // Muestra de valores distintos, con el encabezado como contexto.
    const rows: number[] = [];
    const seen = new Set<string>();
    values.forEach((v, r) => {
      if (!v || seen.has(v) || rows.length >= SAMPLE) return;
      seen.add(v);
      rows.push(r);
    });
    const prefix = f.header.trim() ? `${f.header.trim()}: ` : '';
    requests.push({ column: f.index, mode: 'muestra', rows, texts: rows.map((r) => prefix + values[r]!), offsets: rows.map(() => prefix.length), skipped: 0 });
  }
  return requests;
}

/**
 * Aplica lo que encontró el modelo. `results` trae, para cada pedido, los fragmentos de cada texto
 * (en el mismo orden que `texts`). Devuelve los hallazgos actualizados y los fragmentos por celda
 * para proteger las columnas de texto libre.
 */
export function applyTableModel(
  table: Table,
  findings: ColumnFinding[],
  requests: ModelRequest[],
  results: Span[][][],
): { findings: ColumnFinding[]; cellSpans: CellSpans } {
  const out = findings.map((f) => ({ ...f }));
  const cellSpans: CellSpans = new Map();

  requests.forEach((req, k) => {
    const found = results[k] ?? [];
    const f = out.find((x) => x.index === req.column);
    if (!f) return;

    if (req.mode === 'texto') {
      if (req.skipped > 0) f.aiSkipped = req.skipped;
      const byRow = new Map<number, Span[]>();
      const all: Span[] = [];
      req.rows.forEach((row, i) => {
        const cell = req.texts[i]!;
        const model = found[i] ?? [];
        if (model.length > 0) byRow.set(row, model);
        all.push(...combineModelSpans(scanText(cell), model, cell));
      });
      if (byRow.size === 0) return;
      cellSpans.set(req.column, byRow);
      const textCounts = countByType(all);
      const kinds = Object.keys(textCounts).map((t) => DETECTION_LABELS[t as DetectionType]);
      Object.assign(f, {
        kind: 'texto',
        type: null,
        confidence: 'media',
        detectionCount: all.length,
        textCounts,
        examples: all.slice(0, 3).map((s) => maskForDisplay(s.value)),
        // Seudonimizar: la respuesta de la IA se puede traducir después con la tabla de equivalencias.
        suggestedAction: 'seudonimizar',
        reason: `Texto libre con ${all.length} dato(s) sensible(s) adentro (reglas e IA local): ${kinds.join(', ')}`,
        aiAssisted: true,
      } satisfies Partial<ColumnFinding>);
      return;
    }

    // Muestra: un valor cuenta para un tipo si el modelo lo cubre casi entero (70% o más).
    const votes = new Map<DetectionType, number>();
    req.texts.forEach((text, i) => {
      const value = text.slice(req.offsets[i]).trim();
      const offset = req.offsets[i]!;
      const covered = new Map<DetectionType, number>();
      for (const s of found[i] ?? []) {
        if (s.start < offset || !COLUMN_TYPES.has(s.type)) continue;
        covered.set(s.type, (covered.get(s.type) ?? 0) + (s.end - s.start));
      }
      for (const [type, chars] of covered) if (chars >= value.length * 0.7) votes.set(type, (votes.get(type) ?? 0) + 1);
    });
    const [best, n] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const ratio = req.texts.length ? n / req.texts.length : 0;
    if (!best || ratio < COLUMN_RATIO) return;

    const pct = Math.round(ratio * 100);
    if (f.kind === 'columna') {
      // Las reglas dudaban: si la IA confirma el mismo tipo, sube la confianza; si dice otro, se respeta la IA.
      Object.assign(f, {
        type: best,
        confidence: 'media',
        matchRatio: ratio,
        suggestedAction: DEFAULT_ACTIONS[best],
        reason: `${f.reason}. La IA local lo confirma: reconoce ${DETECTION_LABELS[best]} en el ${pct}% de los valores`,
        aiAssisted: true,
      } satisfies Partial<ColumnFinding>);
      return;
    }
    const nonEmpty = table.rows.map((r) => cellToString(r[f.index]).trim()).filter(Boolean);
    Object.assign(f, {
      kind: 'columna',
      type: best,
      confidence: 'media',
      matchRatio: ratio,
      detectionCount: nonEmpty.length,
      examples: nonEmpty.slice(0, 3).map(maskForDisplay),
      suggestedAction: DEFAULT_ACTIONS[best],
      reason: `La IA local reconoce ${DETECTION_LABELS[best]} en el ${pct}% de los valores`,
      aiAssisted: true,
    } satisfies Partial<ColumnFinding>);
  });

  return { findings: out, cellSpans };
}
