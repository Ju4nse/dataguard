import { describe, expect, it } from 'vitest';
import type { Table } from '@securedata/detector';
import {
  buildChart,
  categoryOptions,
  compareCategories,
  comparePeriods,
  formatValue,
  granularityFor,
  parseDate,
  parseNumber,
  periodOptions,
  profileColumns,
  suggestCharts,
  summarize,
  variation,
} from './charts';

describe('parseNumber', () => {
  it('entiende el formato argentino y el inglés', () => {
    const cases: [string | number, number][] = [
      ['$ 1.250.000', 1250000],
      ['1.250,50', 1250.5],
      ['1,250.50', 1250.5],
      ['1250,5', 1250.5],
      ['1250.5', 1250.5],
      ['1.250', 1250],
      ['-3.000', -3000],
      ['15%', 15],
      ['USD 300', 300],
      [42, 42],
    ];
    for (const [input, expected] of cases) expect(parseNumber(input), String(input)).toBe(expected);
  });

  it('lo que no es un número da null', () => {
    for (const v of ['Ferretería', '15/03/2025', '', 'abc123', null, '-']) expect(parseNumber(v), String(v)).toBeNull();
  });
});

describe('parseDate', () => {
  it('fechas de Excel, ISO y día/mes/año', () => {
    expect(parseDate('2025-03-15')?.getMonth()).toBe(2);
    expect(parseDate('15/03/2025')?.getDate()).toBe(15);
    expect(parseDate('5/3/25')?.getFullYear()).toBe(2025);
    expect(parseDate(new Date(2025, 0, 1))?.getFullYear()).toBe(2025);
  });

  it('una fecha imposible o un texto no son fechas', () => {
    for (const v of ['31/02/2025', '2025-13-01', 'marzo', '1250', 45918]) expect(parseDate(v), String(v)).toBeNull();
  });
});

const VENTAS: Table = {
  headers: ['Fecha', 'Cliente', 'Provincia', 'DNI contacto', 'Monto', 'Observaciones'],
  rows: [
    ['2025-01-10', 'Ferretería Central', 'Córdoba', '30.123.456', '$ 100.000', 'Entregar a la mañana'],
    ['2025-01-20', 'Lácteos Norte', 'Santa Fe', '28.111.222', '$ 50.000', 'Llamar antes'],
    ['2025-02-05', 'Ferretería Central', 'Córdoba', '30.123.456', '$ 200.000', 'Sin novedades'],
    ['2025-04-01', 'Agro Pampa', 'Córdoba', '25.876.543', '$ 30.000', 'Factura A'],
    ['2025-04-15', 'Lácteos Norte', 'Santa Fe', '28.111.222', '$ 70.000', 'Pagó con transferencia'],
  ],
};

describe('profileColumns', () => {
  const p = profileColumns(VENTAS);

  it('reconoce fechas, plata, categorías y deja afuera identificadores y texto libre', () => {
    expect(p.map((c) => c.kind)).toEqual(['fecha', 'categoria', 'categoria', 'otro', 'numero', 'otro']);
    expect(p[4]!.money).toBe(true);
  });

  it('texto libre con algunas frases repetidas ("Sin novedades") tampoco', () => {
    const notes = Array.from({ length: 80 }, (_, i) => (i % 2 ? 'Sin novedades' : `Llamar al cliente ${i}`));
    expect(profileColumns({ headers: ['Observaciones'], rows: notes.map((n) => [n]) })[0]!.kind).toBe('otro');
  });

  it('una columna de nombres que no se repiten no es una categoría', () => {
    const t: Table = { headers: ['Nombre'], rows: Array.from({ length: 60 }, (_, i) => [`Persona ${i}`]) };
    expect(profileColumns(t)[0]!.kind).toBe('otro');
  });
});

describe('buildChart', () => {
  const p = profileColumns(VENTAS);

  it('evolución por mes, con los meses sin datos en 0', () => {
    const c = buildChart(VENTAS, p, { dimension: 0, measure: 4, operation: 'suma' });
    expect(c.shape).toBe('tiempo');
    expect(c.granularity).toBe('mes');
    expect(c.points.map((x) => x.value)).toEqual([150000, 200000, 0, 100000]);
    expect(c.title).toBe('Total de Monto por mes');
    expect(c.money).toBe(true);
  });

  it('ranking por categoría, de mayor a menor', () => {
    const c = buildChart(VENTAS, p, { dimension: 1, measure: 4, operation: 'suma' });
    expect(c.points).toEqual([
      { label: 'Ferretería Central', value: 300000 },
      { label: 'Lácteos Norte', value: 120000 },
      { label: 'Agro Pampa', value: 30000 },
    ]);
  });

  it('promedio y conteo', () => {
    expect(buildChart(VENTAS, p, { dimension: 2, measure: 4, operation: 'promedio' }).points[0]).toEqual({ label: 'Córdoba', value: 110000 });
    expect(buildChart(VENTAS, p, { dimension: 2, measure: null, operation: 'conteo' }).points).toEqual([
      { label: 'Córdoba', value: 3 },
      { label: 'Santa Fe', value: 2 },
    ]);
  });

  it('más de 10 categorías: las 10 con más y el resto en "Otras"', () => {
    const t: Table = { headers: ['Producto', 'Monto'], rows: Array.from({ length: 30 }, (_, i) => [`P${i % 14}`, String(i + 1)]) };
    const c = buildChart(t, profileColumns(t), { dimension: 0, measure: 1, operation: 'suma' });
    expect(c.points).toHaveLength(11);
    expect(c.points.at(-1)!.label).toBe('Otras (4)');
    expect(c.points.reduce((n, x) => n + x.value, 0)).toBe((30 * 31) / 2);
  });
});

