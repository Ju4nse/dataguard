import type { DetectionType } from '@securedata/shared';
import { promoteBusinessNames } from './patterns/business';
import { findLoneFirstNames, findNames } from './patterns/names';
import { findSensitive } from './patterns/sensitive';
import { NAME_PRIORITY, SENSITIVE_PRIORITY, TEXT_PATTERNS } from './patterns/text';
import type { Span } from './types';

const CONTEXT_WINDOW = 40;

/** Datos que identifican a una persona: con uno de estos en el renglón, el renglón es la ficha de alguien. */
// prettier-ignore
const IDENTIFIERS = new Set<DetectionType>(['EMAIL', 'DNI', 'CUIT_CUIL', 'TELEFONO', 'CBU_CVU', 'PASAPORTE', 'TARJETA']);
/** Antes de un monto: es de un negocio (factura, venta, precio), no de la persona. */
const BUSINESS_AMOUNT =
  /\b(?:factura\p{L}*|fact|total|venta\p{L}*|vend\p{L}*|precio|costo|cuesta|presupuesto|cotizaci[oó]n|compra|pedido|ticket|remito|stock|unidades|ganancia|facturaci[oó]n)\b/iu;
/** Montos con moneda: "$ 300000", "300.000 pesos", "USD 1.200". */
const MONEY =
  /(?:\$|u\$s|usd|ars)\s?(?:\d{1,3}(?:\.\d{3})+|\d{3,})(?:,\d{1,2})?|(?<![\d.])(?:\d{1,3}(?:\.\d{3})+|\d{3,})(?:,\d{1,2})?\s?(?:\$|pesos\b|ars\b|usd\b|d[oó]lares\b)/gi;

interface Candidate extends Span {
  priority: number;
}

/**
 * Busca datos sensibles dentro de un texto libre (una celda, un prompt, un documento).
 * Devuelve fragmentos sin superposición, ordenados por posición.
 */
export function scanText(text: string): Span[] {
  if (!text) return [];
  const candidates: Candidate[] = [];

  for (const p of TEXT_PATTERNS) {
    p.regex.lastIndex = 0;
    for (const m of text.matchAll(p.regex)) {
      const trimmed = m[0].trim();
      const value = p.refine ? p.refine(trimmed) : trimmed;
      if (!value) continue;
      // refine devuelve una parte de la coincidencia: se ubica dentro de ella.
      const realStart = m.index + m[0].indexOf(trimmed) + trimmed.indexOf(value);
      const before = text.slice(Math.max(0, realStart - CONTEXT_WINDOW), realStart);
      if (!p.validate(value, before)) continue;
      candidates.push({
        type: p.type,
        start: realStart,
        end: realStart + value.length,
        value,
        confidence: p.confidence?.(value, before) ?? 'alta',
        priority: p.priority,
      });
    }
  }
  for (const s of promoteBusinessNames(text, findNames(text))) candidates.push({ ...s, priority: NAME_PRIORITY });
  for (const s of findSensitive(text)) candidates.push({ ...s, priority: SENSITIVE_PRIORITY });
  // Un nombre de pila solo ("Lucía") también es una persona, salvo los que son lugares o palabras comunes (ver abajo).
  const loneNames = findLoneFirstNames(text);
  for (const n of loneNames) if (!n.ambiguous) candidates.push({ ...n.span, priority: SENSITIVE_PRIORITY - 1 });

  // Ante superposición gana la prioridad más alta; a igual prioridad, el fragmento más largo.
  candidates.sort((a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start));
  const accepted: Candidate[] = [];
  for (const c of candidates) {
    if (!accepted.some((a) => c.start < a.end && a.start < c.end)) accepted.push(c);
  }

  addPersonalRecordData(text, accepted, loneNames);
  return accepted.sort((a, b) => a.start - b.start).map(({ priority: _p, ...span }) => span);
}

/**
 * Renglones que son la ficha de una persona ("Milagros, $ 300000, 47060233, milik@gmail.com"): ahí un
 * monto es dato personal (sueldo, deuda, ingreso) aunque no diga "sueldo", y un nombre ambiguo
 * (Milagros, Rosario) que es un campo de la lista es un nombre. Confianza baja: para revisar.
 */
function addPersonalRecordData(text: string, accepted: Candidate[], loneNames: ReturnType<typeof findLoneFirstNames>) {
  const add = (c: Candidate) => {
    if (!accepted.some((a) => c.start < a.end && a.start < c.end)) accepted.push(c);
  };
  let lineStart = 0;
  for (const line of text.split('\n')) {
    const lineEnd = lineStart + line.length;
    const inLine = () => accepted.filter((a) => a.start >= lineStart && a.end <= lineEnd);
    if (inLine().some((a) => IDENTIFIERS.has(a.type))) {
      for (const n of loneNames) if (n.ambiguous && n.field && n.span.start >= lineStart && n.span.end <= lineEnd) add({ ...n.span, priority: 0 });
    }
    // Con una empresa en el renglón, los montos son de la empresa.
    const people = inLine();
    if (people.some((a) => IDENTIFIERS.has(a.type) || a.type === 'NOMBRE_PERSONA') && !people.some((a) => a.type === 'RAZON_SOCIAL')) {
      MONEY.lastIndex = 0;
      for (const m of line.matchAll(MONEY)) {
        if (BUSINESS_AMOUNT.test(line.slice(Math.max(0, m.index - 35), m.index))) continue;
        const start = lineStart + m.index;
        add({ type: 'SALARIO', start, end: start + m[0].length, value: m[0], confidence: 'baja', priority: 0 });
      }
    }
    lineStart = lineEnd + 1;
  }
}

export function countByType(spans: Span[]): Partial<Record<DetectionType, number>> {
  const counts: Partial<Record<DetectionType, number>> = {};
  for (const s of spans) counts[s.type] = (counts[s.type] ?? 0) + 1;
  return counts;
}

/** Reemplaza cada fragmento con lo que devuelva `replacer`, en orden de lectura (así Empresa_01 es la primera que aparece). */
export function replaceSpans(text: string, spans: Span[], replacer: (span: Span) => string): string {
  let out = '';
  let pos = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    out += text.slice(pos, s.start) + replacer(s);
    pos = s.end;
  }
  return out + text.slice(pos);
}
