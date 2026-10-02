import { useRef, useState, type DragEvent } from 'react';
import { ACCEPTED_EXTENSIONS, MAX_SIZE_MB } from '../lib/files';
import { useStore } from '../store';
import { Button, Card, Icon, type IconName } from './ui';

const DEMO_FILE = 'ejemplo_clientes.xlsx';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'upload', title: 'Subí tu archivo', text: 'Planilla, documento o JSON, tal cual lo tenés.' },
  { icon: 'sparkles', title: 'Lo protegemos solo', text: 'Detectamos los datos sensibles y los reemplazamos automáticamente.' },
  { icon: 'check', title: 'Usalo con la IA', text: 'Descargalo o copialo en ChatGPT, Claude o Copilot.' },
];

const PRINCIPLES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'laptop', title: 'Procesamiento local', text: 'Tu archivo nunca sale de tu computadora: ni a nuestros servidores ni a ninguna IA.' },
  { icon: 'shield', title: 'Sin revisar fila por fila', text: 'La protección es automática. Revisar es opcional, para cuando quieras ajustar algo.' },
  {
    icon: 'swap',
    title: 'Seudonimización reversible',
    text: '"Pérez SA" pasa a ser "Empresa_07" en todo el archivo. Con la tabla de equivalencias traducís lo que responda la IA.',
  },
  { icon: 'building', title: 'Política de tu empresa', text: 'Si ingresás con tu empresa se aplican sus reglas. Tu empresa ve solo estadísticas, nunca tus archivos.' },
];

const DETECTS = ['DNI', 'CUIT / CUIL', 'CBU y alias', 'Tarjetas', 'Emails', 'Teléfonos', 'Nombres', 'Empresas', 'Direcciones', 'Salarios', 'Contraseñas y tokens', 'Datos de salud'];

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
    <div className="space-y-14">
      <section className="mx-auto max-w-3xl space-y-8 text-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Seguridad de datos + IA responsable</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Usá IA con tus datos sin exponer información sensible</h1>
          <p className="mx-auto max-w-2xl text-pretty text-slate-600">
            Subí una planilla o un documento y lo protegemos automáticamente: DNI, CUIT, CBU, nombres, salarios y más quedan reemplazados antes
            de que llegue a cualquier herramienta de IA.
          </p>
        </div>

        <Card className="p-2 text-left">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
              dragging ? 'border-teal-500 bg-teal-50' : 'border-slate-300'
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <Icon name="upload" className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-slate-900">{loading ? 'Protegiendo tu archivo…' : 'Arrastrá tu archivo acá'}</p>
              <p className="text-sm text-slate-500">Planillas (CSV, Excel, ODS), documentos (PDF, Word, TXT, Markdown) o JSON · hasta {MAX_SIZE_MB} MB</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button disabled={loading} onClick={() => input.current?.click()}>
                Elegir archivo
              </Button>
              <Button variant="secondary" disabled={loading} onClick={() => void loadDemo()}>
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
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
            {error}
          </p>
        )}

        <ol className="grid gap-4 text-left sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{i + 1}</span>
              <div>
                <p className="text-sm font-medium text-slate-900">{s.title}</p>
                <p className="text-sm text-slate-500">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-slate-500">Cómo te protegemos</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p) => (
            <Card key={p.title} className="space-y-3 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Icon name={p.icon} />
              </div>
              <h3 className="font-medium text-slate-900">{p.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{p.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl space-y-3 text-center">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Qué detectamos</h2>
        <ul className="flex flex-wrap justify-center gap-2">
          {DETECTS.map((d) => (
            <li key={d} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700">
              {d}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">Adaptado a formatos argentinos: valida los dígitos verificadores de CUIT, CBU y tarjetas.</p>
      </section>

      <aside className="mx-auto flex max-w-3xl gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium">Limitaciones del prototipo</p>
          <p className="text-amber-800">
            Es un prototipo académico: la detección se basa en patrones y diccionarios, así que puede escaparse algún dato o marcar de más. No lo
            uses todavía con datos reales de tu empresa.
          </p>
        </div>
      </aside>
    </div>
  );
}
