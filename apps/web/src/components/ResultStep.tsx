import { cellToString } from '@securedata/detector';
import { downloadEquivalences, downloadTable } from '../lib/files';
import { useStore } from '../store';
import { ResultSummary } from './ResultSummary';
import { Button, Card, Icon } from './ui';

const PREVIEW_ROWS = 12;

/** "Eliminamos 2 columnas, anonimizamos 2 y seudonimizamos 4." */
function describeActions(counts: { eliminar: number; anonimizar: number; seudonimizar: number }): string {
  const parts = [
    counts.eliminar && `eliminamos ${counts.eliminar} columna${counts.eliminar === 1 ? '' : 's'}`,
    counts.anonimizar && `anonimizamos ${counts.anonimizar}`,
    counts.seudonimizar && `seudonimizamos ${counts.seudonimizar}`,
  ].filter(Boolean) as string[];
  if (parts.length === 0) return '';
  const text = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

export function ResultStep() {
  const { result, decisions, findings, fileName, format, delimiter, sheets, sheetIndex, selectSheet, recordUsage } = useStore();
  if (!result) return null;
  const { table, equivalences, transformedCounts } = result;

  const actions = Object.values(decisions);
  const count = (a: string) => actions.filter((d) => d.action === a).length;
  const protectedValues = Object.values(transformedCounts).reduce((n, v) => n + (v ?? 0), 0);
  const doubtful = findings.filter((f) => f.confidence === 'baja').length;
  const formatLabel = format === 'csv' ? 'CSV' : format === 'json' ? 'JSON' : 'Excel';

  return (
    <div className="space-y-6">
      <ResultSummary
        protectedCount={protectedValues}
        detail={describeActions({ eliminar: count('eliminar'), anonimizar: count('anonimizar'), seudonimizar: count('seudonimizar') })}
        counts={transformedCounts}
        doubtfulNote={
          doubtful > 0
            ? `Por las dudas seudonimizamos ${doubtful} columna${doubtful === 1 ? '' : 's'} que podría${doubtful === 1 ? '' : 'n'} tener datos sensibles; los valores reales están en la tabla de equivalencias.`
            : undefined
        }
        equivalencesCount={equivalences.length}
        onDownloadEquivalences={() => downloadEquivalences(equivalences, fileName)}
        actions={
          <>
            <Button
              onClick={() => {
                recordUsage();
                void downloadTable(table, { fileName, format, delimiter, sheetName: sheets[sheetIndex]?.name ?? 'Datos' });
              }}
            >
              <Icon name="download" className="h-4 w-4" />
              Descargar {formatLabel} protegido
            </Button>
            {sheets.length > 1 && (
              <select
                aria-label="Hoja"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
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
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-900">Así queda tu archivo</h2>
          <span className="text-xs text-slate-600">
            {Math.min(PREVIEW_ROWS, table.rows.length)} de {table.rows.length.toLocaleString('es-AR')} filas · {table.headers.length} columnas
          </span>
        </div>
        {/* Tabla de datos: en pantallas chicas se desliza de costado (con aviso); el resto de la página no se mueve. */}
        <p className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2 text-xs text-slate-600 md:hidden">
          Deslizá la tabla para ver todas las columnas
          <Icon name="arrowRight" className="h-3.5 w-3.5" />
        </p>
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {table.headers.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.rows.slice(0, PREVIEW_ROWS).map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="max-w-xs truncate whitespace-nowrap px-4 py-2 text-slate-700">
                      {cellToString(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
