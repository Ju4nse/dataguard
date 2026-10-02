import { useRef, useState, type DragEvent } from 'react';
import { PANEL_URL } from '../lib/config';
import { ACCEPTED_EXTENSIONS, MAX_SIZE_MB } from '../lib/files';
import { useStore } from '../store';
import { LocalAiSection } from './LocalAiSection';
import { Button, ButtonLink, Card, Container, DarkGlow, Icon, Reveal, SectionHeading, Spinner, type IconName } from './ui';

const DEMO_FILE = 'ejemplo_clientes.xlsx';

const HERO_POINTS = [
  'Detecta DNI, CUIT, CBU, nombres, salarios y 12 tipos de datos más',
  'Lo protege automáticamente, sin revisar fila por fila',
  'El análisis corre en tu computadora: tus datos nunca salen de ella',
];

const GUARANTEES: { value: string; label: string }[] = [
  { value: '0 bytes', label: 'de tus archivos se envían a servidores' },
  { value: 'IA local', label: 'el análisis corre en tu navegador' },
  { value: '17 tipos', label: 'de datos sensibles reconocidos' },
  { value: 'Ley 25.326', label: 'pensado para minimizar datos personales' },
];

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'upload', title: 'Subí tu archivo', text: 'Una planilla, un contrato, un informe o un JSON, tal cual lo tenés.' },
  { icon: 'shield', title: 'Lo protegemos solo', text: 'Detectamos los datos sensibles y los reemplazamos según la política de tu empresa.' },
  { icon: 'check', title: 'Usalo con la IA', text: 'Descargalo o copialo en ChatGPT, Claude o Copilot sin exponer a nadie.' },
];

const PRINCIPLES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'laptop',
    title: 'Procesamiento local',
    text: 'La detección (reglas e IA) y el reemplazo ocurren en tu navegador. Ni nosotros ni ninguna IA externa ven el contenido.',
  },
  {
    icon: 'swap',
    title: 'Seudonimización reversible',
    text: '"Pérez SA" pasa a ser "Empresa_07" en todo el archivo. Con la tabla de equivalencias traducís la respuesta de la IA.',
  },
  { icon: 'building', title: 'Política de tu empresa', text: 'Si ingresás con tu empresa, se aplican sus reglas para cada tipo de dato. Vos no tenés que decidir nada.' },
  { icon: 'eyeOff', title: 'Solo estadísticas', text: 'Tu empresa ve cuántos datos se protegieron y de qué tipo. Nunca tus archivos, sus nombres ni su contenido.' },
];

const DETECTS: { icon: IconName; title: string; items: string[] }[] = [
  { icon: 'user', title: 'Identidad', items: ['DNI', 'CUIT / CUIL', 'Pasaporte', 'Nombres', 'Fecha de nacimiento', 'Edad'] },
  { icon: 'card', title: 'Financieros', items: ['CBU / CVU', 'Alias', 'Tarjetas', 'Salarios'] },
  { icon: 'doc', title: 'Contacto y empresa', items: ['Emails', 'Teléfonos', 'Direcciones', 'Razón social', 'Patentes'] },
  { icon: 'key', title: 'Técnicos y sensibles', items: ['Contraseñas', 'API keys y tokens', 'IPs', 'Salud', 'Religión', 'Afiliación sindical'] },
];

