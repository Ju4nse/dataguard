import { DETECTION_LABELS, DETECTION_SHORT_LABELS } from '@securedata/shared';
import { useEffect, useState } from 'react';
import { api, ApiError, type Me, type Resumen } from '../api';
import { ActionsBar, ChartCard, fmt, MonthlyColumns, RankingBars } from './charts';
import { Button, Card, DarkGlow, ErrorText, Logo, ShieldIcon, useCountUp } from './ui';

const PERIODS = [
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
  { days: 365, label: '12 meses' },
];

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * "2026-07" → "jul 26". Los meses que el período no cubre completos (el primero y el actual)
 * se marcan "(parcial)" para que una barra baja no parezca una caída.
 */
function monthLabel(ym: string, desde: string, hasta: string): string {
  const [y, m] = ym.split('-').map(Number);
  const label = new Date(y!, m! - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
  const lastDay = new Date(y!, m!, 0).getDate();
  const partial = (desde.startsWith(ym) && !desde.endsWith('-01')) || (hasta.startsWith(ym) && Number(hasta.slice(8)) < lastDay);
  // En el gráfico va un asterisco (cabe en celular); la tabla y la nota al pie lo explican.
  return partial ? `${label}*` : label;
}

/** Indicador. Las métricas de riesgo muestran un estado con ícono + texto (nunca solo color). */
function Kpi({ value, label, hint, risk = false }: { value: number; label: string; hint: string; risk?: boolean }) {
  const attention = risk && value > 0;
  const shown = useCountUp(value);
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-3xl font-bold tracking-tight text-[var(--ink-primary)]">
          {/* Cuenta hasta el valor; el lector de pantalla lee el valor final. */}
          <span className="sr-only">{fmt(value)}</span>
          <span aria-hidden="true">{fmt(shown)}</span>
        </div>
        {attention && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            Revisar
          </span>
        )}
      </div>
      <div className="mt-2 text-sm font-semibold text-[var(--ink-primary)]">{label}</div>
      <div className="text-sm text-[var(--ink-muted)]">{hint}</div>
    </Card>
  );
}

export function Dashboard({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - days * 86_400_000);
    setLoading(true);
    api<Resumen>(`/panel/resumen?desde=${isoDate(desde)}&hasta=${isoDate(hasta)}`)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) onLogout();
        else setError(e instanceof ApiError ? e.message : 'No se pudo cargar el panel');
      })
      .finally(() => setLoading(false));
  }, [days, onLogout]);

  const t = data?.totales;

  return (
    <div className="min-h-dvh">
      <header className="relative overflow-hidden bg-slate-950 text-white">
        <DarkGlow subtle />
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo tone="dark" />
          <div className="flex items-center gap-4">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-semibold">{me.usuario.nombre}</p>
              <p className="text-xs text-slate-400">{me.usuario.organizacion}</p>
            </div>
            <Button variant="onDark" onClick={onLogout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 py-6 sm:px-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Reporte de seguridad</h1>
            <p className="flex items-start gap-1.5 text-sm text-[var(--ink-secondary)]">
              <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              Estadísticas de detección y concientización. No registra información personal de los empleados.
            </p>
          </div>
          {/* Un solo filtro, arriba de todo lo que afecta. */}
          <div className="flex items-center gap-2" role="group" aria-label="Período">
            <span className="text-sm text-[var(--ink-secondary)]">Últimos</span>
            <div className="flex rounded-lg bg-slate-100 p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setDays(p.days)}
                  aria-pressed={days === p.days}
                  className={`min-h-10 rounded-md px-3 text-sm font-medium transition-colors sm:min-h-9 ${days === p.days ? 'bg-white text-slate-900 shadow-sm' : 'text-[var(--ink-secondary)] hover:text-slate-900'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">

        {error && <ErrorText>{error}</ErrorText>}

        {data && t && (
          // Al cambiar el período se mantiene lo anterior atenuado (sin saltos de diseño).
          <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : ''}`}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi value={t.detecciones} label="Datos sensibles detectados" hint="Total en archivos y prompts" />
              <Kpi value={t.eventos_con_sensibles} label="Cargas con datos sensibles" hint={`De ${fmt(t.eventos)} archivos y prompts analizados`} />
              <Kpi value={t.enviados_a_externo} label="Enviados a IA externa" hint="Avisos de la extensión que se ignoraron" risk />
              <Kpi value={t.incidentes_confirmados} label="Incidentes confirmados" hint="Requieren investigación" risk />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard
                title="Evolución de detecciones por mes"
                table={{ headers: ['Mes', 'Detecciones'], rows: data.por_mes.map((m) => [monthLabel(m.mes, data.desde, data.hasta).replace('*', ' (parcial)'), m.detecciones]) }}
              >
                <MonthlyColumns data={data.por_mes.map((m) => ({ label: monthLabel(m.mes, data.desde, data.hasta), value: m.detecciones }))} />
                {data.por_mes.some((m) => monthLabel(m.mes, data.desde, data.hasta).endsWith('*')) && (
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">* Mes parcial: el período elegido no lo cubre completo.</p>
                )}
              </ChartCard>

              <ChartCard
                title="Acciones tomadas"
                subtitle="Qué se hizo con los datos detectados"
                table={{
                  headers: ['Acción', 'Datos'],
                  rows: [
                    ['Bloqueados (eliminados)', t.bloqueados],
                    ['Anonimizados o seudonimizados', t.anonimizados],
                    ['Permitidos', t.permitidos],
                  ],
                }}
              >
                <ActionsBar
                  segments={[
                    { label: 'Anonimizados', value: t.anonimizados, color: 'var(--series-1)', description: 'reemplazados antes de usar la IA' },
                    { label: 'Bloqueados', value: t.bloqueados, color: 'var(--series-2)', description: 'eliminados del archivo' },
                    { label: 'Permitidos', value: t.permitidos, color: 'var(--series-3)', description: 'se dejaron como estaban' },
                  ]}
                />
              </ChartCard>

              <ChartCard
                title="Tipos de datos detectados"
                table={{ headers: ['Tipo', 'Detecciones'], rows: data.por_tipo.map((x) => [DETECTION_LABELS[x.tipo], x.cantidad]) }}
              >
                <RankingBars data={data.por_tipo.map((x) => ({ label: DETECTION_SHORT_LABELS[x.tipo], value: x.cantidad }))} />
              </ChartCard>

              <ChartCard
                title="Detecciones por área"
                subtitle={`Las áreas con menos de ${data.minimo_por_grupo} personas se agrupan en «Otras áreas»`}
                table={{ headers: ['Área', 'Cargas', 'Detecciones'], rows: data.por_area.map((a) => [a.area, a.eventos, a.detecciones]) }}
              >
                <RankingBars data={data.por_area.map((a) => ({ label: a.area, value: a.detecciones }))} />
                {data.areas_omitidas > 0 && (
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">
                    {data.areas_omitidas} área(s) con muy poca gente no se muestran para que no se pueda identificar a nadie.
                  </p>
                )}
              </ChartCard>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
