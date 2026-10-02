import type { Action, DetectionType } from '@securedata/shared';
import { ACTION_LABELS, DETECTION_LABELS, DETECTION_TYPES } from '@securedata/shared';
import type { ColumnDecision, ColumnFinding } from '@securedata/detector';
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Button, Card, ConfidenceBadge, Icon, inputClass, selectClass, Stat } from './ui';

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

function FindingRow({ finding, rowCount }: { finding: ColumnFinding; rowCount: number }) {
  const decision = useStore((s) => s.decisions[finding.index])!;
  const setDecision = useStore((s) => s.setDecision);
  const sensitive = finding.kind !== 'ninguno' || decision.type !== null;

  return (
    <tr className={`align-top ${sensitive ? '' : 'text-slate-500'}`}>
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{finding.header}</div>
        {finding.kind !== 'ninguno' && (
          <div className="text-xs text-slate-500">
            {finding.kind === 'texto' ? `${finding.detectionCount} datos dentro del texto` : `${finding.detectionCount} de ${rowCount} filas`}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {finding.kind === 'ninguno' ? (
          <span className="text-sm">Sin detecciones</span>
        ) : (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-800">
                {finding.kind === 'texto' ? 'Texto libre' : DETECTION_LABELS[finding.type!]}
              </span>
              {finding.confidence && <ConfidenceBadge confidence={finding.confidence} />}
            </div>
            <p className="text-xs text-slate-500">{finding.reason}</p>
            {finding.examples.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {finding.examples.map((ex, i) => (
                  <code key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {ex}
                  </code>
                ))}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="w-48 px-4 py-3">
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
      </td>
      <td className="w-56 px-4 py-3">
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
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            Prefijo
            <input
              className={inputClass}
              value={decision.prefix ?? ''}
              onChange={(e) => setDecision(finding.index, { prefix: e.target.value })}
              placeholder="Cliente"
            />
          </label>
        )}
      </td>
    </tr>
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
      <button type="button" onClick={backToResult} className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="arrowLeft" className="h-4 w-4" />
        Volver al resultado
      </button>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ajustá la protección</h1>
          <p className="text-sm text-slate-600">
            {fileName} · {sheet.rows.length} filas · {sheet.headers.length} columnas
          </p>
        </div>
        {/* La hoja se elige en el resultado; acá se ajusta la que está procesada. */}
        <Button onClick={apply}>
          <Icon name="check" className="h-4 w-4" />
          Aplicar cambios
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Columnas con datos sensibles" value={`${flagged.length} de ${findings.length}`} />
        <Stat label="Valores sensibles detectados" value={totalDetections} />
        <Stat label="Columnas sin detecciones" value={clean.length} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Columna</th>
              <th className="px-4 py-2 font-medium">Detección</th>
              <th className="px-4 py-2 font-medium">Tipo de dato</th>
              <th className="px-4 py-2 font-medium">Qué hacer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flagged.map((f) => (
              <FindingRow key={f.index} finding={f} rowCount={sheet.rows.length} />
            ))}
            {showAll && clean.map((f) => <FindingRow key={f.index} finding={f} rowCount={sheet.rows.length} />)}
          </tbody>
        </table>
        {clean.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2">
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Ocultar' : 'Mostrar'} las {clean.length} columnas sin detecciones (para marcarlas a mano)
            </Button>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={apply}>Aplicar cambios</Button>
      </div>
    </div>
  );
}