function UploadCard() {
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
    <Card className="p-2 shadow-xl shadow-slate-950/20">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`group flex flex-col items-center justify-center gap-5 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors duration-200 ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400'
        }`}
      >
        {/* El ícono responde al arrastrar (sube y crece) y se vuelve un spinner mientras se protege. */}
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-transform duration-300 ${
            dragging ? '-translate-y-1 scale-110' : 'group-hover:-translate-y-0.5'
          }`}
        >
          {loading ? <Spinner className="h-6 w-6" /> : <Icon name="upload" className="h-6 w-6" />}
        </div>
        <div className="space-y-1" aria-live="polite">
          <p className="font-semibold text-slate-900">{loading ? 'Protegiendo tu archivo…' : dragging ? 'Soltalo para protegerlo' : 'Arrastrá tu archivo acá'}</p>
          <p className="text-sm text-slate-600">CSV, Excel, ODS, PDF, Word, TXT, Markdown o JSON · hasta {MAX_SIZE_MB} MB</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button disabled={loading} onClick={() => input.current?.click()}>
            <Icon name="upload" className="h-4 w-4" />
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
          aria-label="Elegir archivo para proteger"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
            e.target.value = '';
          }}
        />
        <p className="flex items-center gap-1.5 text-xs text-slate-600">
          <Icon name="lock" className="h-3.5 w-3.5" />
          Se procesa en tu navegador: no se sube a ningún lado
        </p>
      </div>
      {error && (
        <p role="alert" className="m-2 mt-3 flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-left text-sm text-red-700">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </Card>
  );
}

export function UploadStep() {
  return (
    <>
      {/* Hero: propuesta + herramienta a la vista. */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <DarkGlow />
        <Container className="relative grid items-center gap-8 py-10 sm:gap-10 sm:py-20 lg:grid-cols-2 lg:gap-16">
          {/* Entrada escalonada: etiqueta → título → texto → puntos (80ms entre cada uno). */}
          <div className="space-y-5 sm:space-y-7">
            <p className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-brand-400/30 bg-white/5 px-3 py-1 text-sm text-slate-200">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              IA local · tus datos nunca salen de tu computadora
            </p>
            <div className="space-y-4">
              <h1 className="animate-fade-up text-balance text-3xl font-bold tracking-tight [animation-delay:80ms] sm:text-5xl">
                Usá IA con los datos de tu empresa sin exponer información sensible
              </h1>
              <p className="max-w-xl animate-fade-up text-pretty text-slate-300 [animation-delay:160ms] sm:text-lg">
                DataGuard detecta y protege los datos personales y confidenciales de tus archivos antes de que lleguen a ChatGPT, Claude o
                Copilot. Todo el análisis corre en tu computadora, así que la protección no crea nuevas fugas.
              </p>
            </div>
            <ul className="hidden animate-fade-up space-y-3 [animation-delay:240ms] sm:block">
              {HERO_POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-slate-200">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-fade-up text-slate-900 [animation-delay:200ms]">
            <UploadCard />
          </div>
        </Container>
      </section>

      {/* Garantías verificables. */}
      <section aria-label="Garantías" className="border-b border-slate-200 bg-white">
        <Container>
          <ul className="grid grid-cols-2 divide-slate-200 py-8 lg:grid-cols-4 lg:divide-x">
            {GUARANTEES.map((g, i) => (
              <li key={g.value} className="px-4 py-3 text-center lg:py-0">
                <Reveal delay={i * 60}>
                  <p className="text-2xl font-bold tracking-tight text-slate-900">{g.value}</p>
                  <p className="mt-1 text-sm text-slate-600">{g.label}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Cómo funciona. */}
      <section aria-labelledby="como-funciona" className="py-16 sm:py-20">
        <Container className="space-y-10">
          <SectionHeading id="como-funciona" eyebrow="Cómo funciona" title="Tres pasos, ninguna revisión obligatoria" />
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 80} className="h-full">
                  <Card className="h-full space-y-4 p-6">
                    <div className="flex items-center justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                        <Icon name={s.icon} />
                      </span>
                      <span className="text-sm font-semibold text-slate-500">Paso {i + 1}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{s.title}</h3>
                    <p className="text-slate-600">{s.text}</p>
                  </Card>
                </Reveal>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <LocalAiSection />

      {/* Seguridad por diseño. */}
      <section aria-labelledby="privacidad" className="border-y border-slate-200 bg-white py-16 sm:py-20">
        <Container className="space-y-10">
          <SectionHeading
            id="privacidad"
            eyebrow="Privacidad por diseño"
            title="La herramienta no se convierte en otro punto de fuga"
            text="Está pensada para que tus datos estén más seguros que antes de usarla, no menos."
          />
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={(i % 2) * 80} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/20">
                  <Icon name={p.icon} />
                </span>
                <div className="space-y-1">
                  <h3 className="font-semibold text-slate-900">{p.title}</h3>
                  <p className="text-slate-600">{p.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Qué detectamos. */}
      <section aria-labelledby="que-detectamos" className="py-16 sm:py-20">
        <Container className="space-y-10">
          <SectionHeading
            id="que-detectamos"
            eyebrow="Qué detectamos"
            title="Adaptado a los datos que se usan en Argentina"
            text="Valida los dígitos verificadores de CUIT, CBU y tarjetas, y reconoce formatos locales de teléfonos, documentos y direcciones."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DETECTS.map((d, i) => (
              <Reveal key={d.title} delay={i * 70} className="h-full">
                <Card className="h-full space-y-4 p-5">
                  <div className="flex items-center gap-2">
                    <Icon name={d.icon} className="h-5 w-5 text-brand-700" />
                    <h3 className="font-semibold text-slate-900">{d.title}</h3>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {d.items.map((item) => (
                      <li key={item} className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">
                        {item}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Para responsables de seguridad. */}
      <section aria-labelledby="empresas" className="pb-16 sm:pb-20">
        <Container>
          <Reveal className="relative flex flex-col gap-6 overflow-hidden rounded-2xl bg-slate-900 p-8 text-white ring-1 ring-brand-500/30 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <DarkGlow />
            <div className="relative max-w-2xl space-y-2">
              <h2 id="empresas" className="text-2xl font-bold tracking-tight">
                ¿Sos responsable de seguridad?
              </h2>
              <p className="text-slate-300">
                Definí la política de tu empresa y seguí cuántos datos sensibles se protegen por área, sin ver el contenido de ningún archivo. Acceso
                con segundo factor y auditoría de cada consulta.
              </p>
            </div>
            <ButtonLink href={PANEL_URL} variant="secondary" className="relative shrink-0">
              <Icon name="chart" className="h-4 w-4" />
              Ir al panel para empresas
            </ButtonLink>
          </Reveal>

          <aside className="mt-8 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">Limitaciones del prototipo</p>
              <p>
                Es un prototipo académico. Hoy la detección usa reglas, validadores y diccionarios; el modelo de IA local (GLiNER) está en
                integración para mejorar nombres, direcciones e información implícita. Puede escaparse algún dato o marcarse de más: no lo uses
                todavía con datos reales de tu empresa.
              </p>
            </div>
          </aside>
        </Container>
      </section>
    </>
  );
}
