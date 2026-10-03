import { useEffect, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import type { Confidence } from '@securedata/shared';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 hover:shadow-md hover:shadow-brand-700/25 disabled:bg-slate-300 disabled:shadow-none',
  // Borde azul de la marca: se intensifica al pasar el mouse.
  secondary: 'bg-white text-brand-800 ring-1 ring-inset ring-brand-600/45 hover:bg-brand-50 hover:ring-2 hover:ring-brand-600',
  ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
};

// Altura mínima de 44px (40px en pantallas grandes): objetivo táctil cómodo.
const SIZES: Record<Size, string> = {
  md: 'min-h-11 px-4 text-sm sm:min-h-10',
  sm: 'min-h-11 px-3 text-sm sm:min-h-9',
};

// active:scale = respuesta al toque (sin mover el diseño de alrededor).
const buttonClass = (variant: Variant, size: Size, className: string) =>
  `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-[color,background-color,box-shadow,transform] duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${SIZES[size]} ${VARIANTS[variant]} ${className}`;

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

/** Link con aspecto de botón (para navegar, no para acciones). */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return <a className={buttonClass(variant, size, className)} {...props} />;
}

// 16px en celular (iOS no hace zoom al enfocar) y 44px de alto; más compactos desde 640px.
export const selectClass =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 sm:min-h-10 sm:text-sm';

export const inputClass =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 sm:min-h-10 sm:text-sm';

/** El usuario pidió menos movimiento en su sistema (accesibilidad). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Brillos azules que derivan muy lento detrás de las secciones oscuras.
 * Decorativo (aria-hidden); con movimiento reducido quedan quietos.
 */
export function DarkGlow({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute -right-[10%] -top-[30%] h-[36rem] w-[36rem] animate-drift-a rounded-full bg-brand-600/30 blur-3xl will-change-transform" />
      <div className="absolute -bottom-[35%] -left-[10%] h-[30rem] w-[30rem] animate-drift-b rounded-full bg-sky-400/15 blur-3xl will-change-transform" />
      <div className="absolute left-[35%] top-[20%] h-[22rem] w-[22rem] animate-drift-c rounded-full bg-indigo-500/15 blur-3xl will-change-transform" />
      {/* Grilla muy tenue: textura "técnica" sin distraer. */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
    </div>
  );
}

/**
 * Aparece con un deslizamiento suave al entrar en pantalla, con animación atada al scroll (CSS puro, ver index.css).
 * Sin JavaScript: si el navegador no soporta scroll-driven animations o hay movimiento reducido,
 * el contenido se ve directamente. Nunca puede quedar oculto.
 * `delay` (en ms) escalona elementos de una misma grilla: se traduce a un pequeño corrimiento del inicio.
 */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const style = { '--reveal-start': `${Math.round(delay / 10)}%` } as CSSProperties;
  return (
    <div style={style} className={`reveal ${className}`}>
      {children}
    </div>
  );
}

/** Cuenta de 0 al valor (para cifras destacadas). Con movimiento reducido muestra el valor final directo. */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  // Sin animación (movimiento reducido o valor 0) se devuelve el valor final directo, sin tocar el estado.
  const instant = prefersReducedMotion() || target === 0;
  useEffect(() => {
    if (instant) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, instant]);
  return instant ? target : value;
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`animate-spin ${className}`} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Contenedor de ancho máximo con márgenes laterales consistentes. */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

/** Tarjeta estática: sin hover (lo clickeable se distingue por sí mismo). */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

/** Link de "volver" con área táctil de 44px aunque se vea como texto. */
export function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-slate-600 hover:text-slate-900 sm:min-h-9"
    >
      <Icon name="arrowLeft" className="h-4 w-4" />
      {children}
    </button>
  );
}

