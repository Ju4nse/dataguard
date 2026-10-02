import { DETECTION_LABELS, type DetectionType } from '@securedata/shared';
import type { ReactNode } from 'react';
import { useStore } from '../store';
import { Button, Card, Icon } from './ui';

/**
 * Encabezado común de los resultados: qué se protegió y las acciones principales a la vista
 * (descargar/copiar primero; revisar es opcional).
 */
export function ResultSummary({
  protectedCount,
  detail,
  counts,
  doubtfulNote,
  actions,
  equivalencesCount,
  onDownloadEquivalences,
}: {
  protectedCount: number;
  /** Una línea con lo que se hizo, ej. "Eliminamos 2 columnas, anonimizamos 2 y seudonimizamos 4." */
  detail: string;
  counts: Partial<Record<DetectionType, number>>;
  doubtfulNote?: string;
  actions: ReactNode;
  equivalencesCount: number;
  onDownloadEquivalences: () => void;
}) {
  const { fileName, session, backToReview, reset } = useStore();
  const policyApplied = session && Object.keys(session.politica).length > 0;

  return (
    <Card className="divide-y divide-slate-100">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${protectedCount > 0 ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
            <Icon name={protectedCount > 0 ? 'shield' : 'check'} className="h-6 w-6" />
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-semibold text-slate-900">
              {protectedCount > 0 ? `Protegimos ${protectedCount.toLocaleString('es-AR')} datos sensibles` : 'No encontramos datos sensibles'}
            </h1>
            <p className="truncate text-sm text-slate-500" title={fileName}>
              {fileName}
            </p>
            <p className="text-sm text-slate-700">
              {detail} Ya podés usarlo en cualquier herramienta de IA: <strong className="font-medium">no hace falta que revises nada</strong>.
            </p>
          </div>
        </div>

        {protectedCount > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Datos protegidos por tipo">
            {Object.entries(counts).map(([t, n]) => (
              <li key={t} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                {DETECTION_LABELS[t as DetectionType]} <span className="font-semibold">{n}</span>
              </li>
            ))}
          </ul>
        )}

        {(policyApplied || doubtfulNote) && (
          <div className="space-y-1 text-sm">
            {policyApplied && (
              <p className="flex items-center gap-2 text-teal-800">
                <Icon name="building" className="h-4 w-4 shrink-0" />
                Se aplicó la política de seguridad de {session.organizacion}.
              </p>
            )}
            {doubtfulNote && (
              <p className="flex items-start gap-2 text-sky-800">
                <Icon name="sparkles" className="mt-0.5 h-4 w-4 shrink-0" />
                {doubtfulNote}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {actions}
          <Button variant="ghost" onClick={backToReview}>
            <Icon name="adjust" className="h-4 w-4" />
            Revisar y ajustar
          </Button>
          <Button variant="ghost" onClick={reset} className="sm:ml-auto">
            Procesar otro archivo
          </Button>
        </div>
      </div>

      {equivalencesCount > 0 && (
        <div className="flex flex-col gap-3 bg-amber-50/60 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <Icon name="key" className="hidden h-5 w-5 shrink-0 text-amber-700 sm:block" />
          <p className="flex-1 text-sm text-amber-900">
            <strong className="font-medium">Tabla de equivalencias ({equivalencesCount} seudónimos):</strong> sirve para traducir las respuestas de
            la IA a los nombres reales. Tiene los datos originales: guardala en un lugar seguro y nunca la subas a una IA.
          </p>
          <Button variant="secondary" onClick={onDownloadEquivalences} className="shrink-0">
            Descargar equivalencias
          </Button>
        </div>
      )}
    </Card>
  );
}
