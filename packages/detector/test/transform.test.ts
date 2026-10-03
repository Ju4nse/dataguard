import { describe, expect, it } from 'vitest';
import { anonymizeValue, applyDecisions, PseudonymRegistry, scanText, type Table } from '../src';

const table: Table = {
  headers: ['Cliente', 'CUIT', 'Email', 'Teléfono', 'Nacimiento', 'Notas', 'Monto'],
  rows: [
    ['Pérez SA', '20-12345678-6', 'ana@perez.com', '11 4567-8901', '1985-03-12', 'Llamar al +54 9 11 4567-8901', 100],
    ['Gómez SRL', '33-69345023-9', 'luis@gomez.com', '11 2222-3333', '1990-07-01', 'Sin novedades', 200],
    ['PEREZ S.A.', '20123456786', 'ana@perez.com', '11 4567-8901', '1985-03-12', 'Escribir a ana@perez.com', 300],
  ],
};

const result = applyDecisions(table, {
  0: { action: 'seudonimizar', type: 'RAZON_SOCIAL', kind: 'columna', prefix: 'Cliente' },
  1: { action: 'seudonimizar', type: 'CUIT_CUIL', kind: 'columna' },
  2: { action: 'anonimizar', type: 'EMAIL', kind: 'columna' },
  3: { action: 'eliminar', type: 'TELEFONO', kind: 'columna' },
  4: { action: 'anonimizar', type: 'FECHA_NACIMIENTO', kind: 'columna' },
  5: { action: 'anonimizar', type: null, kind: 'texto' },
  6: { action: 'mantener', type: null, kind: 'columna' },
});

describe('applyDecisions', () => {
  it('elimina las columnas marcadas', () => {
    expect(result.table.headers).toEqual(['Cliente', 'CUIT', 'Email', 'Nacimiento', 'Notas', 'Monto']);
  });

  it('seudonimiza de forma consistente, aunque el valor esté escrito distinto', () => {
    const clientes = result.table.rows.map((r) => r[0]);
    expect(clientes).toEqual(['Cliente_01', 'Cliente_02', 'Cliente_01']);
    const cuits = result.table.rows.map((r) => r[1]);
    expect(cuits).toEqual(['CUIT_01', 'CUIT_02', 'CUIT_01']);
  });

  it('anonimiza según el tipo', () => {
    expect(result.table.rows[0]![2]).toBe('***@perez.com');
    expect(result.table.rows[0]![3]).toBe('1985');
  });

  it('en texto libre reemplaza solo lo detectado', () => {
    expect(result.table.rows[0]![4]).toBe('Llamar al [TEL]');
    expect(result.table.rows[1]![4]).toBe('Sin novedades');
    expect(result.table.rows[2]![4]).toBe('Escribir a ***@perez.com');
  });

  it('no deja ningún valor sensible original en la salida', () => {
    const out = JSON.stringify(result.table.rows);
    for (const secret of ['Pérez SA', '20-12345678-6', '33-69345023-9', 'ana@perez', '4567-8901', '1985-03-12']) {
      expect(out).not.toContain(secret);
    }
  });

  it('genera la tabla de equivalencias para revertir', () => {
    expect(result.equivalences).toContainEqual({ seudonimo: 'Cliente_01', original: 'Pérez SA', grupo: 'Cliente' });
    expect(result.equivalences).toContainEqual({ seudonimo: 'CUIT_02', original: '33-69345023-9', grupo: 'CUIT' });
  });

  it('cuenta lo transformado por tipo (incluye columnas eliminadas)', () => {
    expect(result.transformedCounts).toMatchObject({ RAZON_SOCIAL: 3, CUIT_CUIL: 3, EMAIL: 4, TELEFONO: 4, FECHA_NACIMIENTO: 3 });
  });
});

describe('anonymizeValue', () => {
  it('tarjeta conserva solo los últimos 4', () => {
    expect(anonymizeValue('TARJETA', '4111 1111 1111 1111')).toBe('**** 1111');
  });
  it('fecha de nacimiento desde Date y desde número de serie de Excel', () => {
    expect(anonymizeValue('FECHA_NACIMIENTO', new Date(1990, 6, 1))).toBe('1990');
    expect(anonymizeValue('FECHA_NACIMIENTO', 33055)).toBe('1990');
  });
});

describe('seudónimos de nombres parciales y negocios', () => {
  it('un apellido solo recibe el seudónimo de la única persona que lo tiene', () => {
    const reg = new PseudonymRegistry();
    expect(reg.get('Persona', 'NOMBRE_PERSONA', 'Graciela Benítez')).toBe('Persona_01');
    expect(reg.get('Persona', 'NOMBRE_PERSONA', 'Benítez')).toBe('Persona_01');
    expect(reg.get('Persona', 'NOMBRE_PERSONA', 'graciela')).toBe('Persona_01');
    // Con dos personas con el mismo apellido no se adivina.
    reg.get('Persona', 'NOMBRE_PERSONA', 'Martín Benítez');
    expect(reg.get('Persona', 'NOMBRE_PERSONA', 'Benítez')).toBe('Persona_03');
  });

  it('un nombre después de un rubro comercial es una empresa', () => {
    const spans = scanText('La factura de Ferretería Don Tito vence el viernes.');
    expect(spans.map((s) => [s.type, s.value])).toEqual([['RAZON_SOCIAL', 'Ferretería Don Tito']]);
  });
});
