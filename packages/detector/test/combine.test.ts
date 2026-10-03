import { describe, expect, it } from 'vitest';
import { analyzeDocument, combineModelSpans, scanText, type Span } from '../src';

const span = (type: Span['type'], text: string, value: string, confidence: Span['confidence']): Span => {
  const start = text.indexOf(value);
  return { type, start, end: start + value.length, value, confidence };
};

describe('combineModelSpans', () => {
  const text = 'Hablé con María Laura Gómez (CUIT 20-12345678-6) de Logística Sur.';

  it('suma lo que las reglas no encontraron', () => {
    const r = combineModelSpans([], [span('RAZON_SOCIAL', text, 'Logística Sur', 'media')]);
    expect(r.map((s) => s.value)).toEqual(['Logística Sur']);
  });

  it('extiende un nombre cuando el modelo abarca más', () => {
    const r = combineModelSpans([span('NOMBRE_PERSONA', text, 'María Laura', 'media')], [span('NOMBRE_PERSONA', text, 'María Laura Gómez', 'media')]);
    expect(r.map((s) => s.value)).toEqual(['María Laura Gómez']);
  });

  it('no pisa lo que validó una regla con formato', () => {
    const rules = [span('CUIT_CUIL', text, '20-12345678-6', 'alta')];
    const r = combineModelSpans(rules, [span('NOMBRE_PERSONA', text, '20-12345678-6', 'alta')]);
    expect(r).toEqual(rules);
  });

  it('una predicción dudosa no reemplaza a una regla más segura', () => {
    const rules = [span('RAZON_SOCIAL', text, 'Logística Sur', 'alta')];
    const r = combineModelSpans(rules, [span('NOMBRE_PERSONA', text, 'Logística Sur', 'baja')]);
    expect(r[0]!.type).toBe('RAZON_SOCIAL');
  });
});

describe('analyzeDocument con IA local', () => {
  it('sin modelo da lo mismo que antes; con modelo suma sus hallazgos', () => {
    const text = 'Paciente con diagnóstico de hipotiroidismo, atendida por la doctora Wanda Nara.';
    const base = analyzeDocument([{ text }]);
    expect(base.spans[0]).toEqual(scanText(text));
    const withModel = analyzeDocument([{ text }], [], [], [[span('NOMBRE_PERSONA', text, 'Wanda Nara', 'alta')]]);
    expect(withModel.spans[0]!.some((s) => s.value === 'Wanda Nara')).toBe(true);
  });
});
