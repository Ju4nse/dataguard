import type { DetectionType } from '@securedata/shared';
import { PSEUDONYM_PREFIXES } from '@securedata/shared';
import { combineModelSpans } from './combine';
import { replaceSpans, scanText } from './scanText';
import { findTerms, fold, mergeSpans, type CustomTerm } from './terms';
import type { CellValue, ColumnDecision, EquivalenceRow, Span, Table, TransformResult } from './types';
import { cellToString, normalizeText, onlyDigits } from './util';

const DIGIT_TYPES = new Set<DetectionType>(['DNI', 'CUIT_CUIL', 'CBU_CVU', 'TARJETA', 'TELEFONO']);

/** Tipos sin formato fijo: lo encontrado en su columna se busca también en el texto libre. */
const PROPAGATED = new Set<DetectionType>(['NOMBRE_PERSONA', 'RAZON_SOCIAL', 'DIRECCION']);
const MAX_LEARNED = 5000;

/** Marcadores de la anonimización (irreversibles: no hay forma de volver al dato). */
export const ANONYMIZED_TOKENS: Record<DetectionType, string> = {
  EMAIL: '[EMAIL]',
  TELEFONO: '[TEL]',
  DNI: '[DNI]',
  CUIT_CUIL: '[CUIT]',
  CBU_CVU: '[CBU]',
  TARJETA: '[TARJETA]',
  PATENTE: '[PATENTE]',
  NOMBRE_PERSONA: '[NOMBRE]',
  RAZON_SOCIAL: '[EMPRESA]',
  DIRECCION: '[DIRECCION]',
  FECHA_NACIMIENTO: '[FECHA]',
  EDAD: '[EDAD]',
  PASAPORTE: '[PASAPORTE]',
  SALARIO: '[SALARIO]',
  DATO_SENSIBLE: '[DATO SENSIBLE]',
  CREDENCIAL: '[CREDENCIAL]',
  IP: '[IP]',
};

/** Clave para reconocer el mismo valor escrito distinto: "PEREZ S.A." = "Pérez SA", "20-1234…" = "201234…". */
function equivalenceKey(type: DetectionType | null, raw: string): string {
  const digits = onlyDigits(raw);
  // Un alias de CBU ("perro.casa.sol") no tiene dígitos: se compara como texto.
  if (type && DIGIT_TYPES.has(type) && digits.length >= 6) return digits;
  if (type === 'PATENTE' || type === 'PASAPORTE') return raw.replace(/[\s-]/g, '').toUpperCase();
  return normalizeText(raw);
}

/** "1.850.000,50" / "$ 850000" / 850000 → número (formato argentino: punto de miles, coma decimal). */
function parseAmount(v: CellValue): number | null {
  if (typeof v === 'number') return v;
  const s = cellToString(v).replace(/[^\d.,]/g, '');
  if (!s) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\.(?=\d{3}(\D|$))/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** 853.200 → "$ 800.000 – 900.000": conserva el orden de magnitud para analizar sin revelar el monto. */
function salaryRange(v: CellValue): string {
  const n = parseAmount(v);
  if (n === null || n <= 0) return ANONYMIZED_TOKENS.SALARIO;
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - (n >= 1_000_000 ? 1 : 0));
  const low = Math.floor(n / magnitude) * magnitude;
  const fmt = (x: number) => x.toLocaleString('es-AR');
  return `$ ${fmt(low)} – ${fmt(low + magnitude)}`;
}

/** 45 → "40-49": la edad exacta identifica, la década alcanza para analizar. */
function ageRange(v: CellValue): string {
  const n = Number(onlyDigits(cellToString(v)));
  if (!n || n >= 120) return ANONYMIZED_TOKENS.EDAD;
  const low = Math.floor(n / 10) * 10;
  const suffix = /años/.test(cellToString(v)) ? ' años' : '';
  return `${low}-${low + 9}${suffix}`;
}

/**
 * Asigna seudónimos consistentes dentro de un archivo: el mismo valor recibe
 * siempre el mismo identificador (Empresa_07), aunque aparezca en otra columna.
 */
export class PseudonymRegistry {
  private groups = new Map<string, Map<string, EquivalenceRow>>();

  get(prefix: string, type: DetectionType | null, raw: string): string {
    let group = this.groups.get(prefix);
    if (!group) {
      group = new Map();
      this.groups.set(prefix, group);
    }
    const key = equivalenceKey(type, raw);
    let row = group.get(key);
    if (!row) {
      row = { seudonimo: `${prefix}_${String(group.size + 1).padStart(2, '0')}`, original: raw, grupo: prefix };
      group.set(key, row);
    }
    return row.seudonimo;
  }

