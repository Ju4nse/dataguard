import { DETECTION_LABELS, DETECTION_SHORT_LABELS } from '@securedata/shared';
import { useEffect, useState } from 'react';
import { api, ApiError, type Me, type Resumen } from '../api';
import { ActionsBar, ChartCard, fmt, MonthlyColumns, RankingBars } from './charts';
import { Button, Card, ErrorText, Logo } from './ui';

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
  return partial ? `${label} (parcial)` : label;
}

function Kpi({ value, label, hint }: { value: number; label: string; hint: string }) {
  return (
    <Card className="p-5">
      <div className="text-3xl font-semibold text-[var(--ink-primary)]">{fmt(value)}</div>
      <div className="mt-1 text-sm font-medium text-[var(--ink-primary)]">{label}</div>
      <div className="text-xs text-[var(--ink-muted)]">{hint}</div>
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
    <div className="min-h-screen">
      <header className="border-b border-black/10 bg-[var(--surface-1)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-[var(--ink-secondary)] sm:inline">
              {me.usuario.nombre} · {me.usuario.organizacion}
            </span>
            <Button variant="ghost" onClick={onLogout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Reporte de seguridad</h1>
            <p className="text-sm text-[var(--ink-secondary)]">Estadísticas de detección y concientización. No registra información personal de los empleados.</p>
          </div>
          {/* Un solo filtro, arriba de todo lo que afecta. */}
          <div className="flex items-center gap-2" role="group" aria-label="Período">
            <span className="text-sm text-[var(--ink-secondary)]">Últimos</span>
            <div className="flex rounded-lg border border-black/10 bg-[var(--surface-1)] p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                aria-pressed={days === p.days}
                className={`rounded-md px-3 py-1.5 text-sm ${days === p.days ? 'bg-slate-900 text-white' : 'text-[var(--ink-secondary)] hover:bg-slate-100'}`}
              >
                {p.label}
              </button>
            ))}
            </div>
          </div>
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        {data && t && (
          // Al cambiar el período se mantiene lo anterior atenuado (sin saltos de diseño).
          <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : ''}`}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi value={t.detecciones} label="Datos sensibles detectados" hint="Total en archivos y prompts" />
              <Kpi value={t.eventos_con_sensibles} label="Cargas con datos sensibles" hint={`De ${fmt(t.eventos)} archivos y prompts analizados`} />
              <Kpi value={t.enviados_a_externo} label="Enviados a IA externa" hint="Avisos de la extensión que se ignoraron" />
              <Kpi value={t.incidentes_confirmados} label="Incidentes confirmados" hint="Requieren investigación" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard
                title="Evolución de detecciones por mes"
                table={{ headers: ['Mes', 'Detecciones'], rows: data.por_mes.map((m) => [monthLabel(m.mes, data.desde, data.hasta), m.detecciones]) }}
              >
                <MonthlyColumns data={data.por_mes.map((m) => ({ label: monthLabel(m.mes, data.desde, data.hasta), value: m.detecciones }))} />
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
