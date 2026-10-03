import { ANONYMIZED_TOKENS } from './transform';
import type { EquivalenceRow } from './types';
import { fold } from './terms';

/** Un tramo de la respuesta traducida: texto tal cual o un seudónimo reemplazado por el dato real. */
export interface RestoredPart {
  text: string;
  /** Si es un reemplazo: el seudónimo que había en la respuesta. */
  seudonimo?: string;
}

export interface RestoreResult {
  /** La respuesta con los datos reales. */
  text: string;
  /** La misma respuesta en tramos, para resaltar los reemplazos. */
  parts: RestoredPart[];
  /** Seudónimos reemplazados y cuántas veces aparecieron. */
  replaced: { seudonimo: string; original: string; count: number }[];
  /** Parecen seudónimos (prefijo conocido) pero no están en la tabla: la IA pudo haberlos inventado. */
  unknown: string[];
  /** Marcadores de datos anonimizados ([DNI], ***@gmail.com…): no se pueden recuperar. */
  irreversible: string[];
}

/** Clave de un grupo: sin mayúsculas ni tildes, con espacios y guiones bajos equivalentes. */
const groupKey = (g: string) => fold(g.replace(/[ _]+/g, ' ').trim());

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const IRREVERSIBLE = new RegExp(
  [...new Set(Object.values(ANONYMIZED_TOKENS))].map(escapeRegex).join('|') + String.raw`|\*\*\*@[\w.-]+\.\w+|\*{4} \d{4}`,
  'g',
);

/**
 * Traduce la respuesta de una IA externa: reemplaza cada seudónimo (Persona_03, Empresa_07…) por el
 * dato real de la tabla de equivalencias. Tolera cómo suelen reescribirlos las IA: "Persona 3",
 * "persona_03", "PERSONA-03", "**Persona_03**". Todo ocurre en el navegador.
 */
export function restorePseudonyms(text: string, equivalences: EquivalenceRow[]): RestoreResult {
  // grupo (sin mayúsculas ni tildes) → número → fila.
  const byGroup = new Map<string, Map<number, EquivalenceRow>>();
  const groupNames = new Set<string>();
  for (const row of equivalences) {
    const m = row.seudonimo.match(/^(.*?)[ _-]?(\d+)$/u);
    if (!m) continue;
    const group = m[1]!;
    groupNames.add(group);
    let numbers = byGroup.get(groupKey(group));
    if (!numbers) byGroup.set(groupKey(group), (numbers = new Map()));
    numbers.set(Number(m[2]), row);
  }

  const irreversible = [...new Set(text.match(IRREVERSIBLE) ?? [])];
  if (groupNames.size === 0) return { text, parts: [{ text }], replaced: [], unknown: [], irreversible };

  // Prefijos más largos primero ("Persona Juridica" antes que "Persona"); espacios y guiones bajos intercambiables.
  const prefixes = [...groupNames].sort((a, b) => b.length - a.length).map((g) => escapeRegex(g).replace(/[ _]+/g, '[ _]+'));
  // El número no puede seguir con ".456" o ",5": "DNI 32.456.789" es un número, no DNI_32.
  const pattern = new RegExp(String.raw`(?<![\p{L}\p{N}_])(${prefixes.join('|')})([ _-]?)0*(\d{1,6})(?![\p{L}\p{N}]|[.,]\d)`, 'giu');

  const parts: RestoredPart[] = [];
  const counts = new Map<string, { seudonimo: string; original: string; count: number }>();
  const unknown = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    // Con espacio ("Persona 3") se exige mayúscula inicial: "una persona 2 veces" es texto común.
    if (m[2] === ' ' && !/^\p{Lu}/u.test(m[1]!)) continue;
    const row = byGroup.get(groupKey(m[1]!))?.get(Number(m[3]));
    if (!row) {
      unknown.add(m[0]);
      continue;
    }
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: row.original, seudonimo: row.seudonimo });
    const c = counts.get(row.seudonimo) ?? { seudonimo: row.seudonimo, original: row.original, count: 0 };
    c.count++;
    counts.set(row.seudonimo, c);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });

  return {
    text: parts.map((p) => p.text).join(''),
    parts,
    replaced: [...counts.values()],
    unknown: [...unknown],
    irreversible,
  };
}
