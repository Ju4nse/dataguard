import {
  analyzeDocument,
  documentActionFor,
  transformDocument,
  type CustomTerm,
  type PseudonymRegistry,
  type Span,
  type TypeDecision,
  type TypeSummary,
} from '@securedata/detector';
import { PSEUDONYM_PREFIXES, type Action, type DetectionType } from '@securedata/shared';
import type { Decision, Detection } from './messages';

export type Policy = Partial<Record<DetectionType, Action>>;

/** Lo que se encontró en un prompt antes de enviarlo. */
export interface PromptAnalysis {
  text: string;
  spans: Span[][];
  /** Tipos a proteger, de más a menos frecuente (sin los que la política deja pasar). */
  summary: TypeSummary[];
  decisions: Partial<Record<DetectionType, TypeDecision>>;
  /** La política de la empresa exige proteger alguno de estos tipos: no se ofrece "enviar sin proteger". */
  enforced: boolean;
}

/** Tipos que se "aprenden": un nombre ya ocultado en la pestaña se oculta también en los prompts siguientes. */
// prettier-ignore
const LEARNED_TYPES: DetectionType[] = ['NOMBRE_PERSONA', 'RAZON_SOCIAL', 'DIRECCION'];
const LEARNED_BY_PREFIX = new Map(LEARNED_TYPES.map((t) => [PSEUDONYM_PREFIXES[t], t]));

function learnedTerms(registry: PseudonymRegistry): CustomTerm[] {
  const terms: CustomTerm[] = [];
  for (const row of registry.entries()) {
    const type = LEARNED_BY_PREFIX.get(row.grupo);
    if (type && row.original.length >= 3) terms.push({ value: row.original, type });
  }
  return terms;
}

/**
 * Analiza un prompt. Devuelve null si no hay nada que proteger. No modifica el registro de seudónimos.
 * @param modelSpans lo que encontró la IA local en el texto (si está activa); se combina con las reglas.
 */
export function analyzePrompt(text: string, policy: Policy, registry: PseudonymRegistry, modelSpans: Span[] = []): PromptAnalysis | null {
  if (!text.trim()) return null;
  const analysis = analyzeDocument([{ text }], learnedTerms(registry), [], [modelSpans]);
  const decisions: Partial<Record<DetectionType, TypeDecision>> = {};
  for (const { type } of analysis.summary) decisions[type] = { action: documentActionFor(type, policy), prefix: PSEUDONYM_PREFIXES[type] };
  const summary = analysis.summary.filter((s) => decisions[s.type]!.action !== 'mantener');
  if (summary.length === 0) return null;
  return { text, spans: analysis.spans, summary, decisions, enforced: summary.some((s) => policy[s.type] !== undefined) };
}

/** Texto con los datos reemplazados. Los seudónimos se guardan en el registro: "Persona_01" es la misma en toda la pestaña. */
export function protectPrompt(a: PromptAnalysis, registry: PseudonymRegistry): string {
  return transformDocument([{ text: a.text }], a.spans, a.decisions, registry).texts[0]!;
}

/** Metadatos para el panel: tipos, cantidades y qué se hizo. Nunca el texto. */
export function toDetections(a: PromptAnalysis, decision: Decision): Detection[] {
  return a.summary.map((s) => ({
    tipo: s.type,
    accion: decision === 'enmascarado' ? a.decisions[s.type]!.action : 'mantener',
    cantidad: s.count,
  }));
}
