import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { Button, DarkGlow, ErrorText, Input, Logo, ShieldIcon } from './ui';

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor');

const SECURITY_POINTS = [
  { title: 'Segundo factor obligatorio', text: 'La contraseña sola no alcanza para ver el panel.' },
  { title: 'Solo estadísticas agregadas', text: 'La detección corre en la computadora de cada empleado: al panel solo llegan cantidades.' },
  { title: 'Grupos protegidos', text: 'Las áreas con muy poca gente no se muestran por separado.' },
  { title: 'Cada consulta queda auditada', text: 'Se registra quién vio el panel y cuándo.' },
];

/** Pantalla de acceso: panel de confianza a la izquierda (escritorio) y formulario a la derecha. */
export function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <DarkGlow />
        <div className="relative">
          <Logo tone="dark" />
        </div>
        <div className="relative max-w-md animate-fade-up space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">Reporte de seguridad para responsables</h2>
            <p className="text-slate-300">Seguí cómo tu empresa protege los datos sensibles antes de usar IA, sin invadir la privacidad de nadie.</p>
          </div>
          <ul className="space-y-4">
            {SECURITY_POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <ShieldIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-slate-400">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-slate-500">Prototipo académico · Emprendedorismo Tecnológico</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm animate-fade-up space-y-8 [animation-delay:100ms]">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="text-slate-600">{subtitle}</p>
          </div>
          {children}
          <p className="text-sm text-slate-600">Acceso exclusivo para responsables de seguridad. ¿Sos empleado? Usá la app para proteger tus archivos.</p>
        </div>
      </main>
    </div>
  );
}

/** Login en dos pasos: contraseña y después el código de la app autenticadora. */
export function Login({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'password' | 'codigo'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** El servidor corre con el segundo factor desactivado (modo demo): se avisa con qué usuario entrar. */
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    void api<{ mfaDesactivado?: boolean }>('/salud')
      .then((r) => setDemoMode(!!r.mfaDesactivado))
      .catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (step === 'password') {
        const r = await api<{ estado: string }>('/auth/login', { email, password });
        setPassword('');
        if (r.estado === 'pendiente') setStep('codigo');
        else onDone();
      } else {
        await api('/auth/2fa', { codigo });
        onDone();
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title={step === 'password' ? 'Ingresar' : 'Segundo factor'}
      subtitle={step === 'password' ? 'Usá el usuario que te dio el administrador.' : 'Ingresá el código de 6 dígitos de tu app autenticadora.'}
    >
      {demoMode && step === 'password' && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <strong className="font-semibold">Modo demo, sin segundo factor.</strong> Entrá con <code className="font-mono">seguridad@demo.test</code> y la
          contraseña. Los usuarios que todavía no configuraron el segundo factor (como gerente) igual piden el QR.
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        {step === 'password' ? (
          <>
            <Input label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        ) : (
          <Input
            label="Código"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          />
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Verificando…' : step === 'password' ? 'Continuar' : 'Ingresar'}
        </Button>
      </form>
    </Shell>
  );
}

/** Alta obligatoria del segundo factor para responsables que todavía no lo tienen. */
export function Enroll2FA({ onDone, onLogout }: { onDone: () => void; onLogout: () => void }) {
  const [setup, setSetup] = useState<{ secreto: string; qr: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ secreto: string; otpauth: string }>('/auth/2fa/iniciar', {})
      .then(async (r) => setSetup({ secreto: r.secreto, qr: await QRCode.toDataURL(r.otpauth, { margin: 1, width: 200 }) }))
      .catch((e) => setError(message(e)));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/auth/2fa/confirmar', { codigo });
      onDone();
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <Shell
      title="Activá el segundo factor"
      subtitle="Para ver el panel es obligatorio. Escaneá el código con Google Authenticator, Microsoft Authenticator o similar."
    >
      {setup && (
        <div className="space-y-2 text-center">
          <img src={setup.qr} alt="Código QR para la app autenticadora" className="mx-auto h-48 w-48" />
          <p className="text-xs text-slate-500">
            ¿No podés escanear? Clave: <code className="break-all font-mono text-slate-700">{setup.secreto}</code>
          </p>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
        />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" className="w-full" disabled={!setup}>
          Activar
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onLogout}>
          Salir
        </Button>
      </form>
    </Shell>
  );
}
