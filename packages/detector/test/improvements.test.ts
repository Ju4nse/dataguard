import { describe, expect, it } from 'vitest';
import { analyzeDocument, anonymizeValue, applyDecisions, isValidCard, scanText, transformDocument, type Table } from '../src';

const found = (text: string) => scanText(text).map((s) => [s.type, s.value]);

describe('nombres de personas en texto libre', () => {
  it('nombre de pila + apellido, con conectores e iniciales', () => {
    expect(found('Lo firmó Juan Carlos de la Fuente.')).toEqual([['NOMBRE_PERSONA', 'Juan Carlos de la Fuente']]);
  });
  it('título + apellido solo', () => {
    expect(found('Lo atendió el Dr. Ramírez.')).toEqual([['NOMBRE_PERSONA', 'Ramírez']]);
  });
  it('no confunde lugares que son nombres de pila', () => {
    expect(found('Abrimos sucursal en Rosario y en Villa Mercedes.')).toEqual([]);
    expect(found('Nos vemos en Av. San Martín al 400.')).toEqual([]);
  });
  it('un nombre ambiguo con apellido se marca, pero con confianza baja', () => {
    const [span] = scanText('Escribile a Victoria Gutiérrez.');
    expect(span).toMatchObject({ type: 'NOMBRE_PERSONA', value: 'Victoria Gutiérrez', confidence: 'baja' });
  });
});

describe('confianza por fragmento', () => {
  it('tarjeta: alta con contexto o agrupada, media suelta', () => {
    expect(scanText('Visa 4111111111111111')[0]?.confidence).toBe('alta');
    expect(scanText('nro 4111111111111111 ok')[0]?.confidence).toBe('media');
  });
  it('los timestamps no pasan por tarjeta', () => {
    expect(isValidCard('20250315123045')).toBe(false);
  });
});

describe('falsos positivos evitados', () => {
  it('números de factura y remito no son teléfonos', () => {
    expect(found('Factura 0001-00012345 y remito 0003-00045678')).toEqual([]);
  });
  it('el contexto "DNI" no cruza a otro campo', () => {
    expect(found('DNI 27.345.901 | Sueldo: $ 1.420.000').map(([t]) => t)).toEqual(['DNI', 'SALARIO']);
  });
  it('una contraseña en una URL de conexión no es un email', () => {
    expect(found('postgres://admin:S3cr3t@db.local/x')).toEqual([['CREDENCIAL', 'S3cr3t']]);
  });
});

describe('anonimización que conserva utilidad', () => {
  it('edad → década', () => {
    expect(anonymizeValue('EDAD', 45)).toBe('40-49');
    expect(anonymizeValue('EDAD', '67 años')).toBe('60-69 años');
  });
  it('salario → rango', () => {
    expect(anonymizeValue('SALARIO', 853200)).toBe('$ 800.000 – 900.000');
    expect(anonymizeValue('SALARIO', '$ 1.850.000')).toBe('$ 1.800.000 – 1.900.000');
  });
});

describe('valores ignorados por el usuario', () => {
  it('no se cuentan ni se reemplazan', () => {
    const segments = [{ text: 'Escribile a Victoria Gutiérrez o a ana@b.com' }];
    const a = analyzeDocument(segments, [], ['victoria gutierrez']);
    expect(a.summary.map((s) => s.type)).toEqual(['EMAIL']);
    const res = transformDocument(segments, a.spans, { NOMBRE_PERSONA: { action: 'seudonimizar' }, EMAIL: { action: 'anonimizar' } });
    expect(res.texts[0]).toBe('Escribile a Victoria Gutiérrez o a ***@b.com');
  });
});

describe('tablas: nombres de una columna se reemplazan también en el texto libre', () => {
  it('mismo seudónimo en "Contacto" y en "Observaciones"', () => {
    const table: Table = {
      headers: ['Contacto', 'Observaciones'],
      rows: [
        ['Camila Fernández', 'Llamar a Camila Fernández antes del viernes'],
        ['Ernesto Paz', 'Sin novedades'],
      ],
    };
    const res = applyDecisions(table, {
      0: { action: 'seudonimizar', type: 'NOMBRE_PERSONA', kind: 'columna', prefix: 'Cliente' },
      1: { action: 'seudonimizar', type: null, kind: 'texto' },
    });
    expect(res.table.rows[0]).toEqual(['Cliente_01', 'Llamar a Cliente_01 antes del viernes']);
  });
});
