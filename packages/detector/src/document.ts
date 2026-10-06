import type { Action, DetectionType } from '@securedata/shared';
import { PSEUDONYM_PREFIXES } from '@securedata/shared';
import { combineModelSpans } from './combine';
import { headerHint } from './patterns/headers';
import { looksLikeCompany, looksLikePersonName, VALUE_MATCHERS } from './patterns/values';
import { replaceSpans, scanText } from './scanText';
import { findTerms, fold, mergeSpans, type CustomTerm } from './terms';
import { anonymizeValue, PseudonymRegistry } from './transform';
import type { EquivalenceRow, Span } from './types';
import { maskForDisplay } from './util';

/**
 * Un documento es una lista de fragmentos de texto. Un PDF o un TXT es un solo fragmento;
 * un JSON tiene un fragmento por valor, con el nombre de su clave como pista ("email", "dni").
 */
export interface Segment {
  text: string;
  /** Nombre de la clave en un JSON ("email", "dni"). */
  hint?: string;
  /** Clave padre, para refinar la pista: "producto" + "nombre" no es una persona. */
  context?: string;
}

export interface TypeSummary {
  type: DetectionType;
  count: number;
  distinct: number;
  /** Apariciones con confianza baja: conviene revisarlas en la vista previa. */
  review: number;
  /** Apariciones que encontró la IA local (el resto, las reglas). */
  ai: number;
  examples: string[];
}

export interface DocumentAnalysis {
  /** Fragmentos sensibles de cada segmento (mismo orden que los segmentos). */
  spans: Span[][];
  summary: TypeSummary[];
}

export interface TypeDecision {
  action: Exclude<Action, 'eliminar'>;
  prefix?: string;
}

export interface DocumentTransformResult {
  texts: string[];
  equivalences: EquivalenceRow[];
  transformedCounts: Partial<Record<DetectionType, number>>;
}

/** Con estas claves, el valor completo es del tipo aunque no tenga un formato reconocible. */
// prettier-ignore
const HEADER_ONLY = new Set<DetectionType>([
  'NOMBRE_PERSONA', 'RAZON_SOCIAL', 'DIRECCION', 'FECHA_NACIMIENTO', 'EDAD', 'SALARIO', 'DATO_SENSIBLE', 'CREDENCIAL',
]);
/** …salvo que el valor sea solo un número (ej. "cliente": 1001 es un código, no un nombre). */
// prettier-ignore
const NOT_NUMERIC = new Set<DetectionType>(['NOMBRE_PERSONA', 'RAZON_SOCIAL', 'DIRECCION', 'DATO_SENSIBLE']);

/** Si la clave del JSON anuncia el tipo y el valor lo confirma, el valor completo es sensible. */
function wholeValueType(seg: Segment): DetectionType | null {
  if (!seg.hint || !headerHint(seg.hint)) return null;
  const t = headerHint(seg.context ? `${seg.context} ${seg.hint}` : seg.hint);
  const value = seg.text.trim();
  if (!t || !value) return null;
  if (HEADER_ONLY.has(t)) {
    if (/^[\d\s.,-]+$/.test(value) && NOT_NUMERIC.has(t)) return null;
    if (t === 'NOMBRE_PERSONA' || t === 'RAZON_SOCIAL') {
      if (looksLikeCompany(value)) return 'RAZON_SOCIAL';
      if (looksLikePersonName(value)) return 'NOMBRE_PERSONA';
    }
    return t;
  }
  const matcher = VALUE_MATCHERS.find((m) => m.type === t);
  return matcher?.test(value) ? t : null;
}

/** Tipos sin formato fijo: si se reconocen por la clave, se buscan también en el resto del documento. */
// prettier-ignore
const PROPAGATED = new Set<DetectionType>(['NOMBRE_PERSONA', 'RAZON_SOCIAL', 'DIRECCION']);

/**
 * @param customTerms términos que el usuario pidió ocultar.
 * @param ignoredValues valores que el usuario marcó como "no ocultar" (falsos positivos); se comparan sin mayúsculas ni tildes.
 * @param modelSpans lo que encontró el modelo de IA local en cada segmento (opcional).
 */
