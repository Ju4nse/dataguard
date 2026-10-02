import { DETECTION_LABELS, type DetectionType } from '@securedata/shared';
import { cellToString } from '@securedata/detector';
import { downloadEquivalences, downloadTable } from '../lib/files';
import { useStore } from '../store';
import { Button, Card, Stat } from './ui';

const PREVIEW_ROWS = 15;

export function ResultStep() {
  const { result, decisions, findings, fileName, format, delimiter, sheets, sheetIndex, selectSheet, backToReview, reset, recordUsage, session } = useStore();
  if (!result) return null;
  const { table, equivalences, transformedCounts } = result;

  const actions = Object.values(decisions);
  const count = (a: string) => actions.filter((d) => d.action === a).length;
  const protectedValues = Object.values(transformedCounts).reduce((n, v) => n + (v ?? 0), 0);
  const doubtful = findings.filter((f) => f.confidence === 'baja').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {protectedValues > 0 ? `Protegimos ${protectedValues.toLocaleString('es-AR')} datos sensibles` : 'No encontramos datos sensibles'}
          </h1>
          <p className="text-sm text-slate-600">
            {fileName} · Ya podés descargarlo y usarlo en cualquier herramienta de IA. No hace falta que revises nada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sheets.length > 1 && (
            <select
              aria-label="Hoja"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={sheetIndex}
              onChange={(e) => selectSheet(Number(e.target.value))}
            >
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  Hoja: {s.name}
                </option>
              ))}
            </select>
          )}
          <Button variant="secondary" onClick={backToReview}>
            Revisar y ajustar
          </Button>
        </div>
      </div>

      {session && Object.keys(session.politica).length > 0 && (
        <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-900">Se aplicó la política de seguridad de {session.organizacion}.</p>
      )}

      {doubtful > 0 && (
        <p className="rounded-lg bg-sky-50 px-4 py-2 text-sm text-sky-900">
          Por las dudas seudonimizamos {doubtful} columna{doubtful === 1 ? '' : 's'} que podría{doubtful === 1 ? '' : 'n'} tener datos sensibles. Si
          necesitás los valores reales, los recuperás con la tabla de equivalencias.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Valores protegidos" value={protectedValues} tone="teal" />
        <Stat label="Columnas eliminadas" value={count('eliminar')} />
        <Stat label="Columnas anonimizadas" value={count('anonimizar')} />
        <Stat label="Columnas seudonimizadas" value={count('seudonimizar')} />
      </div>

      {protectedValues > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(transformedCounts).map(([t, n]) => (
            <span key={t} className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-200">
              {DETECTION_LABELS[t as DetectionType]}: {n}
            </span>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
          Vista previa ({Math.min(PREVIEW_ROWS, table.rows.length)} de {table.rows.length} filas)
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr>
                {table.headers.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.rows.slice(0, PREVIEW_ROWS).map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="max-w-xs truncate whitespace-nowrap px-3 py-1.5 text-slate-700">
                      {cellToString(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="font-medium text-slate-900">Archivo depurado</h2>
          <p className="text-sm text-slate-600">Este es el que podés subir a ChatGPT, Claude o Copilot.</p>
          <Button
            onClick={() => {
              recordUsage();
              void downloadTable(table, { fileName, format, delimiter, sheetName: sheets[sheetIndex]?.name ?? 'Datos' });
            }}
          >
            Descargar {format === 'csv' ? 'CSV' : format === 'json' ? 'JSON' : 'Excel'} depurado
          </Button>
        </Card>

        {equivalences.length > 0 && (
          <Card className="space-y-3 border-amber-200 bg-amber-50/50 p-5">
            <h2 className="font-medium text-slate-900">Tabla de equivalencias</h2>
            <p className="text-sm text-slate-700">
              Sirve para traducir las respuestas de la IA a los nombres reales ({equivalences.length} seudónimos).{' '}
              <strong>Contiene los datos originales:</strong> guardala en un lugar seguro y nunca la subas a una IA.
            </p>
            <Button variant="secondary" onClick={() => downloadEquivalences(equivalences, fileName)}>
              Descargar equivalencias (CSV)
            </Button>
          </Card>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={reset}>
          Procesar otro archivo
        </Button>
      </div>
    </div>
  );
}
