import { Account } from './components/Account';
import { DocumentResultStep } from './components/DocumentResultStep';
import { DocumentReviewStep } from './components/DocumentReviewStep';
import { ResultStep } from './components/ResultStep';
import { ReviewStep } from './components/ReviewStep';
import { UploadStep } from './components/UploadStep';
import { Container, Icon } from './components/ui';
import { PANEL_URL } from './lib/config';
import { useStore } from './store';

const NAV = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#ia-local', label: 'IA local' },
  { href: '#que-detectamos', label: 'Qué detectamos' },
  { href: '#privacidad', label: 'Privacidad' },
];

function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 rounded-md" aria-label="SecureData AI — volver al inicio">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
        <Icon name="shield" className="h-5 w-5" />
      </span>
      <span className="whitespace-nowrap text-base font-bold tracking-tight text-slate-900">SecureData AI</span>
    </button>
  );
}

export default function App() {
  const step = useStore((s) => s.step);
  const mode = useStore((s) => s.mode);
  const reset = useStore((s) => s.reset);
  const home = step === 'subir';

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-6">
          <Logo onClick={reset} />
          {home && (
            <nav aria-label="Secciones" className="hidden items-center gap-1 lg:flex">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
                  {n.label}
                </a>
              ))}
            </nav>
          )}
          <Account />
        </Container>
      </header>

      <main id="contenido" className="flex-1">
        {step === 'subir' && <UploadStep />}
        {step !== 'subir' && (
          <Container className="py-8 sm:py-10">
            {step === 'revisar' && (mode === 'tabla' ? <ReviewStep /> : <DocumentReviewStep />)}
            {step === 'resultado' && (mode === 'tabla' ? <ResultStep /> : <DocumentResultStep />)}
          </Container>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <Container className="flex flex-col gap-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Icon name="lock" className="h-4 w-4 text-slate-500" />
            <span>Tu archivo se analiza en tu navegador. Ni el archivo ni su análisis se envían a ningún servidor ni a ninguna IA externa.</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href={PANEL_URL} className="font-medium text-slate-700 hover:text-slate-900">
              Panel para empresas
            </a>
            <span className="text-slate-500">Prototipo académico · Emprendedorismo Tecnológico</span>
          </div>
        </Container>
      </footer>
    </div>
  );
}
