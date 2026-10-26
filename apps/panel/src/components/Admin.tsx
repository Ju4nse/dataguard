import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Configuracion, type Supervisor } from '../api';
import { selectClass, TemporaryPassword } from './Employees';
import { ChangePasswordForm } from './Login';
import { Button, Card, ErrorText, Input } from './ui';

const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor');

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-slate-200 px-5 py-4">
      <h2 className="text-base font-semibold text-[var(--ink-primary)]">{title}</h2>
      <p className="text-sm text-[var(--ink-muted)]">{description}</p>
    </div>
  );
}

/** Si el panel puede mostrar datos por empleado y desde cuántas personas se muestra un grupo. */
function Privacy({ conf, onSaved }: { conf: Configuracion; onSaved: () => Promise<void> }) {
  const [detalle, setDetalle] = useState(conf.mostrar_detalle_usuario);
  const [minimo, setMinimo] = useState(String(conf.minimo_por_grupo));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const changed = detalle !== conf.mostrar_detalle_usuario || Number(minimo) !== conf.minimo_por_grupo;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api('/admin/configuracion', { mostrarDetalleUsuario: detalle, minimoPorGrupo: Number(minimo) });
      await onSaved();
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <SectionHeader title="Privacidad del panel" description="Qué pueden ver los supervisores sobre la actividad de los empleados." />
      <form onSubmit={submit} className="space-y-5 p-5">
        <div className="max-w-xs">
          <Input
            label="Mínimo de personas por grupo"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            required
            value={minimo}
            onChange={(e) => setMinimo(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
            Las áreas con menos personas activas se agrupan en "Otras áreas", para que no se pueda deducir quién fue. Recomendado: 5.
          </p>
        </div>
        <label className="flex max-w-2xl items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
            checked={detalle}
            onChange={(e) => setDetalle(e.target.checked)}
          />
          <span className="text-sm text-slate-800">
            <span className="font-medium">Permitir el detalle por empleado.</span>{' '}
            <span className="text-[var(--ink-secondary)]">
              Los supervisores podrían ver cuántos datos cargó cada persona. Activalo solo si la empresa lo informó a los empleados (y cada consulta queda en la
              auditoría).
            </span>
          </span>
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || !changed}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
          {saved && !changed && (
            <span role="status" className="text-sm text-emerald-700">
              Guardado.
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

function Areas({ conf, onChanged }: { conf: Configuracion; onChanged: () => Promise<void> }) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/admin/areas', { nombre });
      setNombre('');
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <SectionHeader title="Áreas" description="Para agrupar a los empleados en el reporte. Las áreas chicas se agrupan solas." />
      <div className="space-y-4 p-5">
        {conf.areas.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">Todavía no hay áreas.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {conf.areas.map((a) => (
              <li key={a.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800">
                {a.nombre}{' '}
                <span className={a.personas < conf.minimo_por_grupo ? 'text-amber-700' : 'text-[var(--ink-muted)]'}>
                  · {a.personas} {a.personas === 1 ? 'persona' : 'personas'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="flex max-w-md flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Input label="Nueva área" required maxLength={100} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>
            {busy ? 'Creando…' : 'Crear área'}
          </Button>
        </form>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </Card>
  );
}

function SupervisorStatus({ s }: { s: Supervisor }) {
  const [text, tone] = !s.activo
    ? ['Desactivado', 'bg-slate-100 text-slate-700 ring-slate-200']
    : s.pendiente_de_ingreso || !s.mfa_activo
      ? ['Todavía no entró', 'bg-amber-50 text-amber-800 ring-amber-200']
      : ['Activo', 'bg-emerald-50 text-emerald-800 ring-emerald-200'];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}>{text}</span>;
}

function Supervisors({ conf, onChanged }: { conf: Configuracion; onChanged: () => Promise<void> }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Supervisor['rol']>('responsable');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [temporal, setTemporal] = useState<{ nombre: string; password: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ passwordTemporal: string }>('/admin/supervisores', { nombre, email, rol, areaId: null });
      setTemporal({ nombre: nombre.trim(), password: r.passwordTemporal });
      setNombre('');
      setEmail('');
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const act = async (s: Supervisor, fn: () => Promise<void>) => {
    setBusyId(s.id);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const resetAccess = (s: Supervisor) =>
    act(s, async () => {
      const r = await api<{ passwordTemporal: string }>(`/admin/supervisores/${s.id}/acceso`, {});
      setTemporal({ nombre: s.nombre, password: r.passwordTemporal });
    });

  const toggle = (s: Supervisor) => act(s, () => api(`/admin/supervisores/${s.id}`, { activo: !s.activo }));

  return (
    <Card className="overflow-hidden">
      <SectionHeader
        title="Supervisores"
        description="Quiénes entran a este panel. Entran con contraseña y segundo factor; los admins además ven esta configuración."
      />
      <div className="space-y-4 p-5">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_1fr_10rem_auto] md:items-end">
          <Input label="Nombre y apellido" required maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Input label="Email" type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-900">Rol</span>
            <select className={selectClass} value={rol} onChange={(e) => setRol(e.target.value as Supervisor['rol'])}>
              <option value="responsable">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? 'Agregando…' : 'Agregar'}
          </Button>
        </form>
        {temporal && (
          <TemporaryPassword {...temporal} where="en este panel, donde también va a configurar el segundo factor" onClose={() => setTemporal(null)} />
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
      <div className="overflow-x-auto border-t border-slate-200">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--ink-muted)]">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">
                Nombre
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Rol
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
            {conf.supervisores.map((s) => (
              <tr key={s.id} className={s.activo ? '' : 'text-[var(--ink-muted)]'}>
                <td className="px-5 py-3">
                  <div className="font-medium text-[var(--ink-primary)]">
                    {s.nombre} {s.yo && <span className="font-normal text-[var(--ink-muted)]">(vos)</span>}
                  </div>
                  <div className="text-xs text-[var(--ink-muted)]">{s.email}</div>
                </td>
                <td className="px-3 py-3">{s.rol === 'admin' ? 'Admin' : 'Supervisor'}</td>
                <td className="px-3 py-3">
                  <SupervisorStatus s={s} />
                </td>
                <td className="px-5 py-3">
                  {!s.yo && (
                    <div className="flex justify-end gap-2">
                      {s.activo && (
                        <Button
                          variant="ghost"
                          disabled={busyId === s.id}
                          title="Contraseña temporal nueva y segundo factor nuevo (si perdió la contraseña o el celular)"
                          onClick={() => void resetAccess(s)}
                        >
                          Reiniciar acceso
                        </Button>
                      )}
                      <Button variant="secondary" disabled={busyId === s.id} onClick={() => void toggle(s)}>
                        {s.activo ? 'Desactivar' : 'Reactivar'}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Configuración de la empresa (solo admins): privacidad del panel, áreas y supervisores. */
export function Admin({ onSessionLost }: { onSessionLost: () => void }) {
  const [conf, setConf] = useState<Configuracion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => setConf(await api<Configuracion>('/admin/configuracion'));

  useEffect(() => {
    api<Configuracion>('/admin/configuracion')
      .then(setConf)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) onSessionLost();
        else setError(errorMessage(e));
      });
  }, [onSessionLost]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!conf) return <p className="text-sm text-[var(--ink-muted)]">Cargando…</p>;

  return (
    <div className="space-y-6">
      <Privacy conf={conf} onSaved={load} />
      <Areas conf={conf} onChanged={load} />
      <Supervisors conf={conf} onChanged={load} />
    </div>
  );
}

/** Mi cuenta: cambio de la contraseña propia. */
export function Account() {
  const [done, setDone] = useState(false);
  return (
    <Card className="max-w-md overflow-hidden">
      <SectionHeader title="Cambiar contraseña" description="De 10 caracteres o más. El segundo factor sigue igual." />
      <div className="space-y-4 p-5">
        <ChangePasswordForm onDone={() => setDone(true)} />
        {done && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Listo, tu contraseña cambió.
          </p>
        )}
      </div>
    </Card>
  );
}
