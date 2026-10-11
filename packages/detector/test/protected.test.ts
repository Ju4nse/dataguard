import { describe, expect, it } from 'vitest';
import { applyDecisions, combineModelSpans, isAlreadyProtected, PseudonymRegistry, scanText, type Span, type Table } from '../src';

/** Lo que marcaría la IA local sobre `value` dentro de `text`. */
const modelSpan = (text: string, value: string, type: Span['type'] = 'NOMBRE_PERSONA'): Span => {
  const start = text.indexOf(value);
  return { type, start, end: start + value.length, value, confidence: 'alta' };
};

describe('isAlreadyProtected', () => {
  it('reconoce seudónimos, marcadores y datos enmascarados', () => {
    for (const v of ['Persona_01', 'Empresa_12', 'Proveedor_3', 'DatoSensible_02', '[DNI]', '[DATO SENSIBLE]', '***@gmail.com', '**** 1234']) {
      expect(isAlreadyProtected(v), v).toBe(true);
    }
    expect(isAlreadyProtected('Sra. Persona_02')).toBe(true);
    expect(isAlreadyProtected('Persona_01 y Persona_03')).toBe(true);
  });

  it('un dato real no está protegido, aunque esté al lado de un seudónimo', () => {
    for (const v of ['Graciela Benítez', 'Persona', 'Sra.', 'Persona_01 Gómez', 'Ferretería Don Tito', 'Calle 47 nro 820']) {
      expect(isAlreadyProtected(v), v).toBe(false);
    }
  });
});

describe('volver a analizar un texto ya protegido', () => {
  const text = 'Le escribió la Sra. Persona_01 de Empresa_02 (DNI [DNI], ***@gmail.com) por la factura.';

  it('las reglas no detectan los seudónimos ni los marcadores', () => {
    expect(scanText(text)).toEqual([]);
  });

  it('lo que la IA marca sobre un seudónimo se descarta; un nombre real nuevo, no', () => {
    const withNew = `${text} Copiá a Rocío Lanús.`;
    const model = [
      modelSpan(withNew, 'Persona_01'),
      modelSpan(withNew, 'Sra. Persona_01'),
      modelSpan(withNew, 'Empresa_02', 'RAZON_SOCIAL'),
      modelSpan(withNew, 'Rocío Lanús'),
    ];
    expect(combineModelSpans(scanText(withNew), model, withNew).map((s) => s.value)).toEqual(['Rocío Lanús']);
  });

  it('el registro nunca convierte Persona_01 en Persona_02', () => {
    const registry = new PseudonymRegistry();
    expect(registry.get('Persona', 'NOMBRE_PERSONA', 'Graciela Benítez')).toBe('Persona_01');
    expect(registry.get('Persona', 'NOMBRE_PERSONA', 'Persona_01')).toBe('Persona_01');
    expect(registry.get('Persona', 'NOMBRE_PERSONA', 'Rocío Lanús')).toBe('Persona_02');
    expect(registry.entries().map((r) => r.original)).toEqual(['Graciela Benítez', 'Rocío Lanús']);
  });

  it('una planilla ya depurada se puede volver a depurar sin cambiar los seudónimos', () => {
    const table: Table = {
      headers: ['Cliente', 'Contacto'],
      rows: [
        ['Empresa_01', 'Persona_01'],
        ['Empresa_02', 'Graciela Benítez'],
      ],
    };
    const out = applyDecisions(table, {
      0: { kind: 'columna', type: 'RAZON_SOCIAL', action: 'seudonimizar' },
      1: { kind: 'columna', type: 'NOMBRE_PERSONA', action: 'seudonimizar' },
    });
    expect(out.table.rows.map((r) => r[0])).toEqual(['Empresa_01', 'Empresa_02']);
    expect(out.table.rows[0]![1]).toBe('Persona_01');
    expect(out.equivalences.map((e) => e.original)).toEqual(['Graciela Benítez']);
  });
});
