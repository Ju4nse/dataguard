import { DETECTION_LABELS, type DetectionType } from '@securedata/shared';
import type { ReactNode } from 'react';
import { useStore } from '../store';
import { Button, Card, Icon } from './ui';

/** Volver al inicio para procesar otro archivo (arriba de cada pantalla del flujo). */
export function BackToStart() {
  const reset = useStore((s) => s.reset);
  return (
    <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900">
      <Icon name="arrowLeft" className="h-4 w-4" />
      Nuevo archivo
    </button>
  );
}

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
  const { fileName, session, backToReview } = useStore();
  const policyApplied = session && Object.keys(session.politica).length > 0;
  const isProtected = protectedCount > 0;

  return (
    <div className="space-y-4">
      <BackToStart />
      <Card className="overflow-hidden">
        <div className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${isProtected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
            >
              <Icon name={isProtected ? 'shield' : 'check'} className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isProtected ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200' : 'bg-slate-100 text-slate-700'}`}
                >
                  <Icon name="check" className="h-3.5 w-3.5" />
                  {isProtected ? 'Archivo protegido' : 'Sin datos sensibles'}
                </span>
                <span className="truncate text-sm text-slate-600" title={fileName}>
                  {fileName}
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {isProtected ? `Protegimos ${protectedCount.toLocaleString('es-AR')} datos sensibles` : 'No encontramos datos sensibles'}
              </h1>
              <p className="text-slate-700">
                {detail} Ya podés usarlo en cualquier herramienta de IA: <strong className="font-semibold">no hace falta que revises nada</strong>.
              </p>
            </div>
          </div>

          {isProtected && (
            <ul className="flex flex-wrap gap-2" aria-label="Datos protegidos por tipo">
              {Object.entries(counts).map(([t, n]) => (
                <li key={t} className="rounded-md bg-slate-100 px-2.5 py-1 text-sm text-slate-700">
                  {DETECTION_LABELS[t as DetectionType]} <span className="font-semibold text-slate-900">{n}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5 text-sm">
            <p className="flex items-start gap-2 text-slate-700">
              <Icon name="laptop" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <span>
                Analizado en tu computadora: <strong className="font-semibold">0 bytes</strong> de tu archivo se enviaron a servidores o a una IA.
              </span>
            </p>
          </div>

          {(policyApplied || doubtfulNote) && (
            <div className="space-y-1.5 text-sm">
              {policyApplied && (
                <p className="flex items-start gap-2 text-slate-700">
                  <Icon name="building" className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  {/* Un solo elemento de texto: si no, flex parte la frase en columnas. */}
                  <span>
                    Se aplicó la política de seguridad de <strong className="font-semibold">{session.organizacion}</strong>.
                  </span>
                </p>
              )}
              {doubtfulNote && (
                <p className="flex items-start gap-2 text-slate-700">
                  <Icon name="sparkles" className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  {doubtfulNote}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:flex-wrap sm:items-center">
            {actions}
            <Button variant="ghost" onClick={backToReview} className="sm:ml-auto">
              <Icon name="adjust" className="h-4 w-4" />
              Revisar y ajustar
            </Button>
          </div>
        </div>

        {equivalencesCount > 0 && (
          <div className="flex flex-col gap-3 border-t border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:px-7">
            <Icon name="key" className="hidden h-5 w-5 shrink-0 text-amber-700 sm:block" />
            <p className="flex-1 text-sm text-amber-900">
              <strong className="font-semibold">Tabla de equivalencias ({equivalencesCount} seudónimos):</strong> sirve para traducir las respuestas
              de la IA a los nombres reales. Tiene los datos originales: guardala en un lugar seguro y nunca la subas a una IA.
            </p>
            <Button variant="secondary" onClick={onDownloadEquivalences} className="shrink-0">
              Descargar equivalencias
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
