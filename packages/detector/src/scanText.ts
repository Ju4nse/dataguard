import type { DetectionType } from '@securedata/shared';
import { findNames } from './patterns/names';
import { findSensitive } from './patterns/sensitive';
import { NAME_PRIORITY, SENSITIVE_PRIORITY, TEXT_PATTERNS } from './patterns/text';
import type { Span } from './types';

const CONTEXT_WINDOW = 40;

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
  for (const s of findNames(text)) candidates.push({ ...s, priority: NAME_PRIORITY });
  for (const s of findSensitive(text)) candidates.push({ ...s, priority: SENSITIVE_PRIORITY });

  // Ante superposición gana la prioridad más alta; a igual prioridad, el fragmento más largo.
  candidates.sort((a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start));
  const accepted: Candidate[] = [];
  for (const c of candidates) {
    if (!accepted.some((a) => c.start < a.end && a.start < c.end)) accepted.push(c);
  }

  return accepted.sort((a, b) => a.start - b.start).map(({ priority: _p, ...span }) => span);
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
