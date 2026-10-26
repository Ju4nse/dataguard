import { DEFAULT_ACTIONS, DETECTION_LABELS, DETECTION_TYPES, type Action, type DetectionType } from '@securedata/shared';
import { useState } from 'react';
import { api, ApiError, type Me } from '../api';
import { selectClass } from './Employees';
import { Card, ErrorText } from './ui';

const ACTIONS: { value: Action; label: string }[] = [
  { value: 'eliminar', label: 'Eliminar' },
  { value: 'anonimizar', label: 'Anonimizar' },
  { value: 'seudonimizar', label: 'Seudonimizar' },
  { value: 'mantener', label: 'Dejar como está' },
];
const actionLabel = (a: Action) => ACTIONS.find((x) => x.value === a)!.label;

type Politica = Me['politica'];

/** Qué hacer con cada tipo de dato. Lo aplican solas la app web y la extensión de cada empleado. */
export function Policy({ politica, onChange }: { politica: Politica; onChange: (p: Politica) => void }) {
  const [busy, setBusy] = useState<DetectionType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (tipo: DetectionType, accion: Action | null) => {
    setBusy(tipo);
    setError(null);
    try {
      const r = await api<{ politica: Politica }>('/supervisor/politica', { tipo, accion });
      onChange(r.politica);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-[var(--ink-primary)]">Política de la empresa</h2>
        <p className="text-sm text-[var(--ink-muted)]">
          Qué se hace con cada tipo de dato. Los empleados no tienen que decidir: la app web y la extensión la aplican solas la próxima vez que se conectan.
          «Seudonimizar» reemplaza el dato por un nombre ficticio (Persona_01) que se puede revertir con la tabla de equivalencias.
        </p>
      </div>
      {error && (
        <div className="px-5 pt-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      <ul className="divide-y divide-slate-100">
        {DETECTION_TYPES.map((tipo) => (
          <li key={tipo} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--ink-primary)]">{DETECTION_LABELS[tipo]}</div>
              {politica[tipo] && <div className="text-xs text-brand-700">Definido por la empresa</div>}
            </div>
            <select
              aria-label={`Acción para ${DETECTION_LABELS[tipo]}`}
              className={`${selectClass} sm:w-64`}
              value={politica[tipo] ?? ''}
              disabled={busy === tipo}
              onChange={(e) => void change(tipo, (e.target.value || null) as Action | null)}
            >
              <option value="">Recomendada: {actionLabel(DEFAULT_ACTIONS[tipo])}</option>
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </Card>
  );
}
