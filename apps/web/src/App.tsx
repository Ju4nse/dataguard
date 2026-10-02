import { Account } from './components/Account';
import { DocumentResultStep } from './components/DocumentResultStep';
import { DocumentReviewStep } from './components/DocumentReviewStep';
import { ResultStep } from './components/ResultStep';
import { ReviewStep } from './components/ReviewStep';
import { UploadStep } from './components/UploadStep';
import { Icon } from './components/ui';
import { useStore } from './store';

export default function App() {
  const step = useStore((s) => s.step);
  const mode = useStore((s) => s.mode);
  const reset = useStore((s) => s.reset);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button type="button" onClick={reset} className="flex items-center gap-2 rounded-md" aria-label="SecureData AI, volver al inicio">
            <Icon name="shield" className="h-7 w-7 text-teal-700" />
            <span className="font-semibold text-slate-900">SecureData AI</span>
          </button>
          <Account />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">
        {step === 'subir' && <UploadStep />}
        {step === 'revisar' && (mode === 'tabla' ? <ReviewStep /> : <DocumentReviewStep />)}
        {step === 'resultado' && (mode === 'tabla' ? <ResultStep /> : <DocumentResultStep />)}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-4 text-center text-xs text-slate-500">
          <Icon name="lock" className="h-3.5 w-3.5" />
          <span>Tu archivo se procesa en tu navegador. No se envía a ningún servidor ni a ninguna IA.</span>
          <span className="text-slate-300">·</span>
          <span>Prototipo académico — Emprendedorismo Tecnológico</span>
        </div>
      </footer>
    </div>
  );
}
