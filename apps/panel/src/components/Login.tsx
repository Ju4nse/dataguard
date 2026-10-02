import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { Button, Card, ErrorText, Input, Logo } from './ui';

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor');

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card className="space-y-5 p-6">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-sm text-slate-600">{subtitle}</p>
          </div>
          {children}
        </Card>
        <p className="text-center text-xs text-slate-500">Acceso exclusivo para responsables de seguridad.</p>
      </div>
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
    <Shell title="Activá el segundo factor" subtitle="Para ver el panel es obligatorio. Escaneá el código con Google Authenticator, Microsoft Authenticator o similar.">
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
