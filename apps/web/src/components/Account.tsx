import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, fetchSession, login, logout, verify2fa } from '../lib/api';
import { useStore } from '../store';
import { Button, Icon, inputClass } from './ui';

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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void logout().finally(() => setSession(null));
          }}
        >
          Salir
        </Button>
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

function LoginDialog({ onClose }: { onClose: () => void }) {
  const setSession = useStore((s) => s.setSession);
  const [step, setStep] = useState<'password' | 'codigo'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (step === 'password') {
        const r = await login(email, password);
        setPassword('');
        if (r.estado === 'pendiente') return setStep('codigo');
      } else {
        await verify2fa(codigo);
      }
      const s = await fetchSession();
      if (s) setSession(s);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm animate-dialog space-y-5 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-brand-600/20"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
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
            <Icon name={step === 'password' ? 'building' : 'lock'} />
          </span>
          <h2 id="login-title" className="text-lg font-bold text-slate-900">
            {step === 'password' ? 'Ingresar con mi empresa' : 'Segundo factor'}
          </h2>
          <p className="text-sm text-slate-600">
            {step === 'password'
              ? 'Se aplica la política de seguridad de tu empresa. Tu empresa solo recibe estadísticas, nunca el contenido de tus archivos.'
              : 'Ingresá el código de 6 dígitos de tu app autenticadora.'}
          </p>
        </div>
        {step === 'password' ? (
          <div className="space-y-4">
            <Field label="Email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
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
        {error && (
          <p role="alert" className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Verificando…' : step === 'password' ? 'Ingresar' : 'Verificar'}
        </Button>
      </form>
    </div>
  );
}
