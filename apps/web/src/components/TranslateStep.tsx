import type { EquivalenceRow } from '@securedata/detector';
import { useRef, useState, type FormEvent } from 'react';
import { decryptEquivalences, isEncryptedEquivalences } from '../lib/crypto';
import { readEquivalences } from '../lib/files';
import { useStore } from '../store';
import { TranslateResponse } from './TranslateResponse';
import { BackLink, Button, Card, Icon, inputClass } from './ui';

/**
 * Traductor independiente: para cuando la respuesta de la IA llega después. Usa la tabla del archivo
 * recién protegido o un "_equivalencias.csv" descargado antes.
 */
export function TranslateStep() {
  const { result, docResult, fileName, goToStep } = useStore();
  const current = result?.equivalences ?? docResult?.equivalences ?? [];
  const [loaded, setLoaded] = useState<{ name: string; rows: EquivalenceRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Tabla cifrada esperando la contraseña. */
  const [locked, setLocked] = useState<{ name: string; text: string } | null>(null);
  const [password, setPassword] = useState('');
  const [opening, setOpening] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const table = loaded?.rows ?? (current.length > 0 ? current : null);
  const source = loaded?.name ?? (current.length > 0 ? fileName : null);

  const load = async (file: File) => {
    setError(null);
    setLocked(null);
    try {
      const text = await file.text();
      if (isEncryptedEquivalences(text)) {
        setPassword('');
        setLocked({ name: file.name, text });
        return;
      }
      setLoaded({ name: file.name, rows: await readEquivalences(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!locked) return;
    setOpening(true);
    setError(null);
    try {
      setLoaded({ name: locked.name, rows: await decryptEquivalences(locked.text, password) });
      setLocked(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpening(false);
      setPassword('');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink onClick={() => goToStep(result || docResult ? 'resultado' : 'subir')}>Volver</BackLink>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Traducir la respuesta de la IA</h1>
        <p className="text-slate-700">
          Pegá lo que te respondió la IA y te lo devolvemos con los datos reales en lugar de los seudónimos, sin tener que buscarlos a mano en la tabla.
        </p>
      </div>

      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Icon name="swap" className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-slate-900">Tabla de equivalencias</p>
              <p className="text-sm text-slate-600">
                {table
                  ? `${source} · ${table.length} seudónimo${table.length === 1 ? '' : 's'}`
                  : 'Cargá la tabla de equivalencias que descargaste al proteger el archivo (CSV o cifrada).'}
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => input.current?.click()} className="shrink-0">
            <Icon name="upload" className="h-4 w-4" />
            {table ? 'Usar otra tabla' : 'Cargar equivalencias'}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            aria-label="Cargar tabla de equivalencias"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void load(file);
              e.target.value = '';
            }}
          />
        </div>
        {locked && (
          <form onSubmit={(e) => void unlock(e)} className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-end">
            <label className="block flex-1 space-y-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                <Icon name="lock" className="h-4 w-4" />
                {locked.name} está cifrada: escribí la contraseña
              </span>
              <input type="password" autoComplete="current-password" autoFocus className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <Button type="submit" disabled={!password || opening}>
              {opening ? 'Abriendo…' : 'Abrir'}
            </Button>
          </form>
        )}
        {error && (
          <p role="alert" className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        {table && (
          <div className="border-t border-slate-200 pt-4">
            <TranslateResponse equivalences={table} />
          </div>
        )}
      </Card>
    </div>
  );
}
