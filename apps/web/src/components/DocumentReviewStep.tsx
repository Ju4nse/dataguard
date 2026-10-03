import type { DetectionType } from '@securedata/shared';
import { DETECTION_LABELS, DETECTION_TYPES } from '@securedata/shared';
import { maskForDisplay, type Segment, type Span, type TypeDecision } from '@securedata/detector';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../store';
import { AiBadge, BackLink, Button, Card, Icon, inputClass, selectClass, Stat } from './ui';

const PREVIEW_CHARS = 6000;

const ACTION_OPTIONS: { value: TypeDecision['action']; label: string }[] = [
  { value: 'seudonimizar', label: 'Seudonimizar' },
  { value: 'anonimizar', label: 'Anonimizar' },
  { value: 'mantener', label: 'Mantener' },
];

/** Grilla de la tabla de tipos (desde 768px); en celular, tarjetas. */
const TYPE_GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_12rem] md:items-start md:gap-4';

const FORMAT_LABELS: Record<string, string> = { pdf: 'PDF', docx: 'Word', txt: 'Texto', md: 'Markdown', json: 'JSON' };

const MARK_STYLES = {
  alta: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200',
  media: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200',
  baja: 'bg-sky-50 text-sky-900 outline-dashed outline-1 outline-sky-400 hover:bg-sky-100',
  ignorado: 'bg-slate-100 text-slate-500 line-through hover:bg-slate-200',
};

/** Vista previa del texto con los datos detectados resaltados (y enmascarados). Click en uno = no ocultarlo. */
function Highlighted({ segments, spans }: { segments: Segment[]; spans: Span[][] }) {
  const toggleIgnore = useStore((s) => s.toggleIgnore);
  const nodes: ReactNode[] = [];
  let budget = PREVIEW_CHARS;
  const isJson = segments.some((s) => s.hint !== undefined);

  for (let i = 0; i < segments.length && budget > 0; i++) {
    const seg = segments[i]!;
    const segSpans = spans[i] ?? [];
    // En JSON solo se muestran los valores con hallazgos, con su clave.
    if (isJson && segSpans.length === 0) continue;
    if (isJson)
      nodes.push(
        <span key={`k${i}`} className="text-slate-400">
          {[seg.context, seg.hint].filter(Boolean).join('.')}:{' '}
        </span>,
      );
    const limit = budget;
    let pos = 0;
    for (const sp of segSpans) {
      if (sp.start >= limit) break;
      nodes.push(seg.text.slice(pos, sp.start));
      const style = sp.ignored ? 'ignorado' : sp.confidence;
      nodes.push(
        <button
          type="button"
          key={`${i}-${sp.start}`}
          onClick={() => toggleIgnore(sp.value)}
          className={`rounded px-0.5 text-left ${MARK_STYLES[style]}`}
          title={
            sp.ignored
              ? 'No se va a ocultar. Click para volver a ocultarlo.'
              : `${DETECTION_LABELS[sp.type]}${sp.confidence === 'baja' ? ' (posible — revisar)' : ''}${sp.source === 'ia' ? ' · lo encontró la IA local' : ''}. Click si no es un dato sensible.`
          }
        >
          {sp.ignored ? sp.value : maskForDisplay(sp.value)}
          <span className="ml-1 text-xs font-semibold uppercase opacity-80">
            {sp.ignored ? 'no se oculta' : DETECTION_LABELS[sp.type]}
            {!sp.ignored && sp.source === 'ia' && ' · IA'}
          </span>
        </button>,
      );
      pos = sp.end;
    }
    nodes.push(seg.text.slice(pos, Math.max(pos, limit)));
    budget -= Math.min(seg.text.length, limit);
    if (isJson) nodes.push('\n');
  }
  return <>{nodes}</>;
}