export function analyzeDocument(
  segments: Segment[],
  customTerms: CustomTerm[] = [],
  ignoredValues: string[] = [],
  modelSpans: Span[][] = [],
): DocumentAnalysis {
  const wholeTypes = segments.map(wholeValueType);
  const ignored = new Set(ignoredValues.map(fold));

  // Un nombre encontrado en "contacto.nombre" también se oculta si aparece en "notas".
  const learned: CustomTerm[] = [];
  segments.forEach((seg, i) => {
    const t = wholeTypes[i];
    if (t && PROPAGATED.has(t) && !learned.some((l) => l.value === seg.text.trim())) learned.push({ value: seg.text.trim(), type: t });
  });
  const terms = [...customTerms, ...learned];

  const spans = segments.map((seg, i) => {
    const whole = wholeTypes[i];
    let found: Span[];
    if (whole) {
      const start = seg.text.length - seg.text.trimStart().length;
      const value = seg.text.trim();
      found = mergeSpans(findTerms(seg.text, customTerms), [{ type: whole, start, end: start + value.length, value, confidence: 'alta' }]);
    } else {
      found = mergeSpans(findTerms(seg.text, terms), combineModelSpans(scanText(seg.text), modelSpans[i] ?? [], seg.text));
    }
    return found.map((s) => (ignored.has(fold(s.value)) ? { ...s, ignored: true } : s));
  });

  const byType = new Map<DetectionType, { count: number; review: number; ai: number; values: Set<string>; examples: string[] }>();
  for (const s of spans.flat()) {
    if (s.ignored) continue;
    let entry = byType.get(s.type);
    if (!entry) {
      entry = { count: 0, review: 0, ai: 0, values: new Set(), examples: [] };
      byType.set(s.type, entry);
    }
    entry.count++;
    if (s.confidence === 'baja') entry.review++;
    if (s.source === 'ia') entry.ai++;
    if (!entry.values.has(s.value) && entry.examples.length < 3) entry.examples.push(maskForDisplay(s.value));
    entry.values.add(s.value);
  }

  const summary = [...byType.entries()]
    .map(([type, e]) => ({ type, count: e.count, distinct: e.values.size, review: e.review, ai: e.ai, examples: e.examples }))
    .sort((a, b) => b.count - a.count);

  return { spans, summary };
}

/**
 * @param registry seudónimos ya asignados (en el chat, para que "Persona_01" sea la misma persona en
 *   todos los mensajes de la conversación). Por defecto, uno nuevo por documento.
 */
export function transformDocument(
  segments: Segment[],
  spans: Span[][],
  decisions: Partial<Record<DetectionType, TypeDecision>>,
  registry: PseudonymRegistry = new PseudonymRegistry(),
): DocumentTransformResult {
  const counts: Partial<Record<DetectionType, number>> = {};

  const texts = segments.map((seg, i) => {
    const active = (spans[i] ?? []).filter((s) => {
      const d = decisions[s.type];
      return !s.ignored && d && d.action !== 'mantener';
    });
    if (active.length === 0) return seg.text;
    for (const s of active) counts[s.type] = (counts[s.type] ?? 0) + 1;
    return replaceSpans(seg.text, active, (s) => {
      const d = decisions[s.type]!;
      if (d.action === 'anonimizar') return anonymizeValue(s.type, s.value);
      return registry.get(d.prefix?.trim() || PSEUDONYM_PREFIXES[s.type], s.type, s.value);
    });
  });

  return { texts, equivalences: registry.entries(), transformedCounts: counts };
}

/**
 * Acción para un tipo en un documento o prompt: la política de la empresa manda sobre la sugerida.
 * "Eliminar" (columna) no existe fuera de las planillas: equivale a anonimizar.
 */
export function documentActionFor(type: DetectionType, policy: Partial<Record<DetectionType, Action>>): TypeDecision['action'] {
  const p = policy[type];
  if (!p) return DEFAULT_DOCUMENT_ACTIONS[type];
  return p === 'eliminar' ? 'anonimizar' : p;
}

/** Acción sugerida por tipo en documentos (no existe "eliminar columna"). */
export const DEFAULT_DOCUMENT_ACTIONS: Record<DetectionType, TypeDecision['action']> = {
  EMAIL: 'anonimizar',
  TELEFONO: 'anonimizar',
  DNI: 'seudonimizar',
  CUIT_CUIL: 'seudonimizar',
  CBU_CVU: 'anonimizar',
  TARJETA: 'anonimizar',
  PATENTE: 'seudonimizar',
  NOMBRE_PERSONA: 'seudonimizar',
  RAZON_SOCIAL: 'seudonimizar',
  DIRECCION: 'anonimizar',
  FECHA_NACIMIENTO: 'anonimizar',
  EDAD: 'anonimizar',
  PASAPORTE: 'anonimizar',
  SALARIO: 'anonimizar',
  DATO_SENSIBLE: 'anonimizar',
  CREDENCIAL: 'anonimizar',
  IP: 'anonimizar',
};
