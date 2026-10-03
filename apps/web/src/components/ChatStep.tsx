import { DETECTION_LABELS } from '@securedata/shared';
import { maskForDisplay, restorePseudonyms, type Span } from '@securedata/detector';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useChat, type PromptTurn, type ResponseTurn } from '../chatStore';
import { useStore } from '../store';
import { EquivalencesActions } from './EquivalencesActions';
import { RichResponse } from './RichResponse';
import { AiBadge, BackLink, Button, Card, Icon } from './ui';

type Mode = 'prompt' | 'respuesta';

function CopyButton({ text, label, variant = 'primary' }: { text: string; label: string; variant?: 'primary' | 'secondary' }) {
  const [state, setState] = useState<'idle' | 'ok' | 'error'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('ok');
    } catch {
      setState('error');
    }
    setTimeout(() => setState('idle'), 2500);
  };
  return (
    <Button size="sm" variant={variant} onClick={() => void copy()}>
      <Icon name={state === 'ok' ? 'check' : 'copy'} className="h-4 w-4" />
      {state === 'ok' ? '¡Copiado!' : state === 'error' ? 'No se pudo copiar' : label}
    </Button>
  );
}

/** El prompt original con los datos detectados resaltados; tocar uno = no ocultarlo. */
function OriginalWithMarks({ text, spans }: { text: string; spans: Span[] }) {
  const toggleIgnore = useChat((s) => s.toggleIgnore);
  const nodes: ReactNode[] = [];
  let pos = 0;
  for (const sp of spans) {
    nodes.push(text.slice(pos, sp.start));
    nodes.push(
      <button
        type="button"
        key={sp.start}
        onClick={() => toggleIgnore(sp.value)}
        title={sp.ignored ? 'No se oculta. Tocá para volver a ocultarlo.' : `${DETECTION_LABELS[sp.type]}${sp.source === 'ia' ? ' · lo encontró la IA local' : ''}. Tocá si no es sensible.`}
        className={`rounded px-0.5 text-left ${sp.ignored ? 'bg-slate-200 text-slate-500 line-through' : 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200'}`}
      >
        {sp.ignored ? sp.value : maskForDisplay(sp.value)}
      </button>,
    );
    pos = sp.end;
  }
  nodes.push(text.slice(pos));
  return <>{nodes}</>;
}

