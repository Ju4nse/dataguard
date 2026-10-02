import { DETECTION_LABELS, type DetectionType } from '@securedata/shared';
import { useState } from 'react';
import { documentOutputExtension, downloadDocument, downloadEquivalences } from '../lib/files';
import { useStore } from '../store';
import { Button, Card, Stat } from './ui';

const PREVIEW_CHARS = 20000;

export function DocumentResultStep() {
  const { docResult, analysis, fileName, format, backToReview, reset, recordUsage, session } = useStore();
  const [copied, setCopied] = useState(false);
  if (!docResult) return null;
  const { text, equivalences, transformedCounts } = docResult;
  const protectedValues = Object.values(transformedCounts).reduce((n, v) => n + (v ?? 0), 0);
  const doubtful = analysis?.summary.reduce((n, s) => n + s.review, 0) ?? 0;

  const copy = async () => {
    recordUsage();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {protectedValues > 0 ? `Protegimos ${protectedValues.toLocaleString('es-AR')} datos sensibles` : 'No encontramos datos sensibles'}
          </h1>
          <p className="text-sm text-slate-600">
            {fileName} · Copialo y pegalo en la IA, o descargalo como .{documentOutputExtension(format)}. No hace falta que revises nada.
          </p>
        </div>
        <Button variant="secondary" onClick={backToReview}>
          Revisar y ajustar
        </Button>
      </div>

      {session && Object.keys(session.politica).length > 0 && (
        <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-900">Se aplicó la política de seguridad de {session.organizacion}.</p>
      )}

      {doubtful > 0 && (
        <p className="rounded-lg bg-sky-50 px-4 py-2 text-sm text-sky-900">
          Por las dudas también ocultamos {doubtful} dato{doubtful === 1 ? '' : 's'} que podría{doubtful === 1 ? '' : 'n'} ser sensible
          {doubtful === 1 ? '' : 's'}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Datos protegidos" value={protectedValues} tone="teal" />
        <Stat label="Seudónimos generados" value={equivalences.length} />
        <Stat label="Caracteres" value={text.length.toLocaleString('es-AR')} />
      </div>

      {protectedValues > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(transformedCounts).map(([t, n]) => (
            <span key={t} className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-200">
              {DETECTION_LABELS[t as DetectionType]}: {n}
            </span>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <span className="text-sm font-medium text-slate-700">Texto depurado</span>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void copy()}>
            {copied ? '¡Copiado!' : 'Copiar'}
          </Button>
        </div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-sans text-sm leading-relaxed text-slate-700">
          {text.slice(0, PREVIEW_CHARS)}
          {text.length > PREVIEW_CHARS && '\n…'}
        </pre>
      </Card>

      {format === 'pdf' || format === 'docx' ? (
        <p className="text-xs text-slate-500">
          El resultado es texto plano: se conserva el contenido pero no el formato (tablas, imágenes, estilos) del {format === 'pdf' ? 'PDF' : 'Word'} original.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="font-medium text-slate-900">Documento depurado</h2>
          <p className="text-sm text-slate-600">Este es el que podés usar en ChatGPT, Claude o Copilot.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void copy()}>{copied ? '¡Copiado!' : 'Copiar texto'}</Button>
            <Button
              variant="secondary"
              onClick={() => {
                recordUsage();
                downloadDocument(text, fileName, format);
              }}
            >
              Descargar .{documentOutputExtension(format)}
            </Button>
          </div>
        </Card>

        {equivalences.length > 0 && (
          <Card className="space-y-3 border-amber-200 bg-amber-50/50 p-5">
            <h2 className="font-medium text-slate-900">Tabla de equivalencias</h2>
            <p className="text-sm text-slate-700">
              Sirve para traducir las respuestas de la IA a los nombres reales ({equivalences.length} seudónimos).{' '}
              <strong>Contiene los datos originales:</strong> guardala en un lugar seguro y nunca la subas a una IA.
            </p>
            <Button variant="secondary" onClick={() => downloadEquivalences(equivalences, fileName)}>
              Descargar equivalencias (CSV)
            </Button>
          </Card>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={reset}>
          Procesar otro archivo
        </Button>
      </div>
    </div>
  );
}