function AddTermForm() {
  const addTerm = useStore((s) => s.addTerm);
  const [value, setValue] = useState('');
  const [type, setType] = useState<DetectionType>('NOMBRE_PERSONA');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addTerm(value, type);
    setValue('');
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <input
        className={`${inputClass} sm:min-w-48 sm:flex-1`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ej.: Juan Pérez, Proyecto Atlas, Sucursal Rosario"
        aria-label="Texto a ocultar"
      />
      <select
        className={`${selectClass} sm:w-auto`}
        value={type}
        onChange={(e) => setType(e.target.value as DetectionType)}
        aria-label="Tipo del texto a ocultar"
      >
        {DETECTION_TYPES.map((t) => (
          <option key={t} value={t}>
            {DETECTION_LABELS[t]}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary" disabled={value.trim().length < 2}>
        Agregar
      </Button>
    </form>
  );
}

export function DocumentReviewStep() {
  const { fileName, format, segments, analysis, typeDecisions, customTerms, removeTerm, setTypeDecision, applyDocument, backToResult } = useStore();
  if (!analysis) return null;
  const total = analysis.summary.reduce((n, s) => n + s.count, 0);
  const chars = segments.reduce((n, s) => n + s.text.length, 0);

  return (
    <div className="space-y-6">
      <BackLink onClick={backToResult}>Volver al resultado</BackLink>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ajustá la protección</h1>
          <p className="break-words text-sm text-slate-600">
            {fileName} · {FORMAT_LABELS[format] ?? format} · {chars.toLocaleString('es-AR')} caracteres
          </p>
        </div>
        <Button onClick={applyDocument} className="w-full sm:w-auto">
          <Icon name="check" className="h-4 w-4" />
          Aplicar cambios
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Datos sensibles encontrados" value={total} />
        <Stat label="Tipos de dato distintos" value={analysis.summary.length} />
        <Stat label="Términos agregados a mano" value={customTerms.length} />
      </div>

      {/* min-w-0: sin esto, el contenido ancho de una columna de la grilla empuja toda la página hacia los costados. */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <Card className="overflow-hidden">
            {/* Encabezado solo desde 768px; en celular cada tipo es una tarjeta. */}
            <div
              aria-hidden="true"
              className={`hidden border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-600 ${TYPE_GRID}`}
            >
              <span>Tipo de dato</span>
              <span>Ejemplos</span>
              <span>Qué hacer</span>
            </div>
            {analysis.summary.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-600">
                No encontramos datos sensibles automáticamente. Si hay nombres u otros datos que quieras ocultar, agregalos abajo.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {analysis.summary.map((s) => {
                  const d = typeDecisions[s.type] ?? { action: 'mantener' };
                  return (
                    <li key={s.type} className={`space-y-3 px-4 py-4 md:space-y-0 ${TYPE_GRID}`}>
                      <div>
                        <div className="font-semibold text-slate-900">{DETECTION_LABELS[s.type]}</div>
                        <div className="text-xs text-slate-600">
                          {s.count} {s.count === 1 ? 'aparición' : 'apariciones'} · {s.distinct} {s.distinct === 1 ? 'valor' : 'valores distintos'}
                        </div>
                        {s.review > 0 && <div className="text-xs font-medium text-sky-800">{s.review} posible(s): revisalas en la vista previa</div>}
                        {s.ai > 0 && (
                          <div className="mt-1">
                            <AiBadge label={s.ai === s.count ? 'Todas por la IA local' : `${s.ai} por la IA local`} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {s.examples.map((ex, i) => (
                          <code key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                            {ex}
                          </code>
                        ))}
                      </div>
                      <div>
                        <span className="mb-1 block text-xs font-medium text-slate-600 md:sr-only">Qué hacer</span>
                        <select
                          aria-label={`Acción para ${DETECTION_LABELS[s.type]}`}
                          className={selectClass}
                          value={d.action}
                          onChange={(e) => setTypeDecision(s.type, { action: e.target.value as TypeDecision['action'] })}
                        >
                          {ACTION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {d.action === 'seudonimizar' && (
                          <label className="mt-2 block">
                            <span className="mb-1 block text-xs font-medium text-slate-600">Prefijo del seudónimo</span>
                            <input className={inputClass} value={d.prefix ?? ''} onChange={(e) => setTypeDecision(s.type, { prefix: e.target.value })} />
                          </label>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="space-y-3 p-4">
            <div>
              <h2 className="font-medium text-slate-900">Agregar texto a ocultar</h2>
              <p className="text-sm text-slate-600">
                Detectamos nombres frecuentes, pero se nos pueden escapar algunos (apellidos solos, nombres poco comunes). Agregá los que veas en la vista
                previa y los reemplazamos en todo el documento.
              </p>
            </div>
            <AddTermForm />
            {customTerms.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {customTerms.map((t, i) => (
                  <li key={t.value} className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-3 pr-0.5 text-sm text-slate-700">
                    {t.value} <span className="text-slate-500">· {DETECTION_LABELS[t.type]}</span>
                    <button
                      type="button"
                      onClick={() => removeTerm(i)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                      aria-label={`Quitar ${t.value}`}
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="flex min-w-0 flex-col lg:col-span-2">
          <div className="border-b border-slate-200 px-4 py-2">
            <div className="text-sm font-medium text-slate-900">Vista previa</div>
            <div className="text-xs text-slate-600">
              Tocá un dato resaltado si <strong>no</strong> es sensible. Los de borde punteado son posibles: revisalos. «IA» = lo encontró la IA local.
            </div>
          </div>
          {/* Scroll propio solo en escritorio (al lado de la tabla); en celular fluye con la página. */}
          <pre className="flex-1 whitespace-pre-wrap break-words px-4 py-3 font-sans text-sm leading-relaxed text-slate-700 lg:max-h-[32rem] lg:overflow-auto">
            <Highlighted segments={segments} spans={analysis.spans} />
            {chars > PREVIEW_CHARS && (
              <span className="block pt-2 text-xs text-slate-400">… (se muestran los primeros {PREVIEW_CHARS.toLocaleString('es-AR')} caracteres)</span>
            )}
          </pre>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={applyDocument} className="w-full sm:w-auto">
          Aplicar cambios
        </Button>
      </div>
    </div>
  );
}
