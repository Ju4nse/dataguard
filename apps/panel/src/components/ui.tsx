import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'onDark';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 hover:shadow-md hover:shadow-brand-700/25 disabled:bg-slate-300 disabled:shadow-none',
  // Borde azul de la marca, más intenso al pasar el mouse.
  secondary: 'bg-white text-brand-800 ring-1 ring-inset ring-brand-600/45 hover:bg-brand-50 hover:ring-2 hover:ring-brand-600',
  ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
  onDark: 'text-slate-100 ring-1 ring-inset ring-brand-400/60 hover:bg-brand-500/15 hover:text-white hover:ring-brand-300',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-[color,background-color,box-shadow,transform] duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 sm:min-h-10 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Input({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-900">{label}</span>
      <input
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 sm:text-sm"
        {...props}
      />
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-[var(--surface-1)] shadow-sm ${className}`}>{children}</div>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

export function ShieldIcon({ className = 'h-5 w-5' }: { className?: string }) {
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
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function Logo({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <div className="flex items-center gap-2">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${dark ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}>
        <ShieldIcon />
      </span>
      <span className={`whitespace-nowrap font-bold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>DataGuard</span>
      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${dark ? 'bg-white/10 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>Panel</span>
    </div>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Brillos azules con deriva lenta detrás de las superficies oscuras. Decorativo; quieto con movimiento reducido. */
export function DarkGlow({ subtle = false }: { subtle?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={`absolute -right-[10%] -top-[40%] h-[34rem] w-[34rem] animate-drift-a rounded-full blur-3xl will-change-transform ${subtle ? 'bg-brand-600/20' : 'bg-brand-600/30'}`}
      />
      <div className="absolute -bottom-[40%] -left-[10%] h-[28rem] w-[28rem] animate-drift-b rounded-full bg-sky-400/15 blur-3xl will-change-transform" />
      {!subtle && (
        <div className="absolute left-[30%] top-[30%] h-[20rem] w-[20rem] animate-drift-c rounded-full bg-indigo-500/15 blur-3xl will-change-transform" />
      )}
    </div>
  );
}

/** Cuenta de 0 al valor; con movimiento reducido muestra el valor final directo. */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  // Sin animación (movimiento reducido o valor 0) se devuelve el valor final directo, sin tocar el estado.
  const instant = reducedMotion() || target === 0;
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
