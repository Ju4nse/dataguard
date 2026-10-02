import type { DetectionType } from '@securedata/shared';
import type { Span } from './types';

/** Término que el usuario pide ocultar a mano (ej. un nombre que la detección automática no ve). */
export interface CustomTerm {
  value: string;
  type: DetectionType;
}

const DIACRITICS = /[̀-ͯ]/g;

/**
 * Versión sin tildes y en minúsculas, carácter por carácter, junto con el índice
 * original de cada carácter: así una coincidencia se puede ubicar en el texto real.
 */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = text[i]!.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
    for (const ch of f) {
      folded += ch;
      map.push(i);
    }
  }
  return { folded, map };
}

export const fold = (s: string) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
const isLetterOrDigit = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/** Busca todas las apariciones (sin distinguir mayúsculas ni tildes, y como palabra completa). */
export function findTerms(text: string, terms: CustomTerm[]): Span[] {
  if (!text || terms.length === 0) return [];
  const { folded, map } = foldWithMap(text);
  const spans: Span[] = [];
  for (const term of terms) {
    const needle = fold(term.value.trim());
    if (needle.length < 2) continue;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(needle, from);
      if (at === -1) break;
      from = at + needle.length;
      if (isLetterOrDigit(folded[at - 1]) || isLetterOrDigit(folded[at + needle.length])) continue;
      const start = map[at]!;
      const end = map[at + needle.length - 1]! + 1;
      spans.push({ type: term.type, start, end, value: text.slice(start, end), confidence: 'alta' });
    }
  }
  return spans;
}

/** Une fragmentos dando prioridad a los primeros (los términos manuales ganan sobre la detección automática). */
export function mergeSpans(priority: Span[], rest: Span[]): Span[] {
  const accepted: Span[] = [];
  for (const s of [...priority, ...rest]) {
    if (!accepted.some((a) => s.start < a.end && a.start < s.end)) accepted.push(s);
  }
  return accepted.sort((a, b) => a.start - b.start);
}