  entries(): EquivalenceRow[] {
    return [...this.groups.values()].flatMap((g) => [...g.values()]);
  }
}

function birthYear(v: CellValue): string {
  if (v instanceof Date && !isNaN(v.getTime())) return String(v.getFullYear());
  if (typeof v === 'number' && v > 0 && v < 80000) {
    // Número de serie de fecha de Excel.
    return String(new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).getUTCFullYear());
  }
  const m = cellToString(v).match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : ANONYMIZED_TOKENS.FECHA_NACIMIENTO;
}

/** Reemplazo irreversible que conserva lo mínimo útil para analizar. */
export function anonymizeValue(type: DetectionType, v: CellValue): string {
  const s = cellToString(v);
  switch (type) {
    case 'EMAIL': {
      const at = s.indexOf('@');
      return at > 0 ? `***${s.slice(at)}` : ANONYMIZED_TOKENS.EMAIL;
    }
    case 'TARJETA': {
      const d = onlyDigits(s);
      return d.length >= 4 ? `**** ${d.slice(-4)}` : ANONYMIZED_TOKENS.TARJETA;
    }
    case 'FECHA_NACIMIENTO':
      return birthYear(v);
    case 'EDAD':
      return ageRange(v);
    case 'SALARIO':
      return salaryRange(v);
    default:
      return ANONYMIZED_TOKENS[type];
  }
}

/**
 * @param cellSpans lo que encontró la IA local en las celdas de texto libre (columna → fila → fragmentos).
 */
export function applyDecisions(
  table: Table,
  decisions: Record<number, ColumnDecision>,
  cellSpans?: Map<number, Map<number, Span[]>>,
): TransformResult {
  const registry = new PseudonymRegistry();
  const counts: Partial<Record<DetectionType, number>> = {};
  const bump = (t: DetectionType) => (counts[t] = (counts[t] ?? 0) + 1);

  const keep = table.headers.map((_, i) => decisions[i]?.action !== 'eliminar');

  // Las columnas eliminadas también cuentan como datos protegidos.
  table.headers.forEach((_, i) => {
    const d = decisions[i];
    if (d?.action === 'eliminar' && d.type) {
      for (const row of table.rows) if (cellToString(row[i])) bump(d.type);
    }
  });

  // Los nombres, empresas y direcciones de columnas marcadas se buscan también en las columnas de texto libre,
  // con el mismo prefijo: "Camila Fernández" es Persona_03 en "Contacto" y en "Observaciones".
  const learned: CustomTerm[] = [];
  const learnedPrefix = new Map<string, string>();
  table.headers.forEach((_, i) => {
    const d = decisions[i];
    if (!d || d.kind !== 'columna' || !d.type || d.action === 'mantener' || !PROPAGATED.has(d.type)) return;
    const prefix = d.prefix?.trim() || PSEUDONYM_PREFIXES[d.type];
    for (const row of table.rows) {
      const v = cellToString(row[i]);
      if (v.length < 3 || learnedPrefix.has(fold(v)) || learned.length >= MAX_LEARNED) continue;
      learned.push({ value: v, type: d.type });
      learnedPrefix.set(fold(v), prefix);
    }
  });

  const rows = table.rows.map((row, r) =>
    row
      .map((cell, i): CellValue => {
        const d = decisions[i];
        if (!d || d.action === 'mantener' || d.action === 'eliminar') return cell;
        const s = cellToString(cell);
        if (!s) return cell;

        if (d.kind === 'texto') {
          const spans = mergeSpans(findTerms(s, learned), combineModelSpans(scanText(s), cellSpans?.get(i)?.get(r) ?? []));
          if (spans.length === 0) return cell;
          spans.forEach((sp) => bump(sp.type));
          return replaceSpans(s, spans, (sp) =>
            d.action === 'seudonimizar'
              ? registry.get(learnedPrefix.get(fold(sp.value)) ?? PSEUDONYM_PREFIXES[sp.type], sp.type, sp.value)
              : anonymizeValue(sp.type, sp.value),
          );
        }

        if (!d.type) return cell;
        bump(d.type);
        if (d.action === 'anonimizar') return anonymizeValue(d.type, cell);
        const prefix = d.prefix?.trim() || PSEUDONYM_PREFIXES[d.type];
        return registry.get(prefix, d.type, s);
      })
      .filter((_, i) => keep[i]),
  );

  return {
    table: { headers: table.headers.filter((_, i) => keep[i]), rows },
    equivalences: registry.entries(),
    transformedCounts: counts,
  };
}
