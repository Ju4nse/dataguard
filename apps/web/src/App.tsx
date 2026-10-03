import { useEffect, useRef, useState } from 'react';
import { Account } from './components/Account';
import { DocumentResultStep } from './components/DocumentResultStep';
import { DocumentReviewStep } from './components/DocumentReviewStep';
import { ResultStep } from './components/ResultStep';
import { ReviewStep } from './components/ReviewStep';
import { TranslateStep } from './components/TranslateStep';
import { ChatStep } from './components/ChatStep';
import { UploadStep } from './components/UploadStep';
import { Container, Icon } from './components/ui';
import { BRAND } from './lib/brand';
import { PANEL_URL, STATIC_DEMO } from './lib/config';
import { useStore, type Step } from './store';

const NAV = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#ia-local', label: 'IA local' },
  { href: '#que-detectamos', label: 'Qué detectamos' },
  { href: '#privacidad', label: 'Privacidad' },
];

function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1 flex min-h-11 items-center gap-2 rounded-md px-1" aria-label={`${BRAND} — volver al inicio`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
        <Icon name="shield" className="h-5 w-5" />
      </span>
      <span className="whitespace-nowrap text-base font-bold tracking-tight text-slate-900">{BRAND}</span>
    </button>
  );
}

/** Menú de secciones para pantallas de menos de 1024px (en escritorio se ve en el encabezado). */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="menu-secciones"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 ring-1 ring-inset ring-brand-600/30 transition-colors hover:bg-brand-50 hover:ring-brand-600"
      >
        <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
        {open ? (
          <Icon name="x" className="h-6 w-6" />
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>
      {open && (
        <nav id="menu-secciones" aria-label="Secciones" className="absolute inset-x-0 top-16 animate-dropdown border-b border-slate-200 bg-white shadow-lg">
          <Container className="grid gap-1 py-3 sm:grid-cols-2">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              >
                {n.label}
              </a>
            ))}
            {PANEL_URL && (
              <a
                href={PANEL_URL}
                className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-base font-medium text-brand-700 hover:bg-brand-50 sm:col-span-2"
              >
                <Icon name="chart" className="h-5 w-5" />
                Panel para empresas
              </a>
            )}
          </Container>
        </nav>
      )}
    </div>
  );
}

/**
 * Cada paso del flujo es una entrada del historial: el botón "atrás" del navegador (o del celular)
 * vuelve al paso anterior en lugar de salir de la app.
 */
function useStepHistory(step: Step) {
  const goToStep = useStore((s) => s.goToStep);

  useEffect(() => {
    if (window.history.state?.step !== step) {
      window.history[window.history.state?.step ? 'pushState' : 'replaceState']({ step }, '');
    }
  }, [step]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => goToStep((e.state?.step as Step | undefined) ?? 'subir');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [goToStep]);
}

export default function App() {
  const step = useStore((s) => s.step);
  const mode = useStore((s) => s.mode);
  const reset = useStore((s) => s.reset);
  const home = step === 'subir';
  useStepHistory(step);

  // Al cambiar de paso, arriba de todo (como una página nueva).
  // (Con llaves: el efecto no debe devolver nada; algunos navegadores devuelven una promesa desde scrollTo.)
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <Container className="relative flex h-16 items-center justify-between gap-4">
          <Logo onClick={reset} />
          {home && (
            <nav aria-label="Secciones" className="hidden items-center gap-1 lg:flex">
              {NAV.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  {n.label}
                </a>
              ))}
            </nav>
          )}
          <div className="flex items-center gap-1 sm:gap-2">
            {!STATIC_DEMO && <Account />}
            {home && <MobileMenu />}
          </div>
        </Container>
      </header>

      <main id="contenido" className="flex-1">
        {step === 'subir' && <UploadStep />}
        {step !== 'subir' && (
          <Container className="py-6 sm:py-10">
            {step === 'revisar' && (mode === 'tabla' ? <ReviewStep /> : <DocumentReviewStep />)}
            {step === 'resultado' && (mode === 'tabla' ? <ResultStep /> : <DocumentResultStep />)}
            {step === 'traducir' && <TranslateStep />}
            {step === 'chat' && <ChatStep />}
          </Container>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <Container className="flex flex-col gap-4 py-8 text-sm text-slate-600 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-2">
            <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <span>Tu archivo se analiza en tu navegador. Ni el archivo ni su análisis se envían a ningún servidor ni a ninguna IA externa.</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {PANEL_URL && (
              <a href={PANEL_URL} className="inline-flex min-h-11 items-center font-medium text-slate-700 hover:text-slate-900 lg:min-h-0">
                Panel para empresas
              </a>
            )}
            <span className="text-slate-500">Prototipo académico · Emprendedorismo Tecnológico</span>
          </div>
        </Container>
      </footer>
    </div>
  );
}
