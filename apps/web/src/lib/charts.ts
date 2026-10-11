/**
 * Gráficos de una planilla, calculados en el navegador (sin IA y sin mandar nada a ningún lado):
 * qué columnas son fechas, números o categorías, cómo agruparlas y qué gráficos conviene proponer.
 */
import { cellToString, type CellValue, type Table } from '@securedata/detector';

export type ColumnKind = 'fecha' | 'numero' | 'categoria' | 'otro';

export interface ColumnProfile {
  index: number;
  header: string;
  kind: ColumnKind;
  /** Valores no vacíos. */
  filled: number;
  /** Valores distintos (para categorías). */
  distinct: number;
  /** Parece plata: "Monto", "Importe", "Total"… (se muestra con $). */
  money: boolean;
}

export type Operation = 'suma' | 'promedio' | 'conteo';
export type Granularity = 'dia' | 'mes' | 'anio';

export interface ChartSpec {
  /** Columna por la que se agrupa (fecha o categoría). */
  dimension: number;
  /** Columna numérica a sumar o promediar; null = contar filas. */
  measure: number | null;
  operation: Operation;
}

export interface Point {
  label: string;
  value: number;
}

export interface ChartData {
  spec: ChartSpec;
  /** 'tiempo': evolución (columnas o línea, en orden); 'ranking': de mayor a menor. */
  shape: 'tiempo' | 'ranking';
  points: Point[];
  title: string;
  /** Nombre de lo que se agrupa: "Período" o el encabezado de la categoría ("Provincia"). */
  dimensionLabel: string;
  /** Cómo se lee cada valor ("Suma de Monto", "Cantidad de filas"). */
  valueLabel: string;
  money: boolean;
  granularity?: Granularity;
  /** Categorías que quedaron agrupadas en "Otras" (ranking). */
  grouped: number;
}

const MIN_SHARE = 0.8;
const TOP = 10;
const MAX_CATEGORIES = 40;

// Identificadores: aunque sean números, sumarlos o graficarlos no tiene sentido.
const ID_HEADER =
  /\b(dni|cuit|cuil|cbu|cvu|alias|tel[eé]fono|tel|celular|c[oó]digo|cod|id|legajo|cp|c\.p\.|nro|n[uú]mero|factura|comprobante|pedido|orden|tarjeta|patente|a[nñ]o)\b/i;
const MONEY_HEADER = /\b(monto|importe|precio|total|venta|ventas|saldo|sueldo|salario|costo|cobro|pago|deuda|facturado|ingreso|egreso|gasto)s?\b/i;
const NUMBER_TEXT = /^[-+]?(?:\$|ars|usd|u\$s)?\s*[-+]?[\d.,]+\s*%?$/i;

/**
 * Número de una celda, con formato argentino o inglés: "$ 1.250.000", "1.250,50", "1250.5", "15%".
 * null si no es un número.
 */
export function parseNumber(v: CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  if (!s || !NUMBER_TEXT.test(s)) return null;
  let digits = s.replace(/[^\d.,-]/g, '');
  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Con los dos: el último es el decimal ("1.250,50" o "1,250.50").
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    digits = digits.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    // Solo comas: en Argentina es el decimal ("1250,50"); varias, miles en formato inglés.
    digits = digits.match(/,/g)!.length > 1 ? digits.split(',').join('') : digits.replace(',', '.');
  } else if (lastDot >= 0) {
    // Solo puntos: varios o seguido de 3 cifras exactas = miles ("1.250.000", "1.250").
    const parts = digits.split('.');
    if (parts.length > 2 || parts[1]!.length === 3) digits = parts.join('');
  }
  const n = Number(digits);
  return Number.isFinite(n) && digits !== '' && digits !== '-' ? n : null;
}

/** Fecha de una celda: Date de Excel, "2025-03-15", "15/03/2025" o "15/3/25". null si no es una fecha. */
export function parseDate(v: CellValue): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(year, Number(m[2]), Number(m[1])); // día/mes/año, como se escribe acá
  }
  return null;
}

function validDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d && y >= 1900 && y <= 2100 ? date : null;
}

/**
 * Categoría: valores que se repiten (Provincia, Cliente, Producto). Con pocos valores distintos alcanza
 * con que alguno se repita; con muchos, tienen que repetirse bastante: si no, es texto libre
 * ("Observaciones") o nombres que no se repiten.
 */
