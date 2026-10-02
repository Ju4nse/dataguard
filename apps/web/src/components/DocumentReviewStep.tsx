import type { DetectionType } from '@securedata/shared';
import { DETECTION_LABELS, DETECTION_TYPES } from '@securedata/shared';
import { maskForDisplay, type Segment, type Span, type TypeDecision } from '@securedata/detector';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../store';
import { Button, Card, Icon, inputClass, selectClass, Stat } from './ui';

const PREVIEW_CHARS = 6000;

const ACTION_OPTIONS: { value: TypeDecision['action']; label: string }[] = [
  { value: 'seudonimizar', label: 'Seudonimizar' },
  { value: 'anonimizar', label: 'Anonimizar' },
  { value: 'mantener', label: 'Mantener' },
];

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
    if (isJson) nodes.push(<span key={`k${i}`} className="text-slate-400">{[seg.context, seg.hint].filter(Boolean).join('.')}: </span>);
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
              : `${DETECTION_LABELS[sp.type]}${sp.confidence === 'baja' ? ' (posible — revisar)' : ''}. Click si no es un dato sensible.`
          }
        >
          {sp.ignored ? sp.value : maskForDisplay(sp.value)}
          <span className="ml-1 text-[10px] font-semibold uppercase opacity-70">{sp.ignored ? 'no se oculta' : DETECTION_LABELS[sp.type]}</span>
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
    <form onSubmit={submit} className="flex flex-wrap gap-2">
      <input
        className={`${inputClass} min-w-48 flex-1`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ej.: Juan Pérez, Proyecto Atlas, Sucursal Rosario"
        aria-label="Texto a ocultar"
      />
      <select className={`${selectClass} w-auto`} value={type} onChange={(e) => setType(e.target.value as DetectionType)} aria-label="Tipo del texto a ocultar">
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
  const { fileName, format, segments, analysis, typeDecisions, customTerms, removeTerm, setTypeDecision, applyDocument } = useStore();
  if (!analysis) return null;
  const total = analysis.summary.reduce((n, s) => n + s.count, 0);
  const chars = segments.reduce((n, s) => n + s.text.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Ajustá la protección</h1>
          <p className="text-sm text-slate-600">
            {fileName} · {FORMAT_LABELS[format] ?? format} · {chars.toLocaleString('es-AR')} caracteres
          </p>
        </div>
        <Button onClick={applyDocument}>
          <Icon name="check" className="h-4 w-4" />
          Aplicar cambios
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Datos sensibles encontrados" value={total} tone={total ? 'red' : 'teal'} />
        <Stat label="Tipos de dato distintos" value={analysis.summary.length} />
        <Stat label="Términos agregados a mano" value={customTerms.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Tipo de dato</th>
                  <th className="px-4 py-2 font-medium">Ejemplos</th>
                  <th className="px-4 py-2 font-medium">Qué hacer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analysis.summary.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">
                      No encontramos datos sensibles automáticamente. Si hay nombres u otros datos que quieras ocultar, agregalos abajo.
                    </td>
                  </tr>
                )}
                {analysis.summary.map((s) => {
                  const d = typeDecisions[s.type] ?? { action: 'mantener' };
                  return (
                    <tr key={s.type} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{DETECTION_LABELS[s.type]}</div>
                        <div className="text-xs text-slate-500">
                          {s.count} {s.count === 1 ? 'aparición' : 'apariciones'} · {s.distinct} {s.distinct === 1 ? 'valor' : 'valores distintos'}
                        </div>
                        {s.review > 0 && <div className="text-xs font-medium text-sky-700">{s.review} posible(s): revisalas en la vista previa</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {s.examples.map((ex, i) => (
                            <code key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                              {ex}
                            </code>
                          ))}
                        </div>
                      </td>
                      <td className="w-52 px-4 py-3">
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
                          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                            Prefijo
                            <input className={inputClass} value={d.prefix ?? ''} onChange={(e) => setTypeDecision(s.type, { prefix: e.target.value })} />
                          </label>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card className="space-y-3 p-4">
            <div>
              <h2 className="font-medium text-slate-900">Agregar texto a ocultar</h2>
              <p className="text-sm text-slate-600">
                Detectamos nombres frecuentes, pero se nos pueden escapar algunos (apellidos solos, nombres poco comunes). Agregá los que
                veas en la vista previa y los reemplazamos en todo el documento.
              </p>
            </div>
            <AddTermForm />
            {customTerms.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {customTerms.map((t, i) => (
                  <li key={t.value} className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs text-slate-700">
                    {t.value} <span className="text-slate-400">· {DETECTION_LABELS[t.type]}</span>
                    <button
                      type="button"
                      onClick={() => removeTerm(i)}
                      className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                      aria-label={`Quitar ${t.value}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="flex flex-col lg:col-span-2">
          <div className="border-b border-slate-200 px-4 py-2">
            <div className="text-sm font-medium text-slate-700">Vista previa</div>
            <div className="text-xs text-slate-500">
              Hacé click en un dato resaltado si <strong>no</strong> es sensible. Los de borde punteado son posibles: revisalos.
            </div>
          </div>
          <pre className="max-h-[32rem] flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-sans text-sm leading-relaxed text-slate-700">
            <Highlighted segments={segments} spans={analysis.spans} />
            {chars > PREVIEW_CHARS && <span className="block pt-2 text-xs text-slate-400">… (se muestran los primeros {PREVIEW_CHARS.toLocaleString('es-AR')} caracteres)</span>}
          </pre>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={applyDocument}>Aplicar cambios</Button>
      </div>
    </div>
  );
}
