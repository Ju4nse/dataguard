import { useMemo, useState } from 'react';
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
import { ChartCard } from './charts/ChartParts';
import { CompareCard } from './charts/CompareCard';
import { Button, Card, Icon, selectClass } from './ui';

/** Una tabla para graficar: la original y su versión protegida. */
interface Source {
  name: string;
  real: Table;
  protegida: Table;
}

/** Planilla: la hoja actual. Documento (Word): cada tabla que tenga adentro. */
function useSources(): { sources: Source[]; kind: 'planilla' | 'documento' } {
  const { mode, result, sheets, sheetIndex, docTables, docResult } = useStore();
  if (mode === 'tabla') {
    const sheet = sheets[sheetIndex];
    return { kind: 'planilla', sources: sheet && result ? [{ name: sheet.name, real: sheet, protegida: result.table }] : [] };
  }
  return { kind: 'documento', sources: docResult ? docTables.map((t, i) => ({ name: t.name, real: t, protegida: docResult.tables[i] ?? t })) : [] };
}

/**
 * Gráficos: se calculan en el navegador, sin IA y sin mandar nada. Por defecto con los datos reales
 * (nadie más los ve); con seudónimos, para compartir una imagen sin datos sensibles.
 */
export default function ChartsStep() {
  const { fileName, sheets, backToResult } = useStore();
  const { sources, kind } = useSources();
  const [source, setSource] = useState<'real' | 'protegida'>('real');
  const [index, setIndex] = useState(0);
  const current = sources[Math.min(index, sources.length - 1)];
  if (!current) return null;
  const table = current[source];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-3" onClick={backToResult}>
            <Icon name="arrowLeft" className="h-4 w-4" />
            Volver al resultado
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {kind === 'planilla' ? 'Gráficos de tu planilla' : 'Gráficos de las tablas del documento'}
          </h1>
          <p className="flex items-start gap-1.5 text-sm text-slate-600">
            <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            {fileName}
            {kind === 'planilla' && sheets.length > 1 ? ` · hoja ${current.name}` : ''}. Se calculan en tu navegador: ningún dato sale de tu computadora.
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
          <p className="text-xs text-slate-500">{source === 'real' ? 'Solo vos los ves.' : 'Para compartir una imagen sin datos sensibles.'}</p>
        </div>
      </div>
      {sources.length > 1 && (
        <label className="flex max-w-sm flex-col gap-1.5 text-sm font-medium text-slate-700">
          <span>Tabla</span>
          <select className={selectClass} value={index} onChange={(e) => setIndex(Number(e.target.value))}>
            {sources.map((s, i) => (
              <option key={i} value={i}>
                {s.name} ({s.real.headers.slice(0, 3).join(', ')}
                {s.real.headers.length > 3 ? '…' : ''})
              </option>
            ))}
          </select>
        </label>
      )}
      {/* Al cambiar de tabla o de datos se arma todo de nuevo (la versión protegida puede no tener algunas columnas). */}
      <ChartsView key={`${index}-${source}`} table={table} />
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
        <h2 className="font-semibold text-slate-900">No encontramos qué graficar en esta tabla</h2>
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
      <CompareCard table={table} profiles={profiles} />
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