describe('suggestCharts', () => {
  it('propone la evolución de la plata y los rankings por categoría', () => {
    const s = suggestCharts(profileColumns(VENTAS));
    expect(s[0]).toEqual({ dimension: 0, measure: 4, operation: 'suma' });
    expect(s.slice(1).map((x) => x.dimension)).toEqual(expect.arrayContaining([1, 2]));
  });

  it('sin columnas numéricas cuenta filas', () => {
    const t: Table = { headers: ['Provincia'], rows: [['Córdoba'], ['Córdoba'], ['Salta']] };
    expect(suggestCharts(profileColumns(t))).toEqual([{ dimension: 0, measure: null, operation: 'conteo' }]);
  });
});

describe('resumen', () => {
  it('total, promedio, máximo y mínimo', () => {
    const s = summarize(VENTAS, profileColumns(VENTAS), 4)!;
    expect(s).toMatchObject({ count: 5, total: 450000, average: 90000, max: { value: 200000, row: 2 }, min: { value: 30000, row: 3 } });
  });

  it('variación entre el primer y el último período con datos', () => {
    expect(
      variation([
        { label: 'ene', value: 100 },
        { label: 'feb', value: 0 },
        { label: 'mar', value: 150 },
      ])?.pct,
    ).toBe(50);
    expect(variation([{ label: 'ene', value: 100 }])).toBeNull();
  });

  it('formato de números', () => {
    expect(formatValue(1250000, true)).toBe('$ 1.250.000');
    expect(formatValue(3.456)).toBe('3,46');
  });

  it('granularidad según el rango de fechas', () => {
    const d = (s: string) => parseDate(s)!;
    expect(granularityFor([d('2025-01-01'), d('2025-02-15')])).toBe('dia');
    expect(granularityFor([d('2025-01-01'), d('2026-06-01')])).toBe('mes');
    expect(granularityFor([d('2019-01-01'), d('2025-06-01')])).toBe('anio');
  });
});

describe('comparaciones', () => {
  const p = profileColumns(VENTAS);

  it('lista los períodos con datos y los valores de una categoría', () => {
    expect(periodOptions(VENTAS, 0).options.map((o) => o.key)).toEqual(['2025-01', '2025-02', '2025-04']);
    expect(categoryOptions(VENTAS, 2)).toEqual(['Córdoba', 'Santa Fe']);
  });

  it('dos períodos, desglosados por provincia', () => {
    const c = comparePeriods(VENTAS, p, { date: 0, a: '2025-01', b: '2025-04', by: 2, measure: 4, operation: 'suma' });
    expect(c.rows).toEqual([
      { label: 'Córdoba', a: 100000, b: 30000 },
      { label: 'Santa Fe', a: 50000, b: 70000 },
    ]);
    expect([c.totalA, c.totalB]).toEqual([150000, 100000]);
    expect(c.pct).toBeCloseTo(-33.33, 1);
    expect(c.rowLabel).toBe('Provincia');
  });

  it('dos períodos en total (sin desglose)', () => {
    const c = comparePeriods(VENTAS, p, { date: 0, a: '2025-01', b: '2025-02', by: null, measure: null, operation: 'conteo' });
    expect(c.rows).toEqual([{ label: 'Total', a: 2, b: 1 }]);
    expect(c.pct).toBe(-50);
  });

  it('dos categorías: su evolución si hay fechas', () => {
    const c = compareCategories(VENTAS, p, { column: 2, a: 'Córdoba', b: 'santa fe', date: 0, measure: 4, operation: 'suma' });
    expect(c.shape).toBe('tiempo');
    expect(c.rows.map((r) => [r.a, r.b])).toEqual([
      [100000, 50000],
      [200000, 0],
      [30000, 70000],
    ]);
    expect([c.totalA, c.totalB]).toEqual([330000, 120000]);
  });

  it('dos categorías sin fechas: el total de cada una', () => {
    const c = compareCategories(VENTAS, p, { column: 1, a: 'Ferretería Central', b: 'Lácteos Norte', date: null, measure: 4, operation: 'promedio' });
    expect(c.rows).toEqual([{ label: 'Total', a: 150000, b: 60000 }]);
  });
});
