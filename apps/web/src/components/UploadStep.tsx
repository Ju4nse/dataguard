import { useRef, useState, type DragEvent } from 'react';
import { ACCEPTED_EXTENSIONS, MAX_SIZE_MB } from '../lib/files';
import { useStore } from '../store';
import { Button, Card } from './ui';

const DEMO_FILE = 'ejemplo_clientes.xlsx';

export function UploadStep() {
  const { loadFile, loading, error } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  const loadDemo = async () => {
    const res = await fetch(`/${DEMO_FILE}`);
    void loadFile(new File([await res.blob()], DEMO_FILE));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Depurá tu archivo antes de usarlo con IA</h1>
        <p className="mt-2 text-slate-600">
          Planillas, documentos o JSON: detectamos DNI, CUIT, CBU, emails, teléfonos, empresas y más. Vos decidís qué eliminar, anonimizar o
          seudonimizar.
        </p>
      </div>

      <Card className="p-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging ? 'border-teal-500 bg-teal-50' : 'border-slate-300'
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-10 w-10 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          <div>
            <p className="font-medium text-slate-800">{loading ? 'Leyendo el archivo…' : 'Arrastrá tu archivo acá'}</p>
            <p className="text-sm text-slate-500">Planillas (CSV, Excel, ODS), documentos (PDF, Word, TXT, Markdown) o JSON</p>
            <p className="text-xs text-slate-400">
              {ACCEPTED_EXTENSIONS.join(' ')} · hasta {MAX_SIZE_MB} MB
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button disabled={loading} onClick={() => input.current?.click()}>
              Elegir archivo
            </Button>
            <Button variant="ghost" disabled={loading} onClick={() => void loadDemo()}>
              Probar con un ejemplo
            </Button>
          </div>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
