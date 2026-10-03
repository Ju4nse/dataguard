import { describe, expect, it } from 'vitest';
import { analyzeTable, applyDecisions, applyTableModel, planTableModel, type ColumnDecision, type Span, type Table } from '../src';

// Nombres que no están en el diccionario y un encabezado que no anuncia nada: las reglas dudan.
const table: Table = {
  headers: ['Referente', 'Monto', 'Notas'],
  rows: [
    ['Wojciech Kowalczyk', 1200, 'Reunión con Yanina Etcheverry por el reclamo pendiente de la entrega.'],
    ['Oksana Melnyk', 3400, 'Sin novedades en la cuenta este mes, se renovó el contrato anual.'],
    ['Thiago Nakamura', 560, 'Pidió que lo llame Florencia Iturralde la semana que viene sin falta.'],
  ],
};

/** Simula al modelo: marca como persona los nombres conocidos que aparezcan en cada texto. */
const NAMES = ['Wojciech Kowalczyk', 'Oksana Melnyk', 'Thiago Nakamura', 'Yanina Etcheverry', 'Florencia Iturralde'];
const fakeModel = (text: string): Span[] =>
  NAMES.filter((n) => text.includes(n)).map((n) => {
    const start = text.indexOf(n);
    return { type: 'NOMBRE_PERSONA', start, end: start + n.length, value: n, confidence: 'alta' };
  });

describe('IA local en planillas', () => {
  const findings = analyzeTable(table);
  const requests = planTableModel(table, findings);

  it('planifica una muestra para la columna dudosa y todas las celdas del texto libre', () => {
    expect(findings[0]).toMatchObject({ kind: 'columna', type: 'NOMBRE_PERSONA', confidence: 'baja' });
    expect(requests.map((r) => [r.column, r.mode])).toEqual([
      [0, 'muestra'],
      [2, 'texto'],
    ]);
    // La muestra lleva el encabezado como contexto.
    expect(requests[0]!.texts[0]).toBe('Referente: Wojciech Kowalczyk');
    expect(requests[0]!.offsets[0]).toBe('Referente: '.length);
  });

  it('clasifica la columna entera y suma lo del texto libre; al proteger no queda ningún nombre', () => {
    const results = requests.map((r) => r.texts.map(fakeModel));
    const { findings: refined, cellSpans } = applyTableModel(table, findings, requests, results);
    expect(refined[0]).toMatchObject({ kind: 'columna', type: 'NOMBRE_PERSONA', confidence: 'media' });
    expect(refined[2]).toMatchObject({ kind: 'texto', suggestedAction: 'seudonimizar' });
    expect(cellSpans.get(2)?.size).toBe(2);

    const decisions: Record<number, ColumnDecision> = {
      0: { action: 'seudonimizar', type: 'NOMBRE_PERSONA', kind: 'columna' },
      1: { action: 'mantener', type: null, kind: 'columna' },
      2: { action: 'seudonimizar', type: null, kind: 'texto' },
    };
    const out = applyDecisions(table, decisions, cellSpans);
    const flat = JSON.stringify(out.table.rows);
    for (const n of NAMES) expect(flat).not.toContain(n);
    expect(out.table.rows[0]![0]).toBe('Persona_01');
    expect(out.table.rows[0]![2]).toBe('Reunión con Persona_02 por el reclamo pendiente de la entrega.');
  });

  it('si el modelo no reconoce casi nada, todo queda como lo dejaron las reglas', () => {
    const results = requests.map((r) => r.texts.map(() => []));
    const { findings: refined, cellSpans } = applyTableModel(table, findings, requests, results);
    expect(refined).toEqual(findings);
    expect(cellSpans.size).toBe(0);
  });

  it('una columna sin clasificar (o dudosa) toma el tipo que reconoce el modelo', () => {
    const t: Table = { headers: ['Origen'], rows: [['Distribuidora El Ombú'], ['Metalúrgica Santa Lucía'], ['Plásticos del Oeste']] };
    const f = analyzeTable(t);
    expect(f[0]!.confidence === null || f[0]!.confidence === 'baja').toBe(true);
    const reqs = planTableModel(t, f);
    const res = reqs.map((r) => r.texts.map((text, i): Span[] => [{ type: 'RAZON_SOCIAL', start: r.offsets[i]!, end: text.length, value: text.slice(r.offsets[i]), confidence: 'alta' }]));
    expect(applyTableModel(t, f, reqs, res).findings[0]).toMatchObject({ kind: 'columna', type: 'RAZON_SOCIAL', suggestedAction: 'seudonimizar' });
  });
});
