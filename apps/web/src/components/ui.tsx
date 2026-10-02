import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Confidence } from '@securedata/shared';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 disabled:bg-slate-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export const selectClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600';

export const inputClass =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  alta: 'bg-red-50 text-red-700 ring-red-200',
  media: 'bg-amber-50 text-amber-800 ring-amber-200',
  baja: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  alta: 'Confianza alta',
  media: 'Confianza media',
  baja: 'Posible — revisar',
};

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
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].split('|').map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function Stat({ label, value, tone = 'slate' }: { label: string; value: number | string; tone?: 'slate' | 'teal' | 'red' }) {
  const color = tone === 'teal' ? 'text-teal-700' : tone === 'red' ? 'text-red-700' : 'text-slate-900';
  return (
    <Card className="px-4 py-3">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Card>
  );
}
