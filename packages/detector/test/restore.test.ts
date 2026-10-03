import { describe, expect, it } from 'vitest';
import { PseudonymRegistry, restorePseudonyms, type EquivalenceRow } from '../src';

const table: EquivalenceRow[] = [
  { seudonimo: 'Persona_01', original: 'Graciela Benítez', grupo: 'Persona' },
  { seudonimo: 'Persona_02', original: 'Matías Szwarc', grupo: 'Persona' },
  { seudonimo: 'Empresa_01', original: 'Ferretería Don Tito', grupo: 'Empresa' },
  { seudonimo: 'Cliente VIP_01', original: 'Logística Sur SA', grupo: 'Cliente VIP' },
  { seudonimo: 'DNI_01', original: '32.456.789', grupo: 'DNI' },
];

describe('restorePseudonyms', () => {
  it('reemplaza cada seudónimo por el dato real y cuenta las apariciones', () => {
    const r = restorePseudonyms('Persona_01 trabaja en Empresa_01. Hablá con Persona_01 y con Persona_02.', table);
    expect(r.text).toBe('Graciela Benítez trabaja en Ferretería Don Tito. Hablá con Graciela Benítez y con Matías Szwarc.');
    expect(r.replaced.find((x) => x.seudonimo === 'Persona_01')?.count).toBe(2);
    expect(r.parts.filter((p) => p.seudonimo).map((p) => p.seudonimo)).toEqual(['Persona_01', 'Empresa_01', 'Persona_01', 'Persona_02']);
  });

  it('tolera cómo reescriben las IA los seudónimos', () => {
    const r = restorePseudonyms('**Persona 1**, persona_02, PERSONA-01, Empresa1 y Cliente_VIP_01 (DNI 01).', table);
    expect(r.text).toBe('**Graciela Benítez**, Matías Szwarc, Graciela Benítez, Ferretería Don Tito y Logística Sur SA (32.456.789).');
  });

  it('no confunde texto común ni números con seudónimos', () => {
    const text = 'Llamó una persona 2 veces; el DNI 32.456.789 y la Empresa_01x no se tocan.';
    const r = restorePseudonyms(text, table);
    expect(r.text).toBe(text);
    expect(r.replaced).toEqual([]);
  });

  it('avisa los seudónimos que no están en la tabla y los datos anonimizados', () => {
    const r = restorePseudonyms('Persona_09 escribió desde ***@gmail.com con DNI [DNI] y tarjeta **** 1234.', table);
    expect(r.unknown).toEqual(['Persona_09']);
    expect(r.irreversible).toEqual(['***@gmail.com', '[DNI]', '**** 1234']);
    expect(r.text).toContain('Persona_09');
  });

  it('funciona con la tabla que genera el seudonimizador', () => {
    const reg = new PseudonymRegistry();
    const a = reg.get('Persona', 'NOMBRE_PERSONA', 'Ana Paz');
    const b = reg.get('Empresa', 'RAZON_SOCIAL', 'Acme SRL');
    expect(restorePseudonyms(`${b} contrató a ${a}.`, reg.entries()).text).toBe('Acme SRL contrató a Ana Paz.');
  });
});
