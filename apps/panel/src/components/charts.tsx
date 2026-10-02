import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { Card } from './ui';

export const fmt = (n: number) => n.toLocaleString('es-AR');

const AXIS_TICK = { fill: 'var(--ink-muted)', fontSize: 12 };

/** Tarjeta de gráfico con su vista de tabla (los valores nunca dependen solo del color ni del tooltip). */
export function ChartCard({ title, subtitle, table, children }: { title: string; subtitle?: string; table: { headers: string[]; rows: (string | number)[][] }; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink-primary)]">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--ink-secondary)]">{subtitle}</p>}
        </div>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="-mr-2 -mt-2 inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs font-medium text-[var(--ink-secondary)] hover:bg-slate-100 hover:text-slate-900 sm:min-h-8">
          {asTable ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-muted)]">
              <tr>
                {table.headers.map((h, i) => (
                  <th key={h} className={`pb-2 font-medium ${i > 0 ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--grid)]">
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={`py-1.5 ${j > 0 ? 'text-right tabular-nums' : ''}`}>
                      {typeof c === 'number' ? fmt(c) : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </Card>
  );
}

function ChartTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="text-[var(--ink-secondary)]">{label}</div>
      <div className="font-semibold text-[var(--ink-primary)]">{fmt(Number(payload[0]!.value))} detecciones</div>
    </div>
  );
}

/** Evolución mensual: una sola serie → un solo color, sin leyenda (el título la nombra). */
export function MonthlyColumns({ data }: { data: { label: string; value: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="35%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={fmt} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
          <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranking horizontal (tipos de dato, áreas): nombres largos legibles, valor al final de cada barra. */
export function RankingBars({ data }: { data: { label: string; value: number }[] }) {
  // Filas de 36px: barras finas pero con área táctil cómoda para el tooltip.
  const height = Math.max(120, data.length * 36 + 16);
  // El eje de nombres ocupa lo que necesita la etiqueta más larga (en celular cada píxel cuenta).
  const labelWidth = Math.min(170, Math.max(56, ...data.map((d) => d.label.length * 7 + 12)));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tick={{ ...AXIS_TICK, fill: 'var(--ink-secondary)' }} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} width={labelWidth} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
          <Bar dataKey="value" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18}>
            <LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v))} style={{ fill: 'var(--ink-secondary)', fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Acciones tomadas: parte de un todo con 3 categorías → una barra apilada al 100% con leyenda y etiquetas
 * (en vez de una torta), separadas por 2px de superficie.
 */
export function ActionsBar({ segments }: { segments: { label: string; value: number; color: string; description: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((n, s) => n + s.value, 0);
  if (total === 0) return <p className="text-sm text-[var(--ink-muted)]">Sin datos en el período.</p>;
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="flex h-8 gap-[2px] overflow-hidden rounded">
          {segments.map((s, i) =>
            s.value > 0 ? (
              <div
                key={s.label}
                className="h-full transition-opacity first:rounded-l last:rounded-r"
                style={{ width: `${(s.value / total) * 100}%`, background: s.color, opacity: hover === null || hover === i ? 1 : 0.45 }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                role="img"
                aria-label={`${s.label}: ${fmt(s.value)} (${pct(s.value)})`}
              />
            ) : null,
          )}
        </div>
        {hover !== null && (
          <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
            <span className="font-semibold">{segments[hover]!.label}:</span> {fmt(segments[hover]!.value)} ({pct(segments[hover]!.value)})
          </div>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.label} className="flex gap-2">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            <div>
              <div className="text-sm font-medium text-[var(--ink-primary)]">
                {s.label} <span className="font-normal text-[var(--ink-secondary)]">{pct(s.value)}</span>
              </div>
              <div className="text-xs text-[var(--ink-muted)]">
                {fmt(s.value)} · {s.description}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
