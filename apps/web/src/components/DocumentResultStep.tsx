import { useState } from 'react';
import { documentOutputExtension, downloadDocument, downloadEquivalences } from '../lib/files';
import { useStore } from '../store';
import { ResultSummary } from './ResultSummary';
import { Button, Card, Icon } from './ui';

const PREVIEW_CHARS = 20000;

const FORMAT_NAMES: Record<string, string> = { pdf: 'PDF', docx: 'Word', txt: 'texto', md: 'Markdown', json: 'JSON' };

export function DocumentResultStep() {
  const { docResult, analysis, fileName, format, recordUsage } = useStore();
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
  if (!docResult) return null;
  const { text, equivalences, transformedCounts } = docResult;
  const protectedValues = Object.values(transformedCounts).reduce((n, v) => n + (v ?? 0), 0);
  const doubtful = analysis?.summary.reduce((n, s) => n + s.review, 0) ?? 0;
  const ext = documentOutputExtension(format);

  const copy = async () => {
    recordUsage();
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('ok');
    } catch {
      setCopyState('error');
    }
    setTimeout(() => setCopyState('idle'), 2500);
  };

  const copyLabel = copyState === 'ok' ? '¡Copiado!' : copyState === 'error' ? 'No se pudo copiar: descargalo' : 'Copiar texto protegido';

  return (
    <div className="space-y-6">
      <ResultSummary
        protectedCount={protectedValues}
        detail={protectedValues > 0 ? 'Reemplazamos cada dato sensible por un seudónimo o un marcador.' : ''}
        counts={transformedCounts}
        doubtfulNote={
          doubtful > 0
            ? `Por las dudas también ocultamos ${doubtful} dato${doubtful === 1 ? '' : 's'} que podría${doubtful === 1 ? '' : 'n'} ser sensible${doubtful === 1 ? '' : 's'}.`
            : undefined
        }
        equivalencesCount={equivalences.length}
        onDownloadEquivalences={() => downloadEquivalences(equivalences, fileName)}
        actions={
          <>
            <Button onClick={() => void copy()}>
              <Icon name={copyState === 'ok' ? 'check' : 'copy'} className="h-4 w-4" />
              {copyLabel}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                recordUsage();
                downloadDocument(text, fileName, format);
              }}
            >
              <Icon name="download" className="h-4 w-4" />
              Descargar .{ext}
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-medium text-slate-900">Así queda tu documento</h2>
          <span className="text-xs text-slate-500">
            {(format === 'pdf' || format === 'docx') && `Texto extraído del ${FORMAT_NAMES[format]} (sin tablas ni imágenes) · `}
            {text.length.toLocaleString('es-AR')} caracteres
          </span>
        </div>
        <pre className="whitespace-pre-wrap break-words px-4 py-4 font-sans text-sm leading-relaxed text-slate-700 sm:px-5 lg:max-h-[28rem] lg:overflow-auto">
          {text.slice(0, PREVIEW_CHARS)}
          {text.length > PREVIEW_CHARS && '\n…'}
        </pre>
      </Card>
    </div>
  );
}
