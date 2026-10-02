import { describe, expect, it } from 'vitest';
import { evaluate } from '../eval/evaluate';

/**
 * Red de seguridad: si un cambio empeora la detección sobre el corpus, este test falla.
 * Si un cambio la mejora, subí los umbrales.
 */
describe('calidad del detector sobre el corpus etiquetado', () => {
  it('set de desarrollo: sin falsos positivos y sin datos perdidos', () => {
    const r = evaluate('desarrollo');
    expect(r.mistakes).toEqual([]);
  });

  it('set de validación: precisión ≥ 95% y cobertura ≥ 90%', () => {
    const { overall } = evaluate('validacion');
    expect(overall.precision).toBeGreaterThanOrEqual(0.95);
    expect(overall.recall).toBeGreaterThanOrEqual(0.9);
  });

  it('columnas: todas clasificadas correctamente', () => {
    expect(evaluate().table.mistakes).toEqual([]);
  });
});
