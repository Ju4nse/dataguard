import { DETECTION_LABELS, DETECTION_SHORT_LABELS } from '@securedata/shared';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Me, type Resumen } from '../api';
import { Account, Admin } from './Admin';
import { ActionsBar, ChartCard, fmt, MonthlyColumns, RankingBars } from './charts';
import { Employees } from './Employees';
import { Policy } from './Policy';
import { RiskEvents } from './RiskEvents';
import { Button, Card, DarkGlow, ErrorText, Logo, ShieldIcon, useCountUp } from './ui';

type Tab = 'reporte' | 'riesgo' | 'empleados' | 'politica' | 'configuracion' | 'cuenta';

const TABS: { id: Tab; label: string; title: string; description: string }[] = [
  {
    id: 'reporte',
    label: 'Reporte',
    title: 'Reporte de seguridad',
    description: 'Estadísticas de detección y concientización. No registra información personal de los empleados.',
  },
  {
    id: 'riesgo',
    label: 'Eventos de riesgo',
    title: 'Eventos de riesgo',
    description: 'Datos enviados sin proteger, para abrir incidentes. Sin identificar a quién fue.',
  },
  { id: 'empleados', label: 'Empleados', title: 'Empleados', description: 'Alta, área y baja de los empleados de tu empresa.' },
  { id: 'politica', label: 'Política', title: 'Política de la empresa', description: 'Qué hacer con cada tipo de dato.' },
  {
    id: 'configuracion',
    label: 'Configuración',
    title: 'Configuración',
    description: 'Privacidad del panel, áreas y supervisores. Solo para admins.',
  },
  { id: 'cuenta', label: 'Mi cuenta', title: 'Mi cuenta', description: 'Tu contraseña para entrar al panel.' },
];

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

interface DetalleUsuario {
  usuario: string;
  area: string | null;
  eventos: string;
  detecciones: string;
  avisos_ignorados: string;
}

/**
 * Detalle por empleado: solo si el admin lo habilitó, y se carga recién al pedirlo (cada consulta
 * queda en la auditoría con quién la hizo).
 */
function EmployeeDetail({ desde, hasta }: { desde: string; hasta: string }) {
  const [rows, setRows] = useState<DetalleUsuario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(await api<DetalleUsuario[]>(`/panel/usuarios?desde=${desde}&hasta=${hasta}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el detalle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink-primary)]">Detalle por empleado</h2>
          <p className="text-sm text-[var(--ink-muted)]">Habilitado por el admin de tu empresa. Cada consulta queda registrada en la auditoría.</p>
        </div>
        {!rows && (
          <Button variant="secondary" disabled={busy} onClick={() => void load()}>
            {busy ? 'Cargando…' : 'Ver detalle'}
          </Button>
        )}
      </div>
      {error && (
        <div className="p-5">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {rows && rows.length === 0 && <p className="px-5 py-6 text-sm text-[var(--ink-muted)]">Sin actividad en el período.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Empleado
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Área
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Cargas
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Detecciones
                </th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">
                  Avisos ignorados
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.usuario}:${r.area}`}>
                  <td className="px-5 py-3 font-medium text-[var(--ink-primary)]">{r.usuario}</td>
                  <td className="px-3 py-3">{r.area ?? 'Sin área'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(Number(r.eventos))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(Number(r.detecciones))}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmt(Number(r.avisos_ignorados))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function Dashboard({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('reporte');
  // Acá y no en Policy: así se conserva al cambiar de pestaña.
  const [politica, setPolitica] = useState(me.politica);
  const [days, setDays] = useState(90);
  const range = useMemo(() => {
    const hasta = new Date();
    return { desde: isoDate(new Date(hasta.getTime() - days * 86_400_000)), hasta: isoDate(hasta) };
  }, [days]);
  // La configuración es solo para admins (la base también lo exige).
  const tabs = TABS.filter((x) => x.id !== 'configuracion' || me.usuario.rol === 'admin');
  const current = tabs.find((x) => x.id === tab)!;
  const [data, setData] = useState<Resumen | null>(null);
  /** Período (en días) que ya respondió la API: mientras no coincida con el elegido, está cargando. */
  const [loadedDays, setLoadedDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = loadedDays !== days;

  useEffect(() => {
    api<Resumen>(`/panel/resumen?desde=${range.desde}&hasta=${range.hasta}`)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) onLogout();
        else setError(e instanceof ApiError ? e.message : 'No se pudo cargar el panel');
      })
      .finally(() => setLoadedDays(days));
  }, [days, range, onLogout]);

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

      {me.demo && (
        <p className="border-b border-brand-200 bg-brand-50 px-4 py-2 text-center text-sm text-slate-800" role="status">
          <strong className="font-semibold">Demo con datos ficticios.</strong> Simula un año de uso de Empresa Demo SA; en una instalación real, el panel
          muestra los datos de tu empresa.
        </p>
      )}
      {me.mfaDesactivado && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900" role="status">
          <strong className="font-semibold">Segundo factor desactivado (modo demo).</strong> Volvé a activarlo antes de usar el panel con datos reales.
        </p>
      )}

      <div className="border-b border-slate-200 bg-white">
        <nav aria-label="Secciones del panel" className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6">
          <div className="flex gap-1 border-b border-slate-100 pt-2">
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setTab(x.id)}
                aria-current={tab === x.id ? 'page' : undefined}
                className={`min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors ${tab === x.id ? 'border-brand-700 text-slate-900' : 'border-transparent text-[var(--ink-secondary)] hover:text-slate-900'}`}
              >
                {x.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 py-6 sm:px-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{current.title}</h1>
            <p className="flex items-start gap-1.5 text-sm text-[var(--ink-secondary)]">
              <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              {current.description}
            </p>
          </div>
          {/* Un solo filtro, arriba de todo lo que afecta (solo en las secciones con fechas). */}
          {(tab === 'reporte' || tab === 'riesgo') && (
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
          )}
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {tab === 'riesgo' && <RiskEvents desde={range.desde} hasta={range.hasta} onSessionLost={onLogout} />}
        {tab === 'empleados' && <Employees onSessionLost={onLogout} />}
        {tab === 'politica' && <Policy politica={politica} onChange={setPolitica} />}
        {tab === 'configuracion' && <Admin onSessionLost={onLogout} />}
        {tab === 'cuenta' && <Account />}

        {tab === 'reporte' && error && <ErrorText>{error}</ErrorText>}

        {tab === 'reporte' && data && t && (
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
                table={{
                  headers: ['Mes', 'Detecciones'],
                  rows: data.por_mes.map((m) => [monthLabel(m.mes, data.desde, data.hasta).replace('*', ' (parcial)'), m.detecciones]),
                }}
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

            {me.usuario.detalle_por_empleado && <EmployeeDetail key={`${range.desde}:${range.hasta}`} desde={range.desde} hasta={range.hasta} />}
          </div>
        )}
      </main>
    </div>
  );
}
