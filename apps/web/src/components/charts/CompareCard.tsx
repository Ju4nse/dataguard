import { useMemo, useState } from 'react';
import type { Table } from '@securedata/detector';
import { categoryOptions, compareCategories, comparePeriods, formatValue, periodOptions, type ColumnProfile, type Operation } from '../../lib/charts';
import { Card, Icon, selectClass } from '../ui';
import { ComparisonChart } from './ChartParts';

type Mode = 'periodos' | 'categorias';

const segmented = (active: boolean) =>
  `min-h-10 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`;

/** Comparar dos períodos (marzo y abril) o dos valores de una categoría (Córdoba y Salta). */
export function CompareCard({ table, profiles }: { table: Table; profiles: ColumnProfile[] }) {
  const dates = profiles.filter((p) => p.kind === 'fecha');
  const categories = profiles.filter((p) => p.kind === 'categoria');
  const numbers = profiles.filter((p) => p.kind === 'numero');
  const money = numbers.find((p) => p.money) ?? numbers[0];

  const [mode, setMode] = useState<Mode>(dates.length ? 'periodos' : 'categorias');
  const [measure, setMeasure] = useState<number | null>(money?.index ?? null);
  const [operation, setOperation] = useState<Operation>(money ? 'suma' : 'conteo');

  // Períodos: por defecto los dos últimos con datos.
  const date = dates[0];
  const periods = useMemo(() => (date ? periodOptions(table, date.index).options : []), [table, date]);
  const [periodA, setPeriodA] = useState(periods.at(-2)?.key ?? '');
  const [periodB, setPeriodB] = useState(periods.at(-1)?.key ?? '');
  const [by, setBy] = useState<number | null>(categories.slice().sort((a, b) => a.distinct - b.distinct)[0]?.index ?? null);

  // Categorías: por defecto los dos valores con más filas.
  const [column, setColumn] = useState<number | null>(categories[0]?.index ?? null);
  const values = useMemo(() => (column !== null ? categoryOptions(table, column) : []), [table, column]);
  const [valueA, setValueA] = useState(values[0] ?? '');
  const [valueB, setValueB] = useState(values[1] ?? '');

  const cmp = useMemo(() => {
    const m = { measure, operation };
    if (mode === 'periodos' && date && periodA && periodB) return comparePeriods(table, profiles, { ...m, date: date.index, a: periodA, b: periodB, by });
    if (mode === 'categorias' && column !== null && valueA && valueB)
      return compareCategories(table, profiles, { ...m, column, a: valueA, b: valueB, date: date?.index ?? null });
    return null;
  }, [mode, measure, operation, date, periodA, periodB, by, column, valueA, valueB, table, profiles]);

  if (!date && categories.length === 0) return null;
  const canPeriods = !!date && periods.length >= 2;
  const canCategories = categories.length > 0;

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Icon name="scale" className="h-5 w-5 text-brand-700" />
            Comparar
          </h2>
          <p className="text-sm text-slate-600">Dos períodos (este mes contra el anterior) o dos valores de una categoría (una provincia contra otra).</p>
        </div>
        <div role="group" aria-label="Qué comparar" className="inline-flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            aria-pressed={mode === 'periodos'}
            disabled={!canPeriods}
            onClick={() => setMode('periodos')}
            className={segmented(mode === 'periodos')}
          >
            Dos períodos
          </button>
          <button
            type="button"
            aria-pressed={mode === 'categorias'}
            disabled={!canCategories}
            onClick={() => setMode('categorias')}
            className={segmented(mode === 'categorias')}
          >
            Dos categorías
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {mode === 'periodos' ? (
          <>
            <Select label="Período" value={periodA} onChange={setPeriodA} options={periods.map((p) => [p.key, p.label])} />
            <Select label="Contra" value={periodB} onChange={setPeriodB} options={periods.map((p) => [p.key, p.label])} />
            <Select
              label="Desglosar por"
              value={by === null ? '' : String(by)}
              onChange={(v) => setBy(v === '' ? null : Number(v))}
              options={[['', 'Sin desglose (total)'], ...categories.map((c) => [String(c.index), c.header] as [string, string])]}
            />
          </>
        ) : (
          <>
            <Select
              label="Categoría"
              value={column === null ? '' : String(column)}
              onChange={(v) => {
                const c = Number(v);
                const next = categoryOptions(table, c);
                setColumn(c);
                setValueA(next[0] ?? '');
                setValueB(next[1] ?? '');
              }}
              options={categories.map((c) => [String(c.index), c.header])}
            />
            <Select label="Valor" value={valueA} onChange={setValueA} options={values.map((v) => [v, v])} />
            <Select label="Contra" value={valueB} onChange={setValueB} options={values.map((v) => [v, v])} />
          </>
        )}
        <Select
          label="Medir"
          value={measure === null ? '' : String(measure)}
          onChange={(v) => {
            const m = v === '' ? null : Number(v);
            setMeasure(m);
            setOperation(m === null ? 'conteo' : operation === 'conteo' ? 'suma' : operation);
          }}
          options={[['', 'Cantidad de filas'], ...numbers.flatMap((p) => [[String(p.index), p.header] as [string, string]])]}
        />
      </div>
      {measure !== null && (
        <div role="group" aria-label="Cálculo" className="inline-flex rounded-lg bg-slate-100 p-1">
          <button type="button" aria-pressed={operation === 'suma'} onClick={() => setOperation('suma')} className={segmented(operation === 'suma')}>
            Total
          </button>
          <button
            type="button"
            aria-pressed={operation === 'promedio'}
            onClick={() => setOperation('promedio')}
            className={segmented(operation === 'promedio')}
          >
            Promedio
          </button>
        </div>
      )}

      {cmp && (
        <div className="space-y-4 border-t border-slate-100 pt-5">
          <p className="text-sm text-slate-700">
            <strong>{cmp.labelB}</strong>: {formatValue(cmp.totalB, cmp.money)} · <strong>{cmp.labelA}</strong>: {formatValue(cmp.totalA, cmp.money)}
            {cmp.pct !== null && (
              <>
                {' '}
                ({cmp.pct >= 0 ? '+' : ''}
                {cmp.pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %)
              </>
            )}
          </p>
          <ComparisonChart cmp={cmp} />
        </div>
      )}
    </Card>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="space-y-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
