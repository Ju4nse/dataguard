import { DETECTION_SHORT_LABELS } from '@securedata/shared';
import { useEffect, useState } from 'react';
import { api, ApiError, type EstadoIncidente, type EventoRiesgo } from '../api';
import { selectClass } from './Employees';
import { Button, Card, ErrorText } from './ui';

const ESTADOS: { value: EstadoIncidente; label: string }[] = [
  { value: 'abierto', label: 'Abierto' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'descartado', label: 'Descartado' },
];

const ENTRADAS: Record<EventoRiesgo['tipo_entrada'], string> = { prompt: 'Prompt', tabla: 'Planilla', documento: 'Documento' };

const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Avisos de la extensión que se ignoraron (datos enviados sin proteger a una IA externa), para abrir
 * incidentes. Sin el empleado: fecha sin hora y las áreas chicas agrupadas, como el resto del panel.
 */
export function RiskEvents({ desde, hasta, onSessionLost }: { desde: string; hasta: string; onSessionLost: () => void }) {
  const [eventos, setEventos] = useState<EventoRiesgo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const path = `/panel/riesgo?desde=${desde}&hasta=${hasta}`;
  const load = async () => setEventos(await api<EventoRiesgo[]>(path));

  useEffect(() => {
    api<EventoRiesgo[]>(path)
      .then((r) => {
        setEventos(r);
        setError(null);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) onSessionLost();
        else setError(e instanceof ApiError ? e.message : 'No se pudo cargar');
      });
  }, [path, onSessionLost]);

  const act = async (id: number, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-[var(--ink-primary)]">Eventos de riesgo</h2>
        <p className="text-sm text-[var(--ink-muted)]">
          Avisos de la extensión que se ignoraron: datos sensibles enviados sin proteger a una IA externa. No se muestra quién fue: solo la fecha, el área (las
          áreas con pocas personas se agrupan en «Otras áreas») y los tipos de dato. Se muestran los 200 más recientes.
        </p>
      </div>
      {error && (
        <div className="px-5 pt-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {eventos && eventos.length === 0 && <p className="px-5 py-6 text-sm text-[var(--ink-muted)]">No hubo eventos de riesgo en este período.</p>}
      {eventos && eventos.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Fecha
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Área
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Dónde
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Datos enviados
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Incidente
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eventos.map((e) => (
                <tr key={e.evento_id}>
                  <td className="whitespace-nowrap px-5 py-3 text-[var(--ink-primary)]">{fecha(e.fecha)}</td>
                  <td className="px-3 py-3">{e.area}</td>
                  <td className="px-3 py-3">
                    <div>{e.sitio ?? '—'}</div>
                    <div className="text-xs text-[var(--ink-muted)]">{ENTRADAS[e.tipo_entrada]}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{e.tipos.map((t) => DETECTION_SHORT_LABELS[t]).join(', ') || '—'}</div>
                    <div className="text-xs text-[var(--ink-muted)]">{e.detecciones} en total</div>
                  </td>
                  <td className="px-5 py-3">
                    {e.incidente_id === null ? (
                      <Button
                        variant="secondary"
                        disabled={busyId === e.evento_id}
                        onClick={() => void act(e.evento_id, () => api('/panel/incidentes', { eventoId: e.evento_id }))}
                      >
                        Abrir incidente
                      </Button>
                    ) : (
                      <select
                        aria-label={`Estado del incidente del ${fecha(e.fecha)}`}
                        className={`${selectClass} min-w-36`}
                        value={e.incidente_estado ?? 'abierto'}
                        disabled={busyId === e.evento_id}
                        onChange={(ev) => void act(e.evento_id, () => api(`/panel/incidentes/${e.incidente_id}`, { estado: ev.target.value }))}
                      >
                        {ESTADOS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
