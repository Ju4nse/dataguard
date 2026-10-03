import { MODEL } from '@securedata/ml';
import { useAi } from '../lib/ai';
import { Button, Icon } from './ui';

/**
 * Activa la IA local (GLiNER). Antes de descargar avisa el tamaño; mientras baja muestra el avance;
 * una vez lista queda guardada en el navegador y se puede apagar.
 * tone="dark" para usarla sobre fondos oscuros.
 */
export function AiToggle({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { status, progress, error, enable, disable } = useAi();
  const dark = tone === 'dark';
  const muted = dark ? 'text-slate-300' : 'text-slate-600';
  const strong = dark ? 'text-white' : 'text-slate-900';

  if (status === 'lista') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`flex items-center gap-2 text-sm font-semibold ${dark ? 'text-emerald-300' : 'text-emerald-700'}`}>
          <Icon name="cpu" className="h-4 w-4" />
          IA local activa
          <span className={`font-normal ${muted}`}>· revisa también nombres, empresas y direcciones</span>
        </p>
        <Button variant="ghost" size="sm" onClick={disable} className={dark ? 'text-slate-200 hover:bg-white/10 hover:text-white' : ''}>
          Desactivar
        </Button>
      </div>
    );
  }

  if (status === 'descargando') {
    const pct = Math.round(progress * 100);
    return (
      <div className="space-y-2" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-sm">
          <p className={`font-semibold ${strong}`}>Descargando el modelo de IA… {pct}%</p>
          <Button variant="ghost" size="sm" onClick={disable} className={dark ? 'text-slate-200 hover:bg-white/10 hover:text-white' : ''}>
            Cancelar
          </Button>
        </div>
        <div
          role="progressbar"
          aria-label="Descarga del modelo de IA local"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className={`h-2 overflow-hidden rounded-full ${dark ? 'bg-white/10' : 'bg-slate-200'}`}
        >
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className={`text-xs ${muted}`}>Se descarga una sola vez. Mientras tanto podés seguir usando DataGuard con las reglas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <p className={`flex items-center gap-2 text-sm font-semibold ${strong}`}>
            <Icon name="sparkles" className={`h-4 w-4 ${dark ? 'text-brand-300' : 'text-brand-700'}`} />
            Detección avanzada con IA local
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${dark ? 'bg-amber-400/15 text-amber-200' : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'}`}>Beta</span>
          </p>
          <p className={`text-sm ${muted}`}>
            Encuentra nombres, empresas y direcciones sin formato fijo. Descarga única de {MODEL.sizeMb} MB; después analiza sin conexión y nada sale de tu
            computadora.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={enable} className="shrink-0">
          <Icon name="download" className="h-4 w-4" />
          {status === 'error' ? 'Reintentar' : 'Activar IA local'}
        </Button>
      </div>
      {status === 'error' && error && (
        <p role="alert" className={`text-sm ${dark ? 'text-red-300' : 'text-red-700'}`}>
          No se pudo cargar la IA local: {error}
        </p>
      )}
    </div>
  );
}
