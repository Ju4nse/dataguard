import { restorePseudonyms, type EquivalenceRow } from '@securedata/detector';
import { useId, useMemo, useState } from 'react';
import { Button, Icon } from './ui';

/**
 * Traduce la respuesta de la IA externa: el usuario la pega y ve el mismo texto con los datos reales
 * en lugar de los seudónimos (resaltados). Todo ocurre en el navegador.
 */
export function TranslateResponse({ equivalences }: { equivalences: EquivalenceRow[] }) {
  const [input, setInput] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
  const inputId = useId();
  const result = useMemo(() => (input.trim() ? restorePseudonyms(input, equivalences) : null), [input, equivalences]);
  const total = result?.replaced.reduce((n, r) => n + r.count, 0) ?? 0;

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopyState('ok');
    } catch {
      setCopyState('error');
    }
    setTimeout(() => setCopyState('idle'), 2500);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-900">
          Respuesta de la IA
        </label>
        <textarea
          id={inputId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          placeholder="Pegá acá lo que te respondió ChatGPT, Claude o Copilot (con Persona_01, Empresa_03…)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 sm:text-sm"
        />
        <p className="flex items-start gap-1.5 text-xs text-slate-600">
          <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Se traduce en tu navegador: ni la respuesta ni los datos reales se envían a ningún lado.
        </p>
      </div>

      {result && (
        <div className="space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              {total > 0 ? (
                <>
                  Reemplazamos <strong className="font-semibold text-slate-900">{total}</strong> seudónimo{total === 1 ? '' : 's'} ({result.replaced.length}{' '}
                  distinto{result.replaced.length === 1 ? '' : 's'}) por los datos reales.
                </>
              ) : (
                'No encontramos seudónimos de este archivo en la respuesta.'
              )}
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void copy()} disabled={total === 0}>
                <Icon name={copyState === 'ok' ? 'check' : 'copy'} className="h-4 w-4" />
                {copyState === 'ok' ? '¡Copiada!' : copyState === 'error' ? 'No se pudo copiar' : 'Copiar respuesta traducida'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setInput('')}>
                Limpiar
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
              {result.parts.map((p, i) =>
                p.seudonimo ? (
                  <mark key={i} title={`En la respuesta decía ${p.seudonimo}`} className="rounded bg-emerald-50 px-0.5 font-medium text-emerald-900 ring-1 ring-inset ring-emerald-200">
                    {p.text}
                  </mark>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
            </p>
          </div>

          {result.unknown.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {result.unknown.join(', ')} no está{result.unknown.length === 1 ? '' : 'n'} en la tabla de equivalencias: la IA pudo haberl
                {result.unknown.length === 1 ? 'o' : 'os'} inventado o es de otro archivo.
              </span>
            </p>
          )}
          {result.irreversible.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-slate-600">
              <Icon name="eyeOff" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {result.irreversible.join(', ')}: son datos anonimizados y no se pueden recuperar (no quedan en la tabla de equivalencias).
              </span>
            </p>
          )}
          {total > 0 && (
            <p className="flex items-start gap-2 text-sm text-slate-600">
              <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <span>Esta versión tiene los datos reales: no la vuelvas a pegar en la IA.</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
