import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Area, type Empleado } from '../api';
import { Button, Card, ErrorText, Input } from './ui';

export const selectClass =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 sm:min-h-10 sm:text-sm';

const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor');

/** Contraseña temporal recién generada: se muestra una sola vez, para pasársela al empleado. */
function TemporaryPassword({ nombre, password, onClose }: { nombre: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm" role="status">
      <p className="text-sm text-slate-800">
        Pasale esta contraseña temporal a <strong className="font-semibold">{nombre}</strong>. La va a cambiar la primera vez que entre (en la app web o en la
        extensión). <strong className="font-semibold">No se vuelve a mostrar.</strong>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-white px-3 py-2 font-mono text-lg tracking-wider text-slate-900 ring-1 ring-emerald-200">{password}</code>
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(password).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copiada' : 'Copiar'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Listo
        </Button>
      </div>
    </div>
  );
}

function AddEmployee({ areas, onCreated }: { areas: Area[]; onCreated: (nombre: string, password: string) => void }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [areaId, setAreaId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ passwordTemporal: string }>('/supervisor/empleados', { nombre, email, areaId: areaId || null });
      onCreated(nombre.trim(), r.passwordTemporal);
      setNombre('');
      setEmail('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-[var(--ink-primary)]">Agregar empleado</h2>
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_12rem_auto] md:items-end">
        <Input label="Nombre y apellido" required maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Input label="Email" type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-900">Área</span>
          <select className={selectClass} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">Sin área</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? 'Agregando…' : 'Agregar'}
        </Button>
      </form>
      {error && (
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Card>
  );
}

function Status({ e }: { e: Empleado }) {
  const [text, tone] = !e.activo
    ? ['Desactivado', 'bg-slate-100 text-slate-700 ring-slate-200']
    : e.pendiente_de_ingreso
      ? ['Todavía no entró', 'bg-amber-50 text-amber-800 ring-amber-200']
      : ['Activo', 'bg-emerald-50 text-emerald-800 ring-emerald-200'];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}>{text}</span>;
}

/** Alta, cambio de área, nueva contraseña y baja de los empleados de la empresa. Sin datos de actividad. */
export function Employees({ onSessionLost }: { onSessionLost: () => void }) {
  const [empleados, setEmpleados] = useState<Empleado[] | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [temporal, setTemporal] = useState<{ nombre: string; password: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const show = (r: { empleados: Empleado[]; areas: Area[] }) => {
    setEmpleados(r.empleados);
    setAreas(r.areas);
  };
  const load = async () => show(await api<{ empleados: Empleado[]; areas: Area[] }>('/supervisor/empleados'));

  useEffect(() => {
    api<{ empleados: Empleado[]; areas: Area[] }>('/supervisor/empleados')
      .then(show)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) onSessionLost();
        else setError(errorMessage(e));
      });
  }, [onSessionLost]);

  /** Cambio sobre un empleado; al terminar se recarga la lista. */
  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const update = (e: Empleado, cambios: { areaId?: string | null; activo?: boolean }) =>
    act(e.id, async () => {
      await api(`/supervisor/empleados/${e.id}`, { areaId: cambios.areaId !== undefined ? cambios.areaId : e.area_id, activo: cambios.activo ?? e.activo });
    });

  const resetPassword = (e: Empleado) =>
    act(e.id, async () => {
      const r = await api<{ passwordTemporal: string }>(`/supervisor/empleados/${e.id}/password`, {});
      setTemporal({ nombre: e.nombre, password: r.passwordTemporal });
    });

  return (
    <div className="space-y-6">
      <AddEmployee
        areas={areas}
        onCreated={(nombre, password) => {
          setTemporal({ nombre, password });
          void load().catch((e) => setError(errorMessage(e)));
        }}
      />
      {temporal && <TemporaryPassword {...temporal} onClose={() => setTemporal(null)} />}
      {error && <ErrorText>{error}</ErrorText>}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--ink-primary)]">Empleados</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            {empleados ? `${empleados.filter((e) => e.activo).length} activos.` : 'Cargando…'} La actividad se ve solo en totales por área, en el reporte.
          </p>
        </div>
        {empleados && empleados.length === 0 && <p className="px-5 py-6 text-sm text-[var(--ink-muted)]">Todavía no hay empleados.</p>}
        {empleados && empleados.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Nombre
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Área
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Estado
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {empleados.map((e) => (
                  <tr key={e.id} className={e.activo ? '' : 'text-[var(--ink-muted)]'}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-[var(--ink-primary)]">{e.nombre}</div>
                      <div className="text-xs text-[var(--ink-muted)]">{e.email}</div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        aria-label={`Área de ${e.nombre}`}
                        className={`${selectClass} min-w-36`}
                        value={e.area_id ?? ''}
                        disabled={busyId === e.id || !e.activo}
                        onChange={(ev) => void update(e, { areaId: ev.target.value || null })}
                      >
                        <option value="">Sin área</option>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <Status e={e} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {e.activo && (
                          <Button variant="ghost" disabled={busyId === e.id} onClick={() => void resetPassword(e)}>
                            Nueva contraseña
                          </Button>
                        )}
                        <Button variant="secondary" disabled={busyId === e.id} onClick={() => void update(e, { activo: !e.activo })}>
                          {e.activo ? 'Desactivar' : 'Reactivar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
