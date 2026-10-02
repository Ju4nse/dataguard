import { Container, Icon, SectionHeading, type IconName } from './ui';

/** Paso del diagrama de flujo. */
function FlowNode({ icon, title, text, highlight = false }: { icon: IconName; title: string; text: string; highlight?: boolean }) {
  return (
    <div className={`flex flex-1 items-start gap-3 rounded-xl p-4 ${highlight ? 'bg-brand-700/30 ring-1 ring-brand-400/40' : 'bg-white/5 ring-1 ring-white/10'}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${highlight ? 'bg-brand-500/30 text-brand-200' : 'bg-white/10 text-slate-200'}`}>
        <Icon name={icon} />
      </span>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="text-sm text-slate-300">{text}</p>
      </div>
    </div>
  );
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-1 text-slate-400 lg:flex-col" aria-hidden="true">
      <Icon name="arrowRight" className="h-5 w-5 rotate-90 lg:rotate-0" />
      {label && <span className="text-xs font-medium">{label}</span>}
    </div>
  );
}

const POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'download', title: 'El modelo se descarga una sola vez', text: 'Queda guardado en tu navegador. Después analiza sin enviar nada a ningún lado.' },
  { icon: 'wifiOff', title: 'Nada viaja a un servidor', text: 'Ni a nosotros, ni al proveedor del modelo, ni a ninguna IA externa. Lo que analizás no sale de tu computadora.' },
  { icon: 'shield', title: 'Sin nuevas fugas', text: 'Como el análisis no sale de tu computadora, la herramienta no crea un nuevo lugar donde se puedan filtrar tus datos.' },
];

const LAYERS: { icon: IconName; title: string; status: 'activo' | 'integracion'; text: string; items: string[] }[] = [
  {
    icon: 'rule',
    title: 'Reglas y validadores',
    status: 'activo',
    text: 'Formatos con estructura fija, comprobados con su dígito verificador.',
    items: ['DNI', 'CUIT / CUIL', 'CBU / CVU', 'Tarjetas', 'Emails', 'Teléfonos', 'Contraseñas y tokens'],
  },
  {
    icon: 'cpu',
    title: 'Modelo de IA local (GLiNER)',
    status: 'integracion',
    text: 'Entiende el contexto para encontrar lo que no tiene un formato fijo. Corre en tu navegador, sin conexión a la nube.',
    items: ['Nombres de personas', 'Empresas', 'Direcciones', 'Información implícita'],
  },
];

/**
 * Cómo se detecta y por qué es seguro: la IA corre en la computadora del usuario.
 * El modelo GLiNER está en integración: se indica su estado para no prometer algo que todavía no está activo.
 */
export function LocalAiSection() {
  return (
    <section aria-labelledby="ia-local" className="bg-slate-950 py-16 text-white sm:py-20">
      <Container className="space-y-12">
        <SectionHeading
          id="ia-local"
          tone="dark"
          eyebrow="IA local"
          title="La IA viene a tus datos, no tus datos a la IA"
          text="Para encontrar datos sensibles, muchas herramientas los envían a un servicio de IA en la nube: justo lo que se quería evitar. En SecureData AI el análisis corre en tu propia computadora."
        />

        {/* Diagrama: todo ocurre dentro de "Tu computadora"; hacia afuera solo sale el archivo protegido. */}
        <figure className="space-y-3">
          <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
            <div className="relative flex flex-[3] flex-col gap-3 rounded-2xl border-2 border-dashed border-emerald-400/40 p-4 pt-8 lg:flex-row lg:items-center">
              <span className="absolute -top-3 left-4 inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-2 text-sm font-semibold text-emerald-400">
                <Icon name="laptop" className="h-4 w-4" />
                Tu computadora
              </span>
              <FlowNode icon="doc" title="Tu archivo" text="Planilla, documento o texto con datos reales." />
              <FlowArrow />
              <FlowNode icon="cpu" title="Análisis local" text="Reglas + modelo de IA, dentro de tu navegador." highlight />
              <FlowArrow />
              <FlowNode icon="shield" title="Archivo protegido" text="Con seudónimos en lugar de datos sensibles." />
            </div>
            <FlowArrow label="solo esto" />
            <div className="flex flex-1">
              <FlowNode icon="cloud" title="IA externa" text="ChatGPT, Claude o Copilot reciben solo la versión protegida." />
            </div>
          </div>
          <figcaption className="text-center text-sm text-slate-400">Los datos originales nunca cruzan el borde punteado.</figcaption>
        </figure>

        <ul className="grid gap-6 md:grid-cols-3">
          {POINTS.map((p) => (
            <li key={p.title} className="flex gap-3">
              <Icon name={p.icon} className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div className="space-y-1">
                <p className="font-semibold text-white">{p.title}</p>
                <p className="text-sm text-slate-300">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-4">
          <h3 className="text-center text-lg font-semibold text-white">Dos capas de detección</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {LAYERS.map((l) => (
              <div key={l.title} className="space-y-4 rounded-xl bg-white/5 p-5 ring-1 ring-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon name={l.icon} className="h-5 w-5 text-brand-300" />
                    <h4 className="font-semibold text-white">{l.title}</h4>
                  </div>
                  {l.status === 'activo' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                      <Icon name="check" className="h-3.5 w-3.5" />
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                      <Icon name="sparkles" className="h-3.5 w-3.5" />
                      En integración
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-300">{l.text}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {l.items.map((item) => (
                    <li key={item} className="rounded-md bg-white/10 px-2 py-1 text-sm text-slate-200">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
