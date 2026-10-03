import type { EquivalenceRow } from '@securedata/detector';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { downloadEncryptedEquivalences, downloadEquivalences } from '../lib/files';
import { Button, Icon, inputClass } from './ui';

/** Pide una contraseña (dos veces) y descarga la tabla cifrada. */
function PasswordDialog({ rows, fileName, onClose }: { rows: EquivalenceRow[]; fileName: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Usá al menos 8 caracteres.');
    if (password !== repeat) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    try {
      await downloadEncryptedEquivalences(rows, fileName, password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={(e) => void submit(e)}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm animate-dialog space-y-5 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-brand-600/20"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cifrar-titulo"
      >
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Cerrar">
          <Icon name="x" className="h-5 w-5" />
        </button>
        <div className="space-y-2 pr-8">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Icon name="lock" />
          </span>
          <h2 id="cifrar-titulo" className="text-lg font-bold text-slate-900">
            Descargar la tabla cifrada
          </h2>
          <p className="text-sm text-slate-600">
            Sin la contraseña nadie puede leerla. Guardala bien: si la olvidás, no hay forma de recuperar los datos.
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-900">Contraseña</span>
          <input ref={first} type={visible ? 'text' : 'password'} autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-900">Repetila</span>
          <input type={visible ? 'text' : 'password'} autoComplete="new-password" className={inputClass} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="h-4 w-4" />
          Mostrar contraseña
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="w-full">
          <Icon name="download" className="h-4 w-4" />
          {busy ? 'Cifrando…' : 'Cifrar y descargar'}
        </Button>
      </form>
    </div>
  );
}

/** Botones para descargar la tabla de equivalencias: en CSV o cifrada con contraseña. */
export function EquivalencesActions({ rows, fileName }: { rows: EquivalenceRow[]; fileName: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
      <Button variant="secondary" onClick={() => setAsking(true)}>
        <Icon name="lock" className="h-4 w-4" />
        Descargar cifrada
      </Button>
      <Button variant="ghost" onClick={() => downloadEquivalences(rows, fileName)}>
        Descargar CSV
      </Button>
      {asking && <PasswordDialog rows={rows} fileName={fileName} onClose={() => setAsking(false)} />}
    </div>
  );
}
