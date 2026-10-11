import { useRef, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { chartFileName, downloadChartImage } from '../../lib/chartImage';
import { formatValue, type ChartData, type Comparison, type Point } from '../../lib/charts';
import { useStore } from '../../store';
import { Card, Icon, prefersReducedMotion } from '../ui';

/** Piezas comunes de los gráficos: marco con vista de tabla e imagen, tooltip y los tres tipos de gráfico. */

export const AXIS_TICK = { fill: 'var(--ink-muted)', fontSize: 12 };
/** Con "menos movimiento" pedido en el sistema, los gráficos aparecen sin animación. */
export const animate = () => !prefersReducedMotion();
const CURSOR = { fill: 'rgba(42,120,214,0.06)' };
/** Más períodos que esto se leen mejor como línea que como columnas. */
const MAX_COLUMNS = 36;
/** Colores de las series (paleta validada para daltonismo; el orden es fijo: la primera siempre azul). */
export const SERIES = ['var(--series-1)', 'var(--series-2)'] as const;

/** Eje con números cortos: "1,2 M", "350 k". */
export const shortNumber = (money: boolean) => (n: number) => {
  const abs = Math.abs(n);
  const text =
    abs >= 1e6
      ? `${(n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
      : abs >= 1e3
        ? `${(n / 1e3).toLocaleString('es-AR', { maximumFractionDigits: 1 })} k`
        : n.toLocaleString('es-AR');
  return money ? `$ ${text}` : text;
};

const smallButton =
  'inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 sm:min-h-8';

export interface FrameTable {
  headers: string[];
  rows: string[][];
}

/**
 * Marco de un gráfico: título, leyenda (si hay dos series), vista de tabla (los valores nunca dependen
 * solo del color ni del tooltip) y descarga como imagen.
 */
export function ChartFrame({
  title,
  note,
  legend,
  table,
  empty,
  bare = false,
  children,
}: {
  title: string;
  note?: ReactNode;
  legend?: { label: string; color: string }[];
  table: FrameTable;
  empty?: boolean;
  bare?: boolean;
  children: ReactNode;
}) {
  const fileName = useStore((s) => s.fileName);
  const [asTable, setAsTable] = useState(false);
  const [saving, setSaving] = useState<'' | 'guardando' | 'error'>('');
  const chartRef = useRef<HTMLDivElement>(null);

  const saveImage = async () => {
    if (!chartRef.current) return;
    setSaving('guardando');
    try {
      // La leyenda se dibuja con los colores reales (en la página son variables CSS).
      const root = getComputedStyle(document.documentElement);
      const resolved = legend?.map((l) => ({ label: l.label, color: l.color.replace(/var\((--[\w-]+)\)/, (_, v: string) => root.getPropertyValue(v).trim()) }));
      await downloadChartImage(chartRef.current, { title, legend: resolved, fileName: chartFileName(fileName, title) });
      setSaving('');
    } catch {
      setSaving('error');
    }
  };

  const body = (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {note && <p className="text-xs text-slate-500">{note}</p>}
        </div>
        <div className="-mr-2 -mt-2 flex shrink-0 items-center">
          {!asTable && !empty && (
            <button type="button" onClick={saveImage} disabled={saving === 'guardando'} className={smallButton} title="Descargar el gráfico como imagen (PNG)">
              <Icon name="download" className="h-3.5 w-3.5" />
              {saving === 'error' ? 'No se pudo' : 'Imagen'}
            </button>
          )}
          <button type="button" onClick={() => setAsTable((v) => !v)} className={smallButton}>
            {asTable ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        </div>
      </div>
      {legend && legend.length > 1 && !asTable && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700" aria-label="Referencias">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: l.color }} aria-hidden="true" />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {empty ? (
        <p className="text-sm text-slate-500">No hay valores para graficar con esta combinación.</p>
      ) : asTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                {table.headers.map((h, i) => (
                  <th key={i} className={`pb-2 font-medium ${i > 0 ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={`py-1.5 ${j > 0 ? 'text-right tabular-nums' : ''}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={chartRef}>{children}</div>
      )}
    </>
  );
  return bare ? <div className="flex flex-col">{body}</div> : <Card className="flex flex-col p-5">{body}</Card>;
}

/** Tooltip de los gráficos (Recharts le pasa active, payload y label): una línea por serie. */
export function ChartTooltip({ active, payload, label, money, names }: Partial<TooltipContentProps<number, string>> & { money: boolean; names: string[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="text-slate-600">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 font-semibold text-slate-900">
          {payload.length > 1 && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i] }} aria-hidden="true" />}
          {formatValue(Number(p.value), money)} <span className="font-normal text-slate-600">· {names[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Una serie ----------

/** Gráfico de una serie: evolución (columnas o línea) o ranking. */
export function ChartCard({ chart, bare = false }: { chart: ChartData; bare?: boolean }) {
  return (
    <ChartFrame
      title={chart.title}
      bare={bare}
      note={chart.grouped > 0 && chart.spec.operation === 'promedio' ? 'Se muestran las 10 con el promedio más alto.' : undefined}
      empty={chart.points.length === 0}
      table={{ headers: [chart.dimensionLabel, chart.valueLabel], rows: chart.points.map((p) => [p.label, formatValue(p.value, chart.money)]) }}
    >
      {chart.shape === 'tiempo' ? (
        <TimeSeries data={chart.points} keys={['value']} names={[chart.valueLabel]} money={chart.money} />
      ) : (
        <Ranking data={chart.points} keys={['value']} names={[chart.valueLabel]} money={chart.money} />
      )}
    </ChartFrame>
  );
}

// ---------- Dos series (comparaciones) ----------

/** Comparación: dos series con leyenda; si es un solo total, dos barras con su nombre en el eje. */
export function ComparisonChart({ cmp }: { cmp: Comparison }) {
  const pct = (a: number, b: number) =>
    a === 0 ? '—' : `${b >= a ? '+' : ''}${(((b - a) / Math.abs(a)) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`;
  const single = cmp.rows.length === 1;
  const table: FrameTable = {
    headers: [cmp.rowLabel || ' ', cmp.labelA, cmp.labelB, 'Diferencia'],
    rows: cmp.rows.map((r) => [r.label, formatValue(r.a, cmp.money), formatValue(r.b, cmp.money), pct(r.a, r.b)]),
  };
  const empty = cmp.rows.every((r) => r.a === 0 && r.b === 0);
  const totals: Point[] = [
    { label: cmp.labelA, value: cmp.totalA },
    { label: cmp.labelB, value: cmp.totalB },
  ];
  return (
    <ChartFrame
      title={cmp.title}
      bare
      empty={empty}
      table={table}
      legend={
        single
          ? undefined
          : [
              { label: cmp.labelA, color: SERIES[0] },
              { label: cmp.labelB, color: SERIES[1] },
            ]
      }
    >
      {single ? (
        <Ranking data={totals} keys={['value']} names={[cmp.valueLabel]} money={cmp.money} colorByRow />
      ) : cmp.shape === 'tiempo' ? (
        <TimeSeries data={cmp.rows} keys={['a', 'b']} names={[cmp.labelA, cmp.labelB]} money={cmp.money} />
      ) : (
        <Ranking data={cmp.rows} keys={['a', 'b']} names={[cmp.labelA, cmp.labelB]} money={cmp.money} />
      )}
    </ChartFrame>
  );
}

// ---------- Gráficos ----------

/** Una fila del gráfico: su etiqueta y los valores de cada serie (las claves que se grafican). */
type Row = { label: string };

/** Evolución en el tiempo: columnas si son pocos períodos, líneas si son muchos (una o dos series). */
function TimeSeries({ data, keys, names, money }: { data: Row[]; keys: string[]; names: string[]; money: boolean }) {
  const tooltip = (
    <Tooltip
      content={<ChartTooltip money={money} names={names} />}
      cursor={keys.length > 1 || data.length > MAX_COLUMNS ? { stroke: 'var(--axis)' } : CURSOR}
    />
  );
  const xAxis = <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={12} />;
  const yAxis = <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={money ? 64 : 48} tickFormatter={shortNumber(money)} />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        {data.length <= MAX_COLUMNS ? (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={keys.length > 1 ? '20%' : '30%'} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            {xAxis}
            {yAxis}
            {tooltip}
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} name={names[i]} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={animate()} />
            ))}
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            {xAxis}
            {yAxis}
            {tooltip}
            {keys.map((k, i) => (
              <Line
                key={k}
                dataKey={k}
                name={names[i]}
                stroke={SERIES[i]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={animate()}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Ranking horizontal: nombres largos legibles y el valor al final de cada barra (una o dos series). */
function Ranking({ data, keys, names, money, colorByRow = false }: { data: Row[]; keys: string[]; names: string[]; money: boolean; colorByRow?: boolean }) {
  const perRow = keys.length > 1 ? 44 : 36;
  const height = Math.max(120, data.length * perRow + 16);
  const labelWidth = Math.min(170, Math.max(56, ...data.map((d) => d.label.length * 7 + 12)));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: money ? 84 : 56, bottom: 0, left: 0 }} barCategoryGap={8} barGap={2}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ ...AXIS_TICK, fill: 'var(--ink-secondary)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--axis)' }}
            width={labelWidth}
          />
          <Tooltip content={<ChartTooltip money={money} names={names} />} cursor={CURSOR} />
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              name={names[i]}
              fill={SERIES[i]}
              radius={[0, 4, 4, 0]}
              maxBarSize={keys.length > 1 ? 14 : 18}
              isAnimationActive={animate()}
            >
              {colorByRow && data.map((_, r) => <Cell key={r} fill={SERIES[r % SERIES.length]} />)}
              <LabelList dataKey={k} position="right" formatter={(v) => shortNumber(money)(Number(v))} style={{ fill: 'var(--ink-secondary)', fontSize: 12 }} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