function isCategory(distinct: number, filled: number): boolean {
  if (distinct < 2) return false;
  if (distinct <= 15) return distinct / filled <= 0.8;
  return distinct <= MAX_CATEGORIES * 5 && distinct / filled <= 0.3;
}

const isEmpty = (v: CellValue) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Qué tiene cada columna. */
export function profileColumns(table: Table): ColumnProfile[] {
  return table.headers.map((header, index) => {
    const values = table.rows.map((r) => r[index]).filter((v): v is NonNullable<CellValue> => !isEmpty(v ?? null));
    const filled = values.length;
    const distinct = new Set(values.map((v) => cellToString(v).trim().toLowerCase())).size;
    const share = (test: (v: CellValue) => boolean) => (filled ? values.filter(test).length / filled : 0);
    let kind: ColumnKind = 'otro';
    if (filled >= 2) {
      if (share((v) => parseDate(v) !== null) >= MIN_SHARE) kind = 'fecha';
      else if (share((v) => parseNumber(v) !== null) >= MIN_SHARE) kind = ID_HEADER.test(header) ? 'otro' : 'numero';
      // Categoría: valores que se repiten (Provincia, Cliente, Producto); texto libre o nombres únicos no.
      else if (!ID_HEADER.test(header) && isCategory(distinct, filled)) kind = 'categoria';
    }
    return { index, header, kind, filled, distinct, money: kind === 'numero' && MONEY_HEADER.test(header) };
  });
}

