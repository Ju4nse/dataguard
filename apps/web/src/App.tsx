import { Account } from './components/Account';
import { DocumentResultStep } from './components/DocumentResultStep';
import { DocumentReviewStep } from './components/DocumentReviewStep';
import { ResultStep } from './components/ResultStep';
import { ReviewStep } from './components/ReviewStep';
import { UploadStep } from './components/UploadStep';
import { useStore, type Step } from './store';

// Revisar es opcional: el flujo normal es Subir → Listo.
const STEPS: { id: Step; label: string }[] = [
  { id: 'subir', label: 'Subir' },
  { id: 'resultado', label: 'Listo para usar' },
];

function Stepper({ current }: { current: Step }) {
  const currentIndex = current === 'subir' ? 0 : 1;
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              i <= currentIndex ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-500'
            }`}
          >
            {i + 1}
          </span>
          <span className={`hidden sm:inline ${i === currentIndex ? 'font-medium text-slate-900' : 'text-slate-500'}`}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-300" />}
        </li>
      ))}
    </ol>
  );
}

export default function App() {
  const step = useStore((s) => s.step);
  const mode = useStore((s) => s.mode);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 text-teal-700" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinejoin="round" d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
            </svg>
            <span className="font-semibold text-slate-900">SecureData AI</span>
          </div>
          <div className="flex items-center gap-4">
            <Stepper current={step} />
            <Account />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {step === 'subir' && <UploadStep />}
        {step === 'revisar' && (mode === 'tabla' ? <ReviewStep /> : <DocumentReviewStep />)}
        {step === 'resultado' && (mode === 'tabla' ? <ResultStep /> : <DocumentResultStep />)}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-3 text-center text-xs text-slate-500">
          🔒 Tu archivo se procesa en tu navegador. No se envía a ningún servidor ni a ninguna IA.
        </p>
      </footer>
    </div>
  );
}
