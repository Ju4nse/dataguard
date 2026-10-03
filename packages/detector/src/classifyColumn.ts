import type { Action, Confidence, DetectionType } from '@securedata/shared';
import { DETECTION_LABELS } from '@securedata/shared';
import { headerHint, isNegativeHeader } from './patterns/headers';
import { mentionsSensitive } from './patterns/sensitive';
import { isPersonNameValue, looksLikeCompany, looksLikePersonName, STRONG_TYPES, VALUE_MATCHERS } from './patterns/values';
import { countByType, scanText } from './scanText';
import type { CellValue, ColumnFinding, Table } from './types';
import { cellToString, maskForDisplay } from './util';

const SAMPLE_SIZE = 500;
const MAX_EXAMPLES = 3;

/** Acción sugerida por tipo cuando la detección es confiable. */
export const DEFAULT_ACTIONS: Record<DetectionType, Action> = {
  EMAIL: 'anonimizar',
  TELEFONO: 'eliminar',
  DNI: 'seudonimizar',
  CUIT_CUIL: 'seudonimizar',
  CBU_CVU: 'eliminar',
  TARJETA: 'eliminar',
  PATENTE: 'seudonimizar',
  NOMBRE_PERSONA: 'seudonimizar',
  RAZON_SOCIAL: 'seudonimizar',
  DIRECCION: 'eliminar',
  FECHA_NACIMIENTO: 'anonimizar',
  EDAD: 'anonimizar',
  PASAPORTE: 'seudonimizar',
  SALARIO: 'anonimizar',
  DATO_SENSIBLE: 'eliminar',
  CREDENCIAL: 'eliminar',
  IP: 'anonimizar',
};

/** Tipos que solo se reconocen por el encabezado (no tienen formato fijo). */
const HEADER_ONLY_TYPES = new Set<DetectionType>([
  'NOMBRE_PERSONA', 'RAZON_SOCIAL', 'DIRECCION', 'FECHA_NACIMIENTO', 'EDAD', 'SALARIO', 'DATO_SENSIBLE',
]);

/** Comprobación de los valores para tipos que se reconocen por encabezado: si falla, la confianza baja. */
const HEADER_VALUE_CHECKS: Partial<Record<DetectionType, { test: (s: string) => boolean; failReason: string }>> = {
  EDAD: { test: (s) => /^\d{1,3}$/.test(s) && Number(s) < 120, failReason: 'los valores no parecen edades' },
  SALARIO: { test: (s) => /^\$?\s?[\d.,]+$/.test(s), failReason: 'los valores no parecen montos' },
};

function sample(values: CellValue[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const s = cellToString(v);
    if (s) out.push(s);
    if (out.length >= SAMPLE_SIZE) break;
  }
  return out;
}

function ratio(values: string[], test: (s: string) => boolean): number {
  if (values.length === 0) return 0;
  return values.filter(test).length / values.length;
}

function isNumericLike(s: string): boolean {
  return /^[\d\s.,-]+$/.test(s);
}

export function isFreeText(values: string[]): boolean {
  if (values.length === 0) return false;
  const avgLen = values.reduce((n, s) => n + s.length, 0) / values.length;
  return avgLen >= 20 && ratio(values, (s) => s.includes(' ')) >= 0.5;
}

interface Verdict {
  type: DetectionType;
  confidence: Confidence;
  matchRatio: number;
  reason: string;
}

