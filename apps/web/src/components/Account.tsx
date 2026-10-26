import { DETECTION_SHORT_LABELS } from '@securedata/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, changePassword, fetchMyEvents, fetchSession, login, logout, verify2fa, type MyEvent } from '../lib/api';
import { useStore } from '../store';
import { Button, Icon, inputClass, Spinner, type IconName } from './ui';

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');

/** Sesión opcional del empleado: la app funciona igual sin ingresar. */
export function Account() {
  const session = useStore((s) => s.session);
  const setSession = useStore((s) => s.setSession);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void fetchSession().then((s) => s && setSession(s));
  }, [setSession]);

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-semibold text-slate-900">{session.nombre}</p>
          <p className="text-xs text-slate-600">{session.organizacion}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Icon name="user" className="h-4 w-4" />
          Mi cuenta
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void logout().finally(() => setSession(null));
          }}
        >
          Salir
        </Button>
        {open && <AccountDialog nombre={session.nombre} organizacion={session.organizacion} onClose={() => setOpen(false)} />}
      </div>
    );
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Icon name="building" className="h-4 w-4" />
        <span className="hidden sm:inline">Ingresar con mi empresa</span>
        <span className="sm:hidden">Ingresar</span>
      </Button>
      {open && <LoginDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-900">{label}</span>
      <input className={`${inputClass} min-h-11 text-base sm:text-sm`} {...props} />
    </label>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}

