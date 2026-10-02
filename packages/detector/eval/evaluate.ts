import { classifyColumn, scanText } from '../src';
import { TABLE_CASES, TEXT_CASES, VALIDATION_CASES } from './corpus';

export interface GoldSpan {
  type: string;
  start: number;
  end: number;
  value: string;
}

/** Convierte "Hola [[EMAIL|a@b.com]]" en el texto limpio y la lista de fragmentos esperados. */
export function parseAnnotated(annotated: string): { text: string; gold: GoldSpan[] } {
  const gold: GoldSpan[] = [];
  let text = '';
  let pos = 0;
  for (const m of annotated.matchAll(/\[\[([A-Z_]+)\|(.+?)\]\]/g)) {
    text += annotated.slice(pos, m.index);
    gold.push({ type: m[1]!, start: text.length, end: text.length + m[2]!.length, value: m[2]! });
    text += m[2];
    pos = m.index + m[0].length;
  }
  return { text: text + annotated.slice(pos), gold };
}

export interface TypeMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface Mistake {
  caseId: string;
  kind: 'FP' | 'FN';
  type: string;
  value: string;
}

export interface EvalReport {
  byType: Record<string, TypeMetrics>;
  overall: TypeMetrics;
  mistakes: Mistake[];
  table: { correct: number; total: number; mistakes: { id: string; expected: string | null; got: string | null }[] };
}

function metrics(tp: number, fp: number, fn: number): TypeMetrics {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

/** Coincide si es del mismo tipo y cubre al menos la mitad del fragmento esperado (y viceversa). */
function matches(pred: { type: string; start: number; end: number }, gold: GoldSpan): boolean {
  if (pred.type !== gold.type) return false;
  const overlap = Math.min(pred.end, gold.end) - Math.max(pred.start, gold.start);
  return overlap >= (gold.end - gold.start) / 2 && overlap >= (pred.end - pred.start) / 2;
}

/** @param set 'desarrollo' (casos usados para ajustar las reglas) o 'validacion' (casos nuevos). */
export function evaluate(set: 'desarrollo' | 'validacion' = 'desarrollo'): EvalReport {
  const counts: Record<string, { tp: number; fp: number; fn: number }> = {};
  const bump = (type: string, key: 'tp' | 'fp' | 'fn') => {
    counts[type] ??= { tp: 0, fp: 0, fn: 0 };
    counts[type][key]++;
  };
  const mistakes: Mistake[] = [];

  for (const c of set === 'desarrollo' ? TEXT_CASES : VALIDATION_CASES) {
    const { text, gold } = parseAnnotated(c.text);
    const preds = scanText(text);
    const used = new Set<number>();
    for (const g of gold) {
      const i = preds.findIndex((p, idx) => !used.has(idx) && matches(p, g));
      if (i >= 0) {
        used.add(i);
        bump(g.type, 'tp');
      } else {
        bump(g.type, 'fn');
        mistakes.push({ caseId: c.id, kind: 'FN', type: g.type, value: g.value });
      }
    }
    preds.forEach((p, idx) => {
      if (used.has(idx)) return;
      bump(p.type, 'fp');
      mistakes.push({ caseId: c.id, kind: 'FP', type: p.type, value: p.value });
    });
  }

  const byType = Object.fromEntries(Object.entries(counts).map(([t, c]) => [t, metrics(c.tp, c.fp, c.fn)]));
  const total = Object.values(counts).reduce((a, c) => ({ tp: a.tp + c.tp, fp: a.fp + c.fp, fn: a.fn + c.fn }), { tp: 0, fp: 0, fn: 0 });

  const tableMistakes: EvalReport['table']['mistakes'] = [];
  for (const c of TABLE_CASES) {
    const f = classifyColumn(0, c.header, c.values);
    // Una detección de confianza baja no cambia la acción por defecto (queda en "mantener"): cuenta como no sensible.
    const got = f.kind === 'texto' ? 'texto' : f.kind === 'columna' && f.confidence !== 'baja' ? f.type : null;
    if (got !== c.expected) tableMistakes.push({ id: c.id, expected: c.expected, got });
  }

  return {
    byType,
    overall: metrics(total.tp, total.fp, total.fn),
    mistakes,
    table: { correct: TABLE_CASES.length - tableMistakes.length, total: TABLE_CASES.length, mistakes: tableMistakes },
  };
}
