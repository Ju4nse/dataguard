import { friendlyAiError, MODEL } from '@securedata/ml';
import { hasStoredModel, removeStoredModel } from '@securedata/ml/storage';
import { DETECTION_LABELS, type DetectionType } from '@securedata/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { SITES } from '../content/sites';
import type { AiRequest } from '../lib/ai';
import { ApiError, login, logout, refreshSession, verify2fa } from '../lib/api';
import { DEFAULT_API_BASE, getSettings, onSettingsChanged, saveSettings, type Settings } from '../lib/storage';

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor de DataGuard');

/** Servidores que la extensión ya puede usar sin pedir permiso (desarrollo local). */
const BUILT_IN = new Set([DEFAULT_API_BASE, 'http://127.0.0.1:8787']);

function ShieldIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function Button({ variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const styles =
    variant === 'primary'
      ? 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-300'
      : 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:text-slate-400';
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-900">{label}</span>
      <input
        className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
        {...props}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

/** "DNI, CUIT / CUIL, Tarjeta y 2 más". */
function policySummary(types: string[]): string {
  const labels = types.slice(0, 3).map((t) => DETECTION_LABELS[t as DetectionType]);
  const rest = types.length - labels.length;
  return rest > 0 ? `${labels.join(', ')} y ${rest} más` : labels.join(', ');
}

function Connected({ settings }: { settings: Settings }) {
  const s = settings.session!;
  const [busy, setBusy] = useState(false);
  const types = Object.entries(s.politica)
    .filter(([, action]) => action !== 'mantener')
    .map(([type]) => type);
  return (
    <Section title="Cuenta">
      <div className="text-sm">
        <p className="font-semibold text-slate-900">{s.nombre}</p>
        <p className="text-slate-600">{s.organizacion}</p>
      </div>
      <p className="text-sm text-slate-600">
        {types.length === 0
          ? 'Tu empresa no definió una política: se aplican las acciones sugeridas.'
          : `La política de tu empresa exige proteger: ${policySummary(types)}.`}
      </p>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await logout();
          } catch {
            // Sin servidor igual se borra la sesión local (logout lo hace en su finally).
          }
          setBusy(false);
        }}
      >
        Salir
      </Button>
    </Section>
  );
}

function LoginForm() {
  const [step, setStep] = useState<'password' | 'codigo'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'password') {
        const r = await login(email, password);
        setPassword('');
        if (r.estado === 'pendiente') {
          setStep('codigo');
          return;
        }
      } else {
        await verify2fa(codigo);
      }
      await refreshSession();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Conectar con tu empresa">
      <p className="text-sm text-slate-600">
        Opcional. Con tu usuario se aplica la política de tu empresa y el responsable ve cuántos datos se protegieron: solo tipos y cantidades, nunca tus
        prompts.
      </p>
      <form onSubmit={submit} className="space-y-3">
        {step === 'password' ? (
          <>
            <Input label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        ) : (
          <Input
            label="Código de tu app autenticadora"
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
          {busy ? 'Conectando…' : step === 'password' ? 'Ingresar' : 'Verificar'}
        </Button>
      </form>
    </Section>
  );
}

function ServerForm({ settings }: { settings: Settings }) {
  const [value, setValue] = useState(settings.apiBase);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    let origin: string;
    try {
      const url = new URL(value.trim());
      origin = url.origin;
      if (url.protocol !== 'https:' && !BUILT_IN.has(origin)) throw new Error();
    } catch {
      setError('Usá una dirección https:// (o http://localhost:8787 para desarrollo).');
      return;
    }
    // El permiso se pide antes de cualquier otra espera: Chrome solo lo permite durante el clic.
    const granted = BUILT_IN.has(origin) || (await chrome.permissions.request({ origins: [`${origin}/*`] }));
    if (!granted) {
      setError('Sin ese permiso la extensión no puede conectarse al servidor.');
      return;
    }
    setValue(origin);
    if (origin !== settings.apiBase) await saveSettings({ apiBase: origin, session: null });
    setSaved(true);
  };

  return (
    <details className="group rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">Servidor</summary>
      <form onSubmit={save} className="mt-3 space-y-3">
        <Input label="Dirección del servidor de DataGuard" type="url" required value={value} onChange={(e) => setValue(e.target.value)} />
        {error && <ErrorText>{error}</ErrorText>}
        {saved && <p className="text-sm text-emerald-700">Guardado.</p>}
        <Button type="submit" variant="secondary">
          Guardar
        </Button>
      </form>
    </details>
  );
}