/** Diálogo centrado: se cierra con Escape, con la X o tocando afuera. */
function Dialog({
  icon,
  title,
  subtitle,
  wide = false,
  onClose,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portal al body: el encabezado tiene backdrop-blur, que vuelve "fixed" relativo a él y el diálogo quedaba arriba.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative max-h-[90dvh] w-full ${wide ? 'max-w-lg' : 'max-w-sm'} animate-dialog space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-brand-600/20`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Cerrar"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>
        <div className="space-y-2 pr-8">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Icon name={icon} />
          </span>
          <h2 id="dialog-title" className="text-lg font-bold text-slate-900">
            {title}
          </h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function LoginDialog({ onClose }: { onClose: () => void }) {
  const setSession = useStore((s) => s.setSession);
  const [step, setStep] = useState<'password' | 'codigo' | 'cambiar'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (step === 'password') {
        const r = await login(email, password);
        // La temporal se guarda (solo en memoria) para no pedirla dos veces al cambiarla.
        if (r.estado === 'cambiar_password') return setStep('cambiar');
        setPassword('');
        if (r.estado === 'pendiente') return setStep('codigo');
      } else if (step === 'codigo') {
        const r = await verify2fa(codigo);
        if (r.estado === 'cambiar_password') return setStep('cambiar');
      } else {
        if (nueva !== repetida) return setError('Las dos contraseñas no coinciden');
        await changePassword(password, nueva);
        setPassword('');
        setNueva('');
        setRepetida('');
      }
      const s = await fetchSession();
      if (s) setSession(s);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      icon={step === 'password' ? 'building' : 'lock'}
      title={step === 'password' ? 'Ingresar con mi empresa' : step === 'codigo' ? 'Segundo factor' : 'Elegí tu contraseña'}
      subtitle={
        step === 'password'
          ? 'Se aplica la política de seguridad de tu empresa. Tu empresa solo recibe estadísticas, nunca el contenido de tus archivos.'
          : step === 'codigo'
            ? 'Ingresá el código de 6 dígitos de tu app autenticadora.'
            : 'Entraste con una contraseña temporal. Elegí una nueva, de al menos 10 caracteres, que solo sepas vos.'
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {step === 'password' ? (
          <div className="space-y-4">
            <Field label="Email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        ) : step === 'cambiar' ? (
          <div className="space-y-4">
            <Field
              label="Contraseña nueva"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              autoFocus
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />
            <Field
              label="Repetila"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
            />
          </div>
        ) : (
          <Field
            label="Código"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          />
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Verificando…' : step === 'password' ? 'Ingresar' : step === 'codigo' ? 'Verificar' : 'Guardar y entrar'}
        </Button>
      </form>
    </Dialog>
  );
}

const ENTRADA: Record<MyEvent['tipo_entrada'], string> = { tabla: 'Planilla', documento: 'Documento', prompt: 'Mensaje a una IA' };
const DECISION: Record<NonNullable<MyEvent['decision_usuario']>, { label: string; tone: string }> = {
  enmascarado: { label: 'Protegido', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  ignorado: { label: 'Enviado sin proteger', tone: 'bg-amber-50 text-amber-900 ring-amber-200' },
  cancelado: { label: 'No se envió', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

/** Qué se hizo, en una línea: "Planilla .xlsx · 120 filas" o "Mensaje a una IA · chatgpt.com". */
function describe(e: MyEvent) {
  const parts = [ENTRADA[e.tipo_entrada] + (e.tipo_archivo ? ` .${e.tipo_archivo}` : '')];
  if (e.filas !== null && e.tipo_entrada === 'tabla') parts.push(`${e.filas.toLocaleString('es-AR')} filas`);
  if (e.sitio) parts.push(e.sitio);
  return parts.join(' · ');
}

/** Datos encontrados, sumando las acciones de un mismo tipo: "4 DNI, 2 Email". */
function summarize(e: MyEvent) {
  const byType = new Map<string, number>();
  for (const d of e.detecciones) {
    const label = DETECTION_SHORT_LABELS[d.tipo];
    byType.set(label, (byType.get(label) ?? 0) + d.cantidad);
  }
  return [...byType].map(([tipo, n]) => `${n.toLocaleString('es-AR')} ${tipo}`).join(', ');
}

/** Mi cuenta: historial propio (lo mismo que recibe la empresa) y cambio de contraseña. */
function AccountDialog({ nombre, organizacion, onClose }: { nombre: string; organizacion: string; onClose: () => void }) {
  const [tab, setTab] = useState<'actividad' | 'password'>('actividad');
  const tabs = [
    ['actividad', 'Mi actividad'],
    ['password', 'Contraseña'],
  ] as const;

  return (
    <Dialog wide icon="user" title={nombre} subtitle={organizacion} onClose={onClose}>
      <div role="tablist" className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-10 flex-1 rounded-md text-sm font-semibold transition-colors ${tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'actividad' ? <MyActivity /> : <ChangePasswordForm />}
    </Dialog>
  );
}

function MyActivity() {
  const [events, setEvents] = useState<MyEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyEvents()
      .then(setEvents)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!events) {
    return (
      <div className="flex justify-center py-8 text-brand-700">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Esto es todo lo que tu empresa recibe de tu uso: qué tipo de archivo o mensaje, cuántos datos sensibles y qué se hizo. Nunca el contenido.
      </p>
      {events.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">Todavía no hay actividad registrada.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {events.map((e) => (
            <li key={e.id} className="space-y-1 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-medium text-slate-900">{describe(e)}</p>
                <time className="text-xs text-slate-500" dateTime={e.creado_en}>
                  {new Date(e.creado_en).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                </time>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>{e.detecciones.length ? summarize(e) : 'Sin datos sensibles'}</span>
                {e.decision_usuario && (
                  <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${DECISION[e.decision_usuario].tone}`}>
                    {DECISION[e.decision_usuario].label}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {events.length === 50 && <p className="text-xs text-slate-500">Se muestran los últimos 50.</p>}
    </div>
  );
}

function ChangePasswordForm() {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (nueva !== repetida) return setError('Las dos contraseñas no coinciden');
    setBusy(true);
    try {
      await changePassword(actual, nueva);
      setActual('');
      setNueva('');
      setRepetida('');
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Contraseña actual" type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />
      <Field
        label="Contraseña nueva (10 caracteres o más)"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        value={nueva}
        onChange={(e) => setNueva(e.target.value)}
      />
      <Field
        label="Repetila"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        value={repetida}
        onChange={(e) => setRepetida(e.target.value)}
      />
      {error && <ErrorText>{error}</ErrorText>}
      {done && (
        <p role="status" className="flex gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
          Listo, tu contraseña cambió.
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Guardando…' : 'Cambiar contraseña'}
      </Button>
    </form>
  );
}
