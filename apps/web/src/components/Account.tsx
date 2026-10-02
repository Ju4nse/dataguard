import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, fetchSession, login, logout, verify2fa } from '../lib/api';
import { useStore } from '../store';
import { Button, inputClass } from './ui';

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
      <div className="flex items-center gap-2 text-sm">
        <span className="hidden text-slate-600 md:inline">
          {session.nombre} · {session.organizacion}
        </span>
        <Button
          variant="ghost"
          className="px-2 py-1"
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
      <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => setOpen(true)}>
        Ingresar con mi empresa
      </Button>
      {open && <LoginDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function LoginDialog({ onClose }: { onClose: () => void }) {
  const setSession = useStore((s) => s.setSession);
  const [step, setStep] = useState<'password' | 'codigo'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
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
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <div>
          <h2 id="login-title" className="text-lg font-semibold text-slate-900">
            {step === 'password' ? 'Ingresar con mi empresa' : 'Segundo factor'}
          </h2>
          <p className="text-sm text-slate-600">
            {step === 'password'
              ? 'Se aplica la política de seguridad de tu empresa. Tu empresa solo recibe estadísticas (cantidad y tipo de datos), nunca el contenido de tus archivos.'
              : 'Ingresá el código de 6 dígitos de tu app autenticadora.'}
          </p>
        </div>
        {step === 'password' ? (
          <>
            <input className={inputClass} type="email" placeholder="Email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <input
              className={inputClass}
              type="password"
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        ) : (
          <input
            className={inputClass}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            required
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          />
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">{step === 'password' ? 'Ingresar' : 'Verificar'}</Button>
        </div>
      </form>
    </div>
  );
}