function PromptBubble({ turn }: { turn: PromptTurn }) {
  const registry = useChat((s) => s.registry);
  const spans = turn.analysis.spans[0] ?? [];
  const active = spans.filter((s) => !s.ignored);
  // Para resaltar los seudónimos en el texto protegido.
  const parts = restorePseudonyms(turn.protectedText, registry.entries()).parts;

  return (
    <div className="space-y-3">
      <div className="ml-auto max-w-[92%] space-y-1.5 sm:max-w-[80%]">
        <p className="text-right text-xs font-medium text-slate-500">Tu prompt (solo lo ves vos)</p>
        <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-800">
          <OriginalWithMarks text={turn.original} spans={spans} />
        </div>
      </div>

      <div className="max-w-[92%] space-y-1.5 sm:max-w-[85%]">
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
          <Icon name="shield" className="h-3.5 w-3.5" />
          {active.length > 0 ? `Protegido: ${active.length} dato${active.length === 1 ? '' : 's'} reemplazado${active.length === 1 ? '' : 's'}` : 'No encontramos datos sensibles'}
          {turn.aiUsed && <AiBadge />}
        </p>
        <div className="space-y-3 rounded-2xl rounded-tl-sm border border-emerald-200 bg-white px-4 py-3 shadow-sm">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
            {parts.map((p, i) =>
              p.seudonimo ? (
                <mark key={i} title={`Es ${maskForDisplay(p.text)}`} className="rounded bg-emerald-50 px-0.5 font-medium text-emerald-900 ring-1 ring-inset ring-emerald-200">
                  {p.seudonimo}
                </mark>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
          {turn.analysis.summary.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Datos protegidos por tipo">
              {turn.analysis.summary.map((s) => (
                <li key={s.type} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {DETECTION_LABELS[s.type]} <span className="font-semibold text-slate-900">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={turn.protectedText} label="Copiar prompt protegido" />
            <span className="text-xs text-slate-500">Pegalo en ChatGPT, Claude o Copilot.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResponseBubble({ turn }: { turn: ResponseTurn }) {
  const { result } = turn;
  const total = result.replaced.reduce((n, r) => n + r.count, 0);
  return (
    <div className="max-w-[92%] space-y-1.5 sm:max-w-[85%]">
      <p className="flex items-center gap-1.5 text-xs font-medium text-brand-800">
        <Icon name="swap" className="h-3.5 w-3.5" />
        Respuesta de la IA, con los datos reales{total > 0 ? ` (${total} reemplazo${total === 1 ? '' : 's'})` : ''}
      </p>
      <div className="space-y-3 rounded-2xl rounded-tl-sm border border-brand-200 bg-brand-50/40 px-4 py-3">
        <RichResponse parts={result.parts} />
        {result.unknown.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-amber-800">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {result.unknown.join(', ')}: no está{result.unknown.length === 1 ? '' : 'n'} en esta conversación (¿inventado por la IA?).
          </p>
        )}
        {result.irreversible.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-slate-600">
            <Icon name="eyeOff" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {result.irreversible.join(', ')}: datos anonimizados, no se pueden recuperar.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={result.text} label="Copiar respuesta traducida" variant="secondary" />
          <span className="text-xs text-slate-500">Tiene datos reales: no la vuelvas a pegar en la IA.</span>
        </div>
      </div>
    </div>
  );
}

const STEPS = ['Escribí o pegá tu prompt', 'Copiá la versión protegida en la IA', 'Pegá la respuesta y leela con los datos reales'];

export function ChatStep() {
  const { turns, busy, aiProgress, sendPrompt, sendResponse, clear, registry } = useChat();
  const goToStep = useStore((s) => s.goToStep);
  const [mode, setMode] = useState<Mode>('prompt');
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const entries = registry.entries();

  // Después de cada mensaje, lo natural es el paso siguiente: prompt → respuesta → prompt.
  const lastKind = turns.at(-1)?.kind;
  useEffect(() => {
    if (lastKind) setMode(lastKind === 'prompt' ? 'respuesta' : 'prompt');
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, lastKind]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    const value = text;
    setText('');
    if (mode === 'prompt') await sendPrompt(value);
    else sendResponse(value);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink onClick={() => goToStep('subir')}>Inicio</BackLink>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Chat protegido</h1>
          <p className="text-sm text-slate-600">Los seudónimos se mantienen en toda la conversación. Nada sale de tu navegador.</p>
        </div>
        {turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <Icon name="x" className="h-4 w-4" />
            Nueva conversación
          </Button>
        )}
      </div>

      {turns.length === 0 ? (
        <Card className="p-5 sm:p-6">
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm text-slate-700">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-800">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <div className="space-y-6" aria-live="polite">
          {turns.map((t) => (t.kind === 'prompt' ? <PromptBubble key={t.id} turn={t} /> : <ResponseBubble key={t.id} turn={t} />))}
        </div>
      )}

      <form onSubmit={(e) => void submit(e)} className="sticky bottom-3 z-10">
        <Card className="space-y-3 p-3 shadow-xl shadow-slate-950/10 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Qué estás pegando">
              {(['prompt', 'respuesta'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`min-h-10 rounded-md px-3 text-sm font-medium transition-colors sm:min-h-8 ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {m === 'prompt' ? 'Mi prompt' : 'Respuesta de la IA'}
                </button>
              ))}
            </div>
            {busy && (
              <span className="text-xs text-slate-600" aria-live="polite">
                {aiProgress !== null ? `La IA local está revisando… ${Math.round(aiProgress * 100)}%` : 'Protegiendo…'}
              </span>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            rows={4}
            aria-label={mode === 'prompt' ? 'Tu prompt' : 'Respuesta de la IA'}
            placeholder={
              mode === 'prompt'
                ? 'Ej.: Redactá un mail para Graciela Benítez (DNI 32.456.789) de Ferretería Don Tito por la factura vencida…'
                : 'Pegá acá lo que te respondió la IA (con Persona_01, Empresa_01…)'
            }
            className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 sm:text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500">Ctrl + Enter para enviar</span>
            <Button type="submit" disabled={!text.trim() || busy}>
              <Icon name={mode === 'prompt' ? 'shield' : 'swap'} className="h-4 w-4" />
              {mode === 'prompt' ? 'Proteger prompt' : 'Traducir respuesta'}
            </Button>
          </div>
        </Card>
      </form>

      {entries.length > 0 && (
        <Card className="flex flex-col gap-3 border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <Icon name="key" className="hidden h-5 w-5 shrink-0 text-amber-700 sm:block" />
          <p className="flex-1 text-sm text-amber-900">
            <strong className="font-semibold">{entries.length} seudónimos en esta conversación.</strong> Se pierden al cerrar la pestaña: si vas a
            traducir respuestas más tarde, descargá la tabla.
          </p>
          <EquivalencesActions rows={entries} fileName="chat" />
        </Card>
      )}
      <div ref={end} />
    </div>
  );
}
