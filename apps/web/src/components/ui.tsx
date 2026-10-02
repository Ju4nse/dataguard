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

export function Stat({ label, value, tone = 'slate' }: { label: string; value: number | string; tone?: 'slate' | 'teal' | 'red' }) {
  const color = tone === 'teal' ? 'text-teal-700' : tone === 'red' ? 'text-red-700' : 'text-slate-900';
  return (
    <Card className="px-4 py-3">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Card>
  );
}