/** Etiqueta de un período: "15 mar", "mar 25", "2025". */
function periodKey(d: Date, g: Granularity): { key: string; label: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  if (g === 'anio') return { key: `${y}`, label: `${y}` };
  if (g === 'mes') return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }) };
  return {
    key: `${y}-${String(m + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    label: d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }),
  };
}

/** Por día si abarca hasta dos meses, por mes hasta tres años, si no por año. */
export function granularityFor(dates: Date[]): Granularity {
  if (dates.length === 0) return 'mes';
  const times = dates.map((d) => d.getTime());
  const days = (Math.max(...times) - Math.min(...times)) / 86_400_000;
  return days <= 62 ? 'dia' : days <= 3 * 366 ? 'mes' : 'anio';
}

/** Todos los períodos entre el primero y el último (los que no tienen datos van en 0: la evolución no se corta). */
function fillPeriods(first: Date, last: Date, g: Granularity): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const d = new Date(first.getFullYear(), g === 'anio' ? 0 : first.getMonth(), g === 'dia' ? first.getDate() : 1);
  while (d <= last && out.length < 1000) {
    out.push(periodKey(d, g));
    if (g === 'dia') d.setDate(d.getDate() + 1);
    else if (g === 'mes') d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
  }
  return out;
}

function valueLabel(spec: ChartSpec, profiles: ColumnProfile[]): string {
  if (spec.measure === null) return 'Cantidad de filas';
  const h = profiles[spec.measure]!.header;
  return spec.operation === 'promedio' ? `Promedio de ${h}` : `Total de ${h}`;
}

/** Agrupa la planilla según el gráfico pedido. */
export function buildChart(table: Table, profiles: ColumnProfile[], spec: ChartSpec): ChartData {
  const dim = profiles[spec.dimension]!;
  const groups = new Map<string, { label: string; sum: number; count: number }>();
  const add = (key: string, label: string, value: number) => {
    const g = groups.get(key) ?? { label, sum: 0, count: 0 };
    g.sum += value;
    g.count += 1;
    groups.set(key, g);
  };
  const measureOf = (row: CellValue[]) => (spec.measure === null ? 1 : parseNumber(row[spec.measure] ?? null));
  const result = (g: { sum: number; count: number }) =>
    spec.operation === 'promedio' ? (g.count ? g.sum / g.count : 0) : spec.operation === 'conteo' ? g.count : g.sum;
  const label = valueLabel(spec, profiles);
  const money = spec.measure !== null && profiles[spec.measure]!.money && spec.operation !== 'conteo';

  if (dim.kind === 'fecha') {
    const dated = table.rows.map((r) => ({ date: parseDate(r[spec.dimension] ?? null), value: measureOf(r) })).filter((x) => x.date && x.value !== null);
    const granularity = granularityFor(dated.map((x) => x.date!));
    for (const { date, value } of dated) {
      const p = periodKey(date!, granularity);
      add(p.key, p.label, value!);
    }
    const times = dated.map((x) => x.date!.getTime());
    const periods = dated.length ? fillPeriods(new Date(Math.min(...times)), new Date(Math.max(...times)), granularity) : [];
    const points = periods.map((p) => {
      const g = groups.get(p.key);
      return { label: p.label, value: g ? result(g) : 0 };
    });
    const per = granularity === 'dia' ? 'día' : granularity === 'mes' ? 'mes' : 'año';
    return { spec, shape: 'tiempo', points, title: `${label} por ${per}`, dimensionLabel: 'Período', valueLabel: label, money, granularity, grouped: 0 };
  }

  for (const row of table.rows) {
    const value = measureOf(row);
    const raw = row[spec.dimension] ?? null;
    if (value === null || isEmpty(raw)) continue;
    const text = cellToString(raw).trim();
    add(text.toLowerCase(), text, value);
  }
  const sorted = [...groups.values()].map((g) => ({ label: g.label, value: result(g), sum: g.sum, count: g.count })).sort((a, b) => b.value - a.value);
  let points: Point[] = sorted.slice(0, TOP).map(({ label, value }) => ({ label, value }));
  const rest = sorted.slice(TOP);
  // Las que no entran se suman en "Otras" (en un promedio, "Otras" sería engañoso: se dejan afuera).
  if (rest.length && spec.operation !== 'promedio') {
    const other = rest.reduce((n, r) => n + r.value, 0);
    points = [...points, { label: `Otras (${rest.length})`, value: other }];
  }
  const title = sorted.length > TOP ? `${label} por ${dim.header} (las ${TOP} con más)` : `${label} por ${dim.header}`;
  return { spec, shape: 'ranking', points, title, dimensionLabel: dim.header, valueLabel: label, money, grouped: rest.length };
}

/** La columna numérica "principal": la que parece plata, si no la que tiene más valores. */
export function mainMeasure(numbers: ColumnProfile[]): ColumnProfile | undefined {
  return [...numbers].sort((a, b) => Number(b.money) - Number(a.money) || b.filled - a.filled)[0];
}

/** Gráficos que conviene mostrar de entrada (hasta 4), del más útil al menos. */
export function suggestCharts(profiles: ColumnProfile[]): ChartSpec[] {
  const dates = profiles.filter((p) => p.kind === 'fecha');
  const numbers = profiles.filter((p) => p.kind === 'numero');
  // Las categorías con pocos valores distintos se leen mejor; las de un solo valor no dicen nada.
  const categories = profiles.filter((p) => p.kind === 'categoria' && p.distinct >= 2).sort((a, b) => a.distinct - b.distinct);
  const measure = mainMeasure(numbers);
  const out: ChartSpec[] = [];
  const date = dates[0];
  if (date) out.push({ dimension: date.index, measure: measure?.index ?? null, operation: measure ? 'suma' : 'conteo' });
  for (const c of categories) {
    if (out.length >= 4) break;
    out.push({ dimension: c.index, measure: measure?.index ?? null, operation: measure ? 'suma' : 'conteo' });
  }
  if (out.length < 4 && measure && categories[0]) out.push({ dimension: categories[0].index, measure: null, operation: 'conteo' });
  return out.slice(0, 4);
}

export interface Summary {
  header: string;
  money: boolean;
  count: number;
  total: number;
  average: number;
  max: { value: number; row: number };
  min: { value: number; row: number };
}

/** Resumen de una columna numérica. null si no tiene números. */
export function summarize(table: Table, profiles: ColumnProfile[], column: number): Summary | null {
  const values = table.rows
    .map((r, row) => ({ value: parseNumber(r[column] ?? null), row }))
    .filter((x): x is { value: number; row: number } => x.value !== null);
  if (values.length === 0) return null;
  const total = values.reduce((n, x) => n + x.value, 0);
  const max = values.reduce((a, b) => (b.value > a.value ? b : a));
  const min = values.reduce((a, b) => (b.value < a.value ? b : a));
  return { header: profiles[column]!.header, money: profiles[column]!.money, count: values.length, total, average: total / values.length, max, min };
}

/** Variación entre el primer y el último período con datos de una evolución (null si no se puede calcular). */
export function variation(points: Point[]): { from: Point; to: Point; pct: number } | null {
  const withData = points.filter((p) => p.value !== 0);
  if (withData.length < 2) return null;
  const from = withData[0]!;
  const to = withData.at(-1)!;
  return { from, to, pct: ((to.value - from.value) / Math.abs(from.value)) * 100 };
}

/** "1.250.000" o "$ 1.250.000" (sin decimales salvo en números chicos). */
export function formatValue(n: number, money = false): string {
  const abs = Math.abs(n);
  const text = n.toLocaleString('es-AR', { maximumFractionDigits: abs < 10 ? 2 : abs < 1000 ? 1 : 0 });
  return money ? `$ ${text}` : text;
}

// ---------- Comparaciones ----------

export interface PeriodOption {
  key: string;
  label: string;
}

/** Períodos con datos de una columna de fechas (en orden), con la granularidad que corresponde al rango. */
export function periodOptions(table: Table, dateColumn: number): { granularity: Granularity; options: PeriodOption[] } {
  const dates = table.rows.map((r) => parseDate(r[dateColumn] ?? null)).filter((d): d is Date => d !== null);
  const granularity = granularityFor(dates);
  const seen = new Map<string, string>();
  for (const d of dates) {
    const p = periodKey(d, granularity);
    seen.set(p.key, p.label);
  }
  return { granularity, options: [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([key, label]) => ({ key, label })) };
}

/** Valores de una categoría, de los que más filas tienen a los que menos. */
export function categoryOptions(table: Table, column: number): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const row of table.rows) {
    const raw = row[column] ?? null;
    if (isEmpty(raw)) continue;
    const label = cellToString(raw).trim();
    const c = counts.get(label.toLowerCase()) ?? { label, n: 0 };
    c.n += 1;
    counts.set(label.toLowerCase(), c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map((c) => c.label);
}

export interface ComparisonRow {
  label: string;
  a: number;
  b: number;
}

export interface Comparison {
  title: string;
  valueLabel: string;
  money: boolean;
  /** Lo que se compara ("mar 25" y "abr 25", o "Córdoba" y "Salta"). */
  labelA: string;
  labelB: string;
  /** Primera columna de la tabla: "Provincia", "Período" o "" (un solo total). */
  rowLabel: string;
  /** 'tiempo': filas en orden (la evolución de las dos); 'ranking': de mayor a menor. */
  shape: 'tiempo' | 'ranking';
  rows: ComparisonRow[];
  totalA: number;
  totalB: number;
  /** Cuánto cambia B respecto de A, en % (null si A es 0). */
  pct: number | null;
}

interface Measure {
  measure: number | null;
  operation: Operation;
}

/** Suma y cuenta por clave, y devuelve el valor según la operación. */
function accumulator(operation: Operation) {
  const groups = new Map<string, { sum: number; count: number }>();
  return {
    add(key: string, value: number) {
      const g = groups.get(key) ?? { sum: 0, count: 0 };
      g.sum += value;
      g.count += 1;
      groups.set(key, g);
    },
    get(key: string): number {
      const g = groups.get(key);
      if (!g) return 0;
      return operation === 'promedio' ? (g.count ? g.sum / g.count : 0) : operation === 'conteo' ? g.count : g.sum;
    },
  };
}

const measureValue = (row: CellValue[], m: Measure) => (m.measure === null ? 1 : parseNumber(row[m.measure] ?? null));
const changePct = (a: number, b: number) => (a === 0 ? null : ((b - a) / Math.abs(a)) * 100);
const measureLabel = (m: Measure, profiles: ColumnProfile[]) => valueLabel({ dimension: 0, measure: m.measure, operation: m.operation }, profiles);
const isMoney = (m: Measure, profiles: ColumnProfile[]) => m.measure !== null && profiles[m.measure]!.money && m.operation !== 'conteo';

/** Totales de los dos grupos y, si se pide, desglose por una clave de cada fila. */
function compareGroups(
  table: Table,
  m: Measure,
  inA: (row: CellValue[]) => boolean,
  inB: (row: CellValue[]) => boolean,
  keyOf?: (row: CellValue[]) => string | null,
) {
  const acc = accumulator(m.operation);
  for (const row of table.rows) {
    const v = measureValue(row, m);
    if (v === null) continue;
    const key = keyOf?.(row);
    if (inA(row)) {
      acc.add('a', v);
      if (key) acc.add(`a|${key}`, v);
    }
    if (inB(row)) {
      acc.add('b', v);
      if (key) acc.add(`b|${key}`, v);
    }
  }
  return { totalA: acc.get('a'), totalB: acc.get('b'), row: (key: string) => ({ a: acc.get(`a|${key}`), b: acc.get(`b|${key}`) }) };
}

/**
 * Compara dos períodos (dos meses, dos años…), en total o desglosado por una categoría
 * ("Monto por Provincia en marzo y en abril").
 */
export function comparePeriods(table: Table, profiles: ColumnProfile[], o: Measure & { date: number; a: string; b: string; by: number | null }): Comparison {
  const { granularity, options } = periodOptions(table, o.date);
  const label = (key: string) => options.find((p) => p.key === key)?.label ?? key;
  const periodOf = (row: CellValue[]) => {
    const d = parseDate(row[o.date] ?? null);
    return d ? periodKey(d, granularity).key : null;
  };
  const names = new Map<string, string>();
  const keyOf =
    o.by === null
      ? undefined
      : (row: CellValue[]) => {
          const raw = row[o.by!] ?? null;
          if (isEmpty(raw)) return null;
          const name = cellToString(raw).trim();
          names.set(name.toLowerCase(), name);
          return name.toLowerCase();
        };
  const g = compareGroups(
    table,
    o,
    (r) => periodOf(r) === o.a,
    (r) => periodOf(r) === o.b,
    keyOf,
  );
  const rows =
    o.by === null
      ? [{ label: 'Total', a: g.totalA, b: g.totalB }]
      : [...names]
          .map(([key, name]) => ({ label: name, ...g.row(key) }))
          .filter((r) => r.a !== 0 || r.b !== 0)
          .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b))
          .slice(0, TOP);
  const by = o.by !== null ? profiles[o.by]!.header : '';
  const measure = measureLabel(o, profiles);
  return {
    title: `${measure}${by ? ` por ${by}` : ''}: ${label(o.a)} y ${label(o.b)}`,
    valueLabel: measure,
    money: isMoney(o, profiles),
    labelA: label(o.a),
    labelB: label(o.b),
    rowLabel: by,
    shape: 'ranking',
    rows,
    totalA: g.totalA,
    totalB: g.totalB,
    pct: changePct(g.totalA, g.totalB),
  };
}

/** Compara dos valores de una categoría ("Córdoba" y "Salta"): su evolución si hay fechas, si no el total. */
export function compareCategories(
  table: Table,
  profiles: ColumnProfile[],
  o: Measure & { column: number; a: string; b: string; date: number | null },
): Comparison {
  const is = (value: string) => (row: CellValue[]) =>
    cellToString(row[o.column] ?? null)
      .trim()
      .toLowerCase() === value.toLowerCase();
  const periods = o.date !== null ? periodOptions(table, o.date) : null;
  const keyOf = periods
    ? (row: CellValue[]) => {
        const d = parseDate(row[o.date!] ?? null);
        return d ? periodKey(d, periods.granularity).key : null;
      }
    : undefined;
  const g = compareGroups(table, o, is(o.a), is(o.b), keyOf);
  const rows = periods ? periods.options.map((p) => ({ label: p.label, ...g.row(p.key) })) : [{ label: 'Total', a: g.totalA, b: g.totalB }];
  const measure = measureLabel(o, profiles);
  return {
    title: `${measure}${periods ? ' por período' : ''}: ${o.a} y ${o.b}`,
    valueLabel: measure,
    money: isMoney(o, profiles),
    labelA: o.a,
    labelB: o.b,
    rowLabel: periods ? 'Período' : '',
    shape: periods ? 'tiempo' : 'ranking',
    rows,
    totalA: g.totalA,
    totalB: g.totalB,
    pct: changePct(g.totalA, g.totalB),
  };
}