function decide(header: string, values: string[]): Verdict | null {
  const hint = headerHint(header);
  const ratios = VALUE_MATCHERS.map((m) => ({ type: m.type, r: ratio(values, m.test) }));
  const best = ratios.reduce((a, b) => (b.r > a.r ? b : a), { type: 'EMAIL' as DetectionType, r: 0 });
  const label = (t: DetectionType) => DETECTION_LABELS[t];

  // 1. Formato con validación fuerte (dígito verificador / email) en la mayoría de los valores.
  if (best.r >= 0.8 && STRONG_TYPES.has(best.type)) {
    return { type: best.type, confidence: 'alta', matchRatio: best.r, reason: `${Math.round(best.r * 100)}% de los valores son ${label(best.type)} válidos` };
  }

  // 2. El encabezado lo anuncia y los valores lo confirman.
  if (hint && !HEADER_ONLY_TYPES.has(hint)) {
    const r = ratios.find((x) => x.type === hint)?.r ?? 0;
    if (r >= 0.5) {
      return { type: hint, confidence: 'alta', matchRatio: r, reason: `Encabezado "${header}" y ${Math.round(r * 100)}% de valores con formato de ${label(hint)}` };
    }
    // Con encabezado pero sin formato válido (ej. CUIT inventados con verificador incorrecto): igual se marca.
    return { type: hint, confidence: 'media', matchRatio: r, reason: `El encabezado "${header}" sugiere ${label(hint)}` };
  }

  // 3. Tipos sin formato fijo: se apoyan en el encabezado y en heurísticas sobre los valores.
  if (hint && HEADER_ONLY_TYPES.has(hint)) {
    const numeric = ratio(values, isNumericLike);
    if (hint === 'NOMBRE_PERSONA' || hint === 'RAZON_SOCIAL') {
      const people = ratio(values, looksLikePersonName);
      const companies = ratio(values, looksLikeCompany);
      if (numeric >= 0.8) {
        return { type: hint, confidence: 'baja', matchRatio: 0, reason: `El encabezado sugiere ${label(hint)}, pero los valores son números (¿un código interno?)` };
      }
      if (companies >= 0.3 && companies >= people) {
        return { type: 'RAZON_SOCIAL', confidence: 'alta', matchRatio: companies, reason: `Encabezado "${header}" y valores con forma societaria (SA, SRL…)` };
      }
      if (people >= 0.6) {
        return { type: 'NOMBRE_PERSONA', confidence: 'alta', matchRatio: people, reason: `Encabezado "${header}" y valores con forma de nombre propio` };
      }
    }
    const check = HEADER_VALUE_CHECKS[hint];
    if (check) {
      const r = ratio(values, check.test);
      return r >= 0.8
        ? { type: hint, confidence: 'alta', matchRatio: r, reason: `Encabezado "${header}" y valores consistentes` }
        : { type: hint, confidence: 'baja', matchRatio: r, reason: `El encabezado sugiere ${label(hint)}, pero ${check.failReason}` };
    }
    return { type: hint, confidence: 'media', matchRatio: 0, reason: `El encabezado "${header}" sugiere ${label(hint)}` };
  }

  // 4. Sin pista en el encabezado. Si el encabezado habla de un número de negocio ("Código", "Nro Factura", "Monto"),
  //    que los valores se parezcan a un DNI o un teléfono no alcanza.
  const negative = isNegativeHeader(header);
  if (!negative && best.r >= 0.9 && (best.type === 'TELEFONO' || best.type === 'DNI' || best.type === 'PATENTE' || best.type === 'IP' || best.type === 'PASAPORTE')) {
    return { type: best.type, confidence: 'baja', matchRatio: best.r, reason: `Los valores tienen formato de ${label(best.type)}, pero el encabezado no lo confirma` };
  }
  const companies = ratio(values, looksLikeCompany);
  if (companies >= 0.5) {
    return { type: 'RAZON_SOCIAL', confidence: 'media', matchRatio: companies, reason: 'Valores con forma societaria (SA, SRL…)' };
  }
  // Con nombres de pila del diccionario ("JUAN PEREZ", "Gómez, María") la evidencia es buena aunque no haya encabezado.
  const dictionaryPeople = ratio(values, isPersonNameValue);
  if (dictionaryPeople >= 0.6) {
    return { type: 'NOMBRE_PERSONA', confidence: 'media', matchRatio: dictionaryPeople, reason: `${Math.round(dictionaryPeople * 100)}% de los valores contienen nombres de pila frecuentes` };
  }
  const people = ratio(values, looksLikePersonName);
  if (people >= 0.8) {
    return { type: 'NOMBRE_PERSONA', confidence: 'baja', matchRatio: people, reason: 'Los valores parecen nombres propios (revisar: también podrían ser ciudades o productos)' };
  }
  const sensitive = ratio(values, mentionsSensitive);
  if (sensitive >= 0.5) {
    return { type: 'DATO_SENSIBLE', confidence: 'media', matchRatio: sensitive, reason: 'Los valores mencionan datos de salud, religión u otros datos sensibles' };
  }
  return null;
}