/** "ChatGPT, Claude, Gemini… y Copilot". */
const siteList = new Intl.ListFormat('es', { type: 'conjunction' }).format(SITES.map((s) => s.name));

const askWorker = async (req: AiRequest) => {
  try {
    await chrome.runtime.sendMessage(req);
  } catch {
    // El service worker se reinicia con el próximo mensaje.
  }
};

/** IA local: el mismo modelo que la app web, descargado una vez y guardado en esta computadora. */
function AiSection({ settings }: { settings: Settings }) {
  const { aiEnabled, aiStatus } = settings;
  const [stored, setStored] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (aiEnabled) return;
    (async () => setStored(await hasStoredModel()))();
  }, [aiEnabled]);

  const remove = async () => {
    setRemoving(true);
    await askWorker({ tipo: 'ia-desactivar' });
    await removeStoredModel();
    setStored(false);
    setRemoving(false);
  };

  const estado = aiEnabled ? aiStatus.estado : 'apagada';
  return (
    <Section title="IA local">
      {estado === 'apagada' && (
        <>
          <p className="text-sm text-slate-600">
            Encuentra nombres, empresas, direcciones y datos de salud que las reglas no ven. Corre en tu computadora: tus prompts no salen de ella.
          </p>
          <Button className="w-full" onClick={() => void askWorker({ tipo: 'ia-activar' })}>
            {stored ? 'Activar' : `Activar (descarga única de ${MODEL.sizeMb} MB)`}
          </Button>
          {stored && (
            <Button variant="secondary" className="w-full" disabled={removing} onClick={() => void remove()}>
              Borrar el modelo guardado
            </Button>
          )}
        </>
      )}
      {estado === 'descargando' && (
        <>
          <div className="space-y-1">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Descargando el modelo…</span>
              <span className="tabular-nums">{Math.round(aiStatus.avance * 100)}%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={Math.round(aiStatus.avance * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-brand-700 transition-[width]" style={{ width: `${aiStatus.avance * 100}%` }} />
            </div>
          </div>
          <p className="text-xs text-slate-500">Podés cerrar esta ventana: la descarga sigue. Mientras tanto protegen las reglas.</p>
        </>
      )}
      {estado === 'lista' && (
        <>
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Activa. Revisa cada prompt junto con las reglas.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => void askWorker({ tipo: 'ia-desactivar' })}>
              Desactivar
            </Button>
            <Button variant="secondary" className="flex-1" disabled={removing} onClick={() => void remove()}>
              Borrar el modelo
            </Button>
          </div>
        </>
      )}
      {estado === 'error' && (
        <>
          <ErrorText>{friendlyAiError(aiStatus.error ?? '')}</ErrorText>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void askWorker({ tipo: 'ia-activar' })}>
              Reintentar
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => void askWorker({ tipo: 'ia-desactivar' })}>
              Desactivar
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}

export function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    onSettingsChanged(setSettings);
    (async () => {
      setSettings(await getSettings());
      try {
        await refreshSession(); // si cambió la sesión, llega por onSettingsChanged
      } catch {
        // Servidor caído: se muestra lo guardado.
      }
    })();
  }, []);

  return (
    <div className="space-y-3 p-4">
      <header className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
          <ShieldIcon />
        </span>
        <span className="font-bold tracking-tight text-slate-900">DataGuard</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">Extensión</span>
      </header>

      <div className="flex gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
        <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <p>
          <strong className="font-semibold">Protegiendo {siteList}.</strong> Revisamos cada prompt en tu computadora y, si tiene datos sensibles, te avisamos
          antes de enviarlo.
        </p>
      </div>

      {settings && <AiSection settings={settings} />}
      {settings && (settings.session ? <Connected settings={settings} /> : <LoginForm />)}
      {settings && <ServerForm key={settings.apiBase} settings={settings} />}

      <p className="px-1 text-xs text-slate-500">Tus prompts nunca se guardan ni se envían a DataGuard.</p>
    </div>
  );
}