/** Título de sección con antetítulo. `tone="dark"` para secciones sobre fondo navy. */
export function SectionHeading({
  eyebrow,
  title,
  text,
  id,
  tone = 'light',
}: {
  eyebrow: string;
  title: string;
  text?: string;
  id?: string;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <div className="mx-auto max-w-2xl space-y-3 text-center">
      <p className={`text-sm font-semibold ${dark ? 'text-brand-300' : 'text-brand-700'}`}>{eyebrow}</p>
      <h2 id={id} className={`text-balance text-2xl font-bold tracking-tight sm:text-3xl ${dark ? 'text-white' : 'text-slate-900'}`}>
        {title}
      </h2>
      {text && <p className={`text-pretty ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{text}</p>}
    </div>
  );
}

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  alta: 'bg-red-50 text-red-700 ring-red-200',
  media: 'bg-amber-50 text-amber-800 ring-amber-200',
  baja: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  alta: 'Confianza alta',
  media: 'Confianza media',
  baja: 'Posible — revisar',
};

/** Marca lo que encontró (o confirmó) la IA local, para distinguirlo de las reglas. */
export function AiBadge({ label = 'IA local' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200">
      <Icon name="cpu" className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CONFIDENCE_STYLES[confidence]}`}>
      {CONFIDENCE_LABELS[confidence]}
    </span>
  );
}

/** Íconos de línea (24px, trazo 1.8) para mantener un estilo único en toda la app. */
const ICONS = {
  shield: 'M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z|m9 12 2 2 4-4',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3|M5 10h14v10H5z|M12 14v2',
  upload: 'M12 16V4|m8 8 4-4 4 4|M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  sparkles: 'M12 3v4M12 17v4M3 12h4M17 12h4|m5.6 5.6 2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  laptop: 'M4 6h16v10H4z|M2 20h20',
  swap: 'M7 7h11l-3-3|M17 17H6l3 3',
  building: 'M4 21V5l8-3 8 3v16|M9 21v-4h6v4|M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01',
  download: 'M12 4v12|m8 12 4 4 4-4|M4 20h16',
  copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7Z',
  adjust: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12|M16 4v4M10 10v4M18 16v4',
  alert: 'M12 9v4M12 17h.01|M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  check: 'm5 12 5 5 9-10',
  arrowLeft: 'M19 12H5|m11 6-6 6 6 6',
  arrowRight: 'M5 12h14|m13 6 6 6-6 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z|M4 21a8 8 0 0 1 16 0',
  card: 'M3 6h18v12H3z|M3 10h18|M7 15h3',
  doc: 'M7 3h7l5 5v13H7z|M14 3v5h5|M10 13h6M10 17h6',
  chart: 'M4 20V4|M4 20h16|M8 16v-5M12 16V8M16 16v-3',
  eyeOff:
    'M3 3l18 18|M10.6 10.6a2 2 0 0 0 2.8 2.8|M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 5 10 7a13 13 0 0 1-3 3.9M6.6 6.6C4.3 8 2.7 10.3 2 12c1 2 5 7 10 7 1.7 0 3.2-.5 4.6-1.2',
  scale: 'M12 3v18|M5 7h14|M5 7l-3 7a4 4 0 0 0 6 0Z|M19 7l-3 7a4 4 0 0 0 6 0Z|M8 21h8',
  x: 'M6 6l12 12M18 6 6 18',
  cloud: 'M7 18a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.7-1.5A4 4 0 0 1 17 18Z',
  cpu: 'M7 7h10v10H7z|M10 10h4v4h-4z|M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  rule: 'M9 6h11M9 12h11M9 18h11|m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2',
  wifiOff:
    'M3 3l18 18|M8.5 16.5a5 5 0 0 1 7 0|M12 20h.01|M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.2-1.6|M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11.5 5',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name].split('|').map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function Stat({ label, value, tone = 'neutral' }: { label: string; value: number | string; tone?: 'neutral' | 'ok' | 'risk' }) {
  const color = tone === 'ok' ? 'text-emerald-700' : tone === 'risk' ? 'text-red-700' : 'text-slate-900';
  return (
    <Card className="px-3 py-3 sm:px-4">
      <div className={`text-xl font-bold tabular-nums sm:text-2xl ${color}`}>{value}</div>
      <div className="text-xs leading-snug text-slate-600">{label}</div>
    </Card>
  );
}