/** Analiza una columna. `values` es la columna completa; la clasificación usa una muestra. */
export function classifyColumn(index: number, header: string, values: CellValue[]): ColumnFinding {
  const sampled = sample(values);
  const verdict = decide(header, sampled);

  if (verdict) {
    const matcher = VALUE_MATCHERS.find((m) => m.type === verdict.type);
    const nonEmpty = values.map(cellToString).filter(Boolean);
    const detectionCount = matcher && verdict.matchRatio > 0 ? nonEmpty.filter(matcher.test).length : nonEmpty.length;
    return {
      index,
      header,
      kind: 'columna',
      type: verdict.type,
      confidence: verdict.confidence,
      matchRatio: verdict.matchRatio,
      detectionCount,
      textCounts: {},
      examples: sampled.slice(0, MAX_EXAMPLES).map(maskForDisplay),
      // Ante la duda se seudonimiza: protege, conserva la utilidad para analizar y se puede revertir con la tabla de equivalencias.
      suggestedAction: verdict.confidence === 'baja' ? 'seudonimizar' : DEFAULT_ACTIONS[verdict.type],
      reason: verdict.reason,
    };
  }

  if (isFreeText(sampled)) {
    const spans = values.flatMap((v) => scanText(cellToString(v)));
    if (spans.length > 0) {
      const textCounts = countByType(spans);
      const kinds = Object.keys(textCounts).map((t) => DETECTION_LABELS[t as DetectionType]);
      return {
        index,
        header,
        kind: 'texto',
        type: null,
        confidence: 'media',
        matchRatio: 0,
        detectionCount: spans.length,
        textCounts,
        examples: spans.slice(0, MAX_EXAMPLES).map((s) => maskForDisplay(s.value)),
        // Seudonimizar: la respuesta de la IA se puede traducir después con la tabla de equivalencias.
        suggestedAction: 'seudonimizar',
        reason: `Texto libre con ${spans.length} dato(s) sensible(s) adentro: ${kinds.join(', ')}`,
      };
    }
  }

  return {
    index,
    header,
    kind: 'ninguno',
    type: null,
    confidence: null,
    matchRatio: 0,
    detectionCount: 0,
    textCounts: {},
    examples: [],
    suggestedAction: 'mantener',
    reason: 'No se detectaron datos sensibles',
  };
}

export function analyzeTable(table: Table): ColumnFinding[] {
  return table.headers.map((h, i) =>
    classifyColumn(
      i,
      h,
      table.rows.map((r) => r[i]),
    ),
  );
}

/** Totales por tipo para el evento de metadatos del panel. */
export function summarizeFindings(findings: ColumnFinding[]): Partial<Record<DetectionType, number>> {
  const out: Partial<Record<DetectionType, number>> = {};
  for (const f of findings) {
    if (f.kind === 'columna' && f.type && f.confidence !== 'baja') {
      out[f.type] = (out[f.type] ?? 0) + f.detectionCount;
    } else if (f.kind === 'texto') {
      for (const [t, n] of Object.entries(f.textCounts)) {
        out[t as DetectionType] = (out[t as DetectionType] ?? 0) + (n ?? 0);
      }
    }
  }
  return out;
}
