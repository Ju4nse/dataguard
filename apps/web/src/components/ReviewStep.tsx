import type { Action, DetectionType } from '@securedata/shared';
import { ACTION_LABELS, DETECTION_LABELS, DETECTION_TYPES } from '@securedata/shared';
import type { ColumnDecision, ColumnFinding } from '@securedata/detector';
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { AiBadge, BackLink, Button, Card, ConfidenceBadge, Icon, inputClass, selectClass, Stat } from './ui';

const TEXT_ACTION_LABELS: Record<Action, string> = {
  eliminar: 'Eliminar columna',
  anonimizar: 'Anonimizar lo detectado',
  seudonimizar: 'Seudonimizar lo detectado',
  mantener: 'Mantener',
};

function availableActions(d: ColumnDecision): Action[] {
  if (d.kind === 'columna' && !d.type) return ['mantener', 'eliminar'];
  return ['seudonimizar', 'anonimizar', 'eliminar', 'mantener'];
}

/** Grilla compartida entre el encabezado y las filas: desde 1024px se ve como tabla; en celular, tarjetas. */
const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_11rem_13rem] lg:items-start lg:gap-4';

/** Etiqueta visible solo en celular, donde cada columna es una tarjeta (en tabla la da el encabezado). */
function MobileLabel({ children }: { children: string }) {
  return <span className="mb-1 block text-xs font-medium text-slate-600 lg:sr-only">{children}</span>;
}

function FindingRow({ finding, rowCount }: { finding: ColumnFinding; rowCount: number }) {
  const decision = useStore((s) => s.decisions[finding.index])!;
  const setDecision = useStore((s) => s.setDecision);
  const sensitive = finding.kind !== 'ninguno' || decision.type !== null;
  const count = finding.kind === 'texto' ? `${finding.detectionCount} datos en el texto` : `${finding.detectionCount} de ${rowCount} filas`;

  return (
    <li className={`space-y-3 px-4 py-4 lg:space-y-0 ${ROW_GRID} ${sensitive ? '' : 'text-slate-500'}`}>
      <div className="flex items-baseline justify-between gap-3 lg:block">
        <div className="break-words font-semibold text-slate-900">{finding.header}</div>
        {finding.kind !== 'ninguno' && <div className="shrink-0 text-xs text-slate-600">{count}</div>}
      </div>

      <div>
        {finding.kind === 'ninguno' ? (
          <span className="text-sm">Sin detecciones</span>
        ) : (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-800">{finding.kind === 'texto' ? 'Texto libre' : DETECTION_LABELS[finding.type!]}</span>
              {finding.confidence && <ConfidenceBadge confidence={finding.confidence} />}
              {finding.aiAssisted && <AiBadge />}
            </div>
            <p className="text-xs text-slate-600">{finding.reason}</p>
            {finding.aiSkipped ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-800">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                La IA local revisó las primeras celdas; {finding.aiSkipped.toLocaleString('es-AR')} se protegieron solo con reglas.
              </p>
            ) : null}
            {finding.examples.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {finding.examples.map((ex, i) => (
                  <code key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                    {ex}
                  </code>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* En celular, los dos controles van lado a lado; en tabla, cada uno en su columna (lg:contents). */}
      <div className="grid grid-cols-2 gap-3 lg:contents">
        <div>
          <MobileLabel>Tipo de dato</MobileLabel>
          {decision.kind === 'texto' ? (
            <span className="text-sm text-slate-600">Varios (texto libre)</span>
          ) : (
            <select
              aria-label={`Tipo de dato de la columna ${finding.header}`}
              className={selectClass}
              value={decision.type ?? ''}
              onChange={(e) => setDecision(finding.index, { type: (e.target.value || null) as DetectionType | null })}
            >
              <option value="">No es sensible</option>
              {DETECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DETECTION_LABELS[t]}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <MobileLabel>Qué hacer</MobileLabel>
          <select
            aria-label={`Acción para la columna ${finding.header}`}
            className={selectClass}
            value={decision.action}
            onChange={(e) => setDecision(finding.index, { action: e.target.value as Action })}
          >
            {availableActions(decision).map((a) => (
              <option key={a} value={a}>
                {decision.kind === 'texto' ? TEXT_ACTION_LABELS[a] : ACTION_LABELS[a]}
              </option>
            ))}
          </select>
          {decision.action === 'seudonimizar' && decision.kind === 'columna' && (
            <label className="mt-2 block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Prefijo del seudónimo</span>
              <input
                className={inputClass}
                value={decision.prefix ?? ''}
                onChange={(e) => setDecision(finding.index, { prefix: e.target.value })}
                placeholder="Cliente"
              />
            </label>
          )}
        </div>
      </div>
    </li>
  );
}

export function ReviewStep() {
  const { findings, sheets, sheetIndex, apply, backToResult, fileName } = useStore();
  const [showAll, setShowAll] = useState(false);
  const sheet = sheets[sheetIndex]!;

  const flagged = useMemo(() => findings.filter((f) => f.kind !== 'ninguno'), [findings]);
  const clean = useMemo(() => findings.filter((f) => f.kind === 'ninguno'), [findings]);
  const totalDetections = flagged.reduce((n, f) => n + (f.confidence === 'baja' ? 0 : f.detectionCount), 0);

  return (
    <div className="space-y-6">
      <BackLink onClick={backToResult}>Volver al resultado</BackLink>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ajustá la protección</h1>
          <p className="break-words text-sm text-slate-600">
            {fileName} · {sheet.rows.length} filas · {sheet.headers.length} columnas
          </p>
        </div>
        {/* La hoja se elige en el resultado; acá se ajusta la que está procesada. */}
        <Button onClick={apply} className="w-full sm:w-auto">
          <Icon name="check" className="h-4 w-4" />
          Aplicar cambios
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Columnas con datos sensibles" value={`${flagged.length} de ${findings.length}`} />
        <Stat label="Valores sensibles detectados" value={totalDetections} />
        <Stat label="Columnas sin detecciones" value={clean.length} />
      </div>

      <Card className="overflow-hidden">
        {/* Encabezado de columnas: solo desde 1024px. */}
        <div aria-hidden="true" className={`hidden border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-600 ${ROW_GRID}`}>
          <span>Columna</span>
          <span>Detección</span>
          <span>Tipo de dato</span>
          <span>Qué hacer</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {flagged.map((f) => (
            <FindingRow key={f.index} finding={f} rowCount={sheet.rows.length} />
          ))}
          {showAll && clean.map((f) => <FindingRow key={f.index} finding={f} rowCount={sheet.rows.length} />)}
        </ul>
        {clean.length > 0 && (
          <div className="border-t border-slate-100 px-2 py-1">
            <Button variant="ghost" size="sm" className="w-full justify-start text-left sm:w-auto" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Ocultar' : 'Mostrar'} las {clean.length} columnas sin detecciones (para marcarlas a mano)
            </Button>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={apply} className="w-full sm:w-auto">
          Aplicar cambios
        </Button>
      </div>
    </div>
  );
}
