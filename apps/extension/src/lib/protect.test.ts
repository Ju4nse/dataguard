import { PseudonymRegistry } from '@securedata/detector';
import { describe, expect, it } from 'vitest';
import { analyzePrompt, protectPrompt, toDetections } from './protect';

const PROMPT = 'Redactá un mail para Graciela Benítez (DNI 30.123.456, graciela.benitez@gmail.com) por la deuda pendiente.';

describe('analyzePrompt', () => {
  it('no avisa si no hay nada que proteger', () => {
    expect(analyzePrompt('Resumime este artículo sobre energía solar.', {}, new PseudonymRegistry())).toBeNull();
    expect(analyzePrompt('   ', {}, new PseudonymRegistry())).toBeNull();
  });

  it('encuentra los datos y los reemplaza sin dejar los originales', () => {
    const registry = new PseudonymRegistry();
    const a = analyzePrompt(PROMPT, {}, registry)!;
    expect(a.summary.map((s) => s.type)).toEqual(expect.arrayContaining(['NOMBRE_PERSONA', 'DNI', 'EMAIL']));
    expect(a.enforced).toBe(false);
    expect(registry.entries()).toHaveLength(0); // analizar no asigna seudónimos

    const text = protectPrompt(a, registry);
    expect(text).not.toContain('Graciela');
    expect(text).not.toContain('30.123.456');
    expect(text).not.toContain('graciela.benitez@'); // el email anonimizado conserva solo el dominio
    expect(text).toContain('Persona_01');
    // Al enviarlo se revisa de nuevo: lo protegido no tiene que volver a frenar el envío.
    expect(analyzePrompt(text, {}, registry)).toBeNull();
  });

  it('la política manda: lo que permite no se avisa ni se reemplaza, lo que exige no se puede saltear', () => {
    const registry = new PseudonymRegistry();
    const a = analyzePrompt(PROMPT, { EMAIL: 'mantener', DNI: 'eliminar' }, registry)!;
    expect(a.summary.map((s) => s.type)).not.toContain('EMAIL');
    expect(a.decisions.DNI?.action).toBe('anonimizar'); // "eliminar columna" no existe en un prompt
    expect(a.enforced).toBe(true);
    expect(protectPrompt(a, registry)).toContain('graciela.benitez@gmail.com');

    expect(analyzePrompt('Escribile a juan.perez@gmail.com', { EMAIL: 'mantener' }, registry)).toBeNull();
  });

  it('una persona ya seudonimizada en la pestaña conserva su seudónimo en los prompts siguientes', () => {
    const registry = new PseudonymRegistry();
    protectPrompt(analyzePrompt(PROMPT, {}, registry)!, registry);
    const next = analyzePrompt('¿Y qué le respondo a graciela benítez si no paga?', {}, registry)!;
    expect(next).not.toBeNull();
    expect(protectPrompt(next, registry)).toContain('Persona_01');
  });
});

describe('toDetections', () => {
  it('solo manda tipos y cantidades; si no se protegió, la acción es "mantener"', () => {
    const a = analyzePrompt(PROMPT, {}, new PseudonymRegistry())!;
    const masked = toDetections(a, 'enmascarado');
    expect(masked.every((d) => Object.keys(d).sort().join() === 'accion,cantidad,tipo')).toBe(true);
    expect(masked.find((d) => d.tipo === 'NOMBRE_PERSONA')?.accion).toBe('seudonimizar');
    expect(toDetections(a, 'ignorado').every((d) => d.accion === 'mantener')).toBe(true);
  });
});
