import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { cellToString, type Table } from '@securedata/detector';
import {
  buildChart,
  formatValue,
  mainMeasure,
  parseDate,
  profileColumns,
  suggestCharts,
  summarize,
  variation,
  type ChartData,
  type ChartSpec,
  type ColumnProfile,
  type Operation,
} from '../lib/charts';
import { useStore } from '../store';
import { Button, Card, Icon, prefersReducedMotion, selectClass } from './ui';

/**
 * Gráficos de la planilla: se calculan en el navegador, sin IA y sin mandar nada. Por defecto con los
 * datos reales (nadie más los ve); con seudónimos, para compartir una captura sin datos sensibles.
 */
export default function ChartsStep() {
  const { result, sheets, sheetIndex, fileName, backToResult } = useStore();
  const [source, setSource] = useState<'real' | 'protegida'>('real');
  const original = sheets[sheetIndex];
  if (!result || !original) return null;
  const table = source === 'real' ? original : result.table;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-3" onClick={backToResult}>
            <Icon name="arrowLeft" className="h-4 w-4" />
            Volver al resultado
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gráficos de tu planilla</h1>
          <p className="flex items-start gap-1.5 text-sm text-slate-600">
            <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            {fileName}
            {sheets.length > 1 ? ` · hoja ${original.name}` : ''}. Se calculan en tu navegador: ningún dato sale de tu computadora.
          </p>
        </div>
        <div className="space-y-1">
          <div role="group" aria-label="Datos del gráfico" className="inline-flex rounded-lg bg-slate-100 p-1">
            {(
              [
                ['real', 'Nombres reales'],
                ['protegida', 'Con seudónimos'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={source === value}
                onClick={() => setSource(value)}
                className={`min-h-10 rounded-md px-3 text-sm font-medium transition-colors sm:min-h-9 ${source === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">{source === 'real' ? 'Solo vos los ves.' : 'Para compartir una captura sin datos sensibles.'}</p>
        </div>
      </div>
      {/* Al cambiar de datos se arma todo de nuevo (las columnas pueden cambiar: la versión protegida puede no tener algunas). */}
      <ChartsView key={source} table={table} />
    </div>
  );
}

function ChartsView({ table }: { table: Table }) {
  const profiles = useMemo(() => profileColumns(table), [table]);
  const charts = useMemo(() => suggestCharts(profiles).map((s) => buildChart(table, profiles, s)), [table, profiles]);
  const dimensions = profiles.filter((p) => p.kind === 'fecha' || p.kind === 'categoria');

  if (dimensions.length === 0) {
    return (
      <Card className="space-y-2 p-6">
        <h2 className="font-semibold text-slate-900">No encontramos qué graficar en esta hoja</h2>
        <p className="text-sm text-slate-600">
          Hace falta una columna con fechas o con valores que se repiten (Provincia, Cliente, Producto…) y, si querés sumar, otra con números (Monto, Cantidad).
          Las columnas de identificadores (DNI, CUIT, teléfono) no se grafican.
        </p>
      </Card>
    );
  }

  const time = charts.find((c) => c.shape === 'tiempo');
  return (
    <>
      <SummaryCards table={table} profiles={profiles} time={time} />
      <div className="grid gap-6 lg:grid-cols-2">
        {charts.map((c) => (
          <ChartCard key={`${c.spec.dimension}-${c.spec.measure}-${c.spec.operation}`} chart={c} />
        ))}
      </div>
      <Builder table={table} profiles={profiles} dimensions={dimensions} initial={charts[0]?.spec} />
    </>
  );
}

// ---------- Resumen ----------

function SummaryCards({ table, profiles, time }: { table: Table; profiles: ColumnProfile[]; time?: ChartData }) {
  const measure = mainMeasure(profiles.filter((p) => p.kind === 'numero'));
  const summary = measure ? summarize(table, profiles, measure.index) : null;
  if (!summary) return null;
  const date = profiles.find((p) => p.kind === 'fecha');
  const category = profiles.filter((p) => p.kind === 'categoria').sort((a, b) => b.distinct - a.distinct)[0];
  // De qué fila es el máximo o el mínimo: "Ferretería Central · 12/03/2025".
  const describe = (row: number) =>
    [category && cellToString(table.rows[row]?.[category.index] ?? null), date && parseDate(table.rows[row]?.[date.index] ?? null)?.toLocaleDateString('es-AR')]
      .filter(Boolean)
      .join(' · ');
  const change = time && time.spec.measure === measure?.index ? variation(time.points) : null;
  const items: { label: string; value: string; detail?: string }[] = [
    { label: `Total de ${summary.header}`, value: formatValue(summary.total, summary.money), detail: `${summary.count.toLocaleString('es-AR')} filas` },
    { label: 'Promedio', value: formatValue(summary.average, summary.money), detail: 'por fila' },
    { label: 'Máximo', value: formatValue(summary.max.value, summary.money), detail: describe(summary.max.row) },
    { label: 'Mínimo', value: formatValue(summary.min.value, summary.money), detail: describe(summary.min.row) },
  ];
  return (
    <section aria-label="Resumen" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((it) => (
          <Card key={it.label} className="p-4">
            <p className="text-xs font-medium text-slate-600">{it.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-2xl">{it.value}</p>
            {it.detail && <p className="mt-0.5 truncate text-xs text-slate-500">{it.detail}</p>}
          </Card>
        ))}
      </div>
      {change && (
        <p className="text-sm text-slate-700">
          {change.pct >= 0 ? 'Subió' : 'Bajó'}{' '}
          <strong className="tabular-nums">{Math.abs(change.pct).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %</strong> entre {change.from.label} (
          {formatValue(change.from.value, summary.money)}) y {change.to.label} ({formatValue(change.to.value, summary.money)}).
        </p>
      )}
    </section>
  );
}

// ---------- Gráficos ----------

const AXIS_TICK = { fill: 'var(--ink-muted)', fontSize: 12 };
/** Con "menos movimiento" pedido en el sistema, los gráficos aparecen sin animación. */
const animate = () => !prefersReducedMotion();
const CURSOR = { fill: 'rgba(42,120,214,0.06)' };
/** Más períodos que esto se leen mejor como línea que como columnas. */
const MAX_COLUMNS = 36;

/** Tarjeta con su vista de tabla: los valores nunca dependen solo del gráfico (ni del color). */
function ChartCard({ chart, bare = false }: { chart: ChartData; bare?: boolean }) {
  const [asTable, setAsTable] = useState(false);
  const body = (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{chart.title}</h2>
          {chart.grouped > 0 && chart.spec.operation === 'promedio' && <p className="text-xs text-slate-500">Se muestran las 10 con el promedio más alto.</p>}
        </div>
        <div className="-mr-2 -mt-2 flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:min-h-8"
          >
            {asTable ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        </div>
      </div>
      {chart.points.length === 0 ? (
        <p className="text-sm text-slate-500">No hay valores para graficar con esta combinación.</p>
      ) : asTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{chart.dimensionLabel}</th>
                <th className="pb-2 text-right font-medium">{chart.valueLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chart.points.map((p, i) => (
                <tr key={i}>
                  <td className="py-1.5">{p.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatValue(p.value, chart.money)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : chart.shape === 'tiempo' ? (
        <TimeChart chart={chart} />
      ) : (
        <RankingChart chart={chart} />
      )}
    </>
  );
  return bare ? <div className="flex flex-col">{body}</div> : <Card className="flex flex-col p-5">{body}</Card>;
}

/** Tooltip de los gráficos (Recharts le pasa active, payload y label). */
function ChartTooltip({ active, payload, label, chart }: Partial<TooltipContentProps<number, string>> & { chart: ChartData }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="text-slate-600">{label}</div>
      <div className="font-semibold text-slate-900">
        {formatValue(Number(payload[0]!.value), chart.money)} <span className="font-normal text-slate-600">· {chart.valueLabel}</span>
      </div>
    </div>
  );
}

/** Eje con números cortos: "1,2 M", "350 k". */
const shortNumber = (money: boolean) => (n: number) => {
  const abs = Math.abs(n);
  const text =
    abs >= 1e6
      ? `${(n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
      : abs >= 1e3
        ? `${(n / 1e3).toLocaleString('es-AR', { maximumFractionDigits: 1 })} k`
        : n.toLocaleString('es-AR');
  return money ? `$ ${text}` : text;
};

/** Evolución: una sola serie → un color, sin leyenda (el título la nombra). Columnas si son pocos períodos, línea si son muchos. */
function TimeChart({ chart }: { chart: ChartData }) {
  const axis = {
    x: <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={12} />,
    y: <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={chart.money ? 64 : 48} tickFormatter={shortNumber(chart.money)} />,
  };
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        {chart.points.length <= MAX_COLUMNS ? (
          <BarChart data={chart.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            {axis.x}
            {axis.y}
            <Tooltip content={<ChartTooltip chart={chart} />} cursor={CURSOR} />
            <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={animate()} />
          </BarChart>
        ) : (
          <LineChart data={chart.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            {axis.x}
            {axis.y}
            <Tooltip content={<ChartTooltip chart={chart} />} cursor={{ stroke: 'var(--axis)' }} />
            <Line
              dataKey="value"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={animate()}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Ranking horizontal: nombres largos legibles y el valor al final de cada barra. */
function RankingChart({ chart }: { chart: ChartData }) {
  const height = Math.max(120, chart.points.length * 36 + 16);
  const labelWidth = Math.min(170, Math.max(56, ...chart.points.map((d) => d.label.length * 7 + 12)));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart.points} layout="vertical" margin={{ top: 0, right: chart.money ? 84 : 56, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ ...AXIS_TICK, fill: 'var(--ink-secondary)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--axis)' }}
            width={labelWidth}
          />
          <Tooltip content={<ChartTooltip chart={chart} />} cursor={CURSOR} />
          <Bar dataKey="value" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={animate()}>
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v) => shortNumber(chart.money)(Number(v))}
              style={{ fill: 'var(--ink-secondary)', fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Armá tu gráfico ----------

const OPERATIONS: [Operation, string][] = [
  ['suma', 'Total'],
  ['promedio', 'Promedio'],
];

function Builder({ table, profiles, dimensions, initial }: { table: Table; profiles: ColumnProfile[]; dimensions: ColumnProfile[]; initial?: ChartSpec }) {
  const numbers = profiles.filter((p) => p.kind === 'numero');
  const [spec, setSpec] = useState<ChartSpec>(() => initial ?? { dimension: dimensions[0]!.index, measure: null, operation: 'conteo' });
  const chart = useMemo(() => buildChart(table, profiles, spec), [table, profiles, spec]);
  const kindLabel = (p: ColumnProfile) => (p.kind === 'fecha' ? 'fecha' : 'categoría');

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Icon name="chart" className="h-5 w-5 text-brand-700" />
          Armá tu gráfico
        </h2>
        <p className="text-sm text-slate-600">Elegí cómo agrupar y qué medir. Con una fecha se ve la evolución; con una categoría, un ranking.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Agrupar por</span>
          <select className={selectClass} value={spec.dimension} onChange={(e) => setSpec((s) => ({ ...s, dimension: Number(e.target.value) }))}>
            {dimensions.map((p) => (
              <option key={p.index} value={p.index}>
                {p.header} ({kindLabel(p)})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Medir</span>
          <select
            className={selectClass}
            value={spec.measure ?? ''}
            onChange={(e) => {
              const measure = e.target.value === '' ? null : Number(e.target.value);
              setSpec((s) => ({ ...s, measure, operation: measure === null ? 'conteo' : s.operation === 'conteo' ? 'suma' : s.operation }));
            }}
          >
            <option value="">Cantidad de filas</option>
            {numbers.map((p) => (
              <option key={p.index} value={p.index}>
                {p.header}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-1.5 text-sm font-medium text-slate-700" disabled={spec.measure === null}>
          <legend className="mb-1.5">Cálculo</legend>
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {OPERATIONS.map(([op, label]) => (
              <button
                key={op}
                type="button"
                aria-pressed={spec.operation === op}
                onClick={() => setSpec((s) => ({ ...s, operation: op }))}
                className={`min-h-10 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 ${spec.operation === op ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="border-t border-slate-100 pt-5">
        <ChartCard chart={chart} bare />
      </div>
    </Card>
  );
}
