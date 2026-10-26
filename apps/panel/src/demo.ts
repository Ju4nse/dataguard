/**
 * Demo pública del panel (GitHub Pages): reemplaza a la API por datos ficticios generados en el navegador.
 * Copia la base de demo (db/demo.sql): Empresa Demo SA, las mismas áreas y cantidad de
 * personas, y las mismas reglas para simular eventos, pero sobre un año para que se vea la evolución.
 * El resumen se calcula igual que app.panel_resumen, incluido el mínimo de personas por grupo.
 * No se conecta a ningún servidor: la "sesión" es una marca en sessionStorage de esta pestaña.
 */
import type { DetectionType } from '@securedata/shared';
import { ApiError } from '@securedata/shared/http';
import type { Area, Configuracion, Empleado, EventoRiesgo, Me, Resumen } from './api';

export const DEMO_PASSWORD = 'demo1234';
const MIN_GROUP = 5;
const DAYS = 400;
const SESSION_KEY = 'dataguard-panel-demo';

type Rol = Me['usuario']['rol'];
const ACCOUNTS: Record<string, { nombre: string; rol: Rol }> = {
  'seguridad@demo.test': { nombre: 'Responsable de Seguridad', rol: 'responsable' },
  'admin@demo.test': { nombre: 'Admin Demo', rol: 'admin' },
  'empleado@demo.test': { nombre: 'Empleado de Prueba', rol: 'empleado' },
};

/** Personas por área, como en la base de demo (Ventas incluye al empleado de prueba). Marketing y Sistemas quedan bajo el mínimo. */
const AREAS: [area: string, personas: number][] = [
  ['Ventas', 7],
  ['RRHH', 5],
  ['Finanzas', 5],
  ['Compras', 5],
  ['Marketing', 3],
  ['Sistemas', 2],
];
// prettier-ignore
const TYPE_WEIGHTS: DetectionType[] = ['EMAIL', 'EMAIL', 'TELEFONO', 'TELEFONO', 'DNI', 'DNI', 'CUIT_CUIL', 'NOMBRE_PERSONA', 'NOMBRE_PERSONA',
  'RAZON_SOCIAL', 'RAZON_SOCIAL', 'SALARIO', 'DIRECCION', 'TARJETA', 'CBU_CVU', 'DATO_SENSIBLE', 'CREDENCIAL'];
type Accion = 'seudonimizar' | 'anonimizar' | 'eliminar' | 'mantener';
const ACTIONS: Accion[] = ['seudonimizar', 'seudonimizar', 'anonimizar', 'anonimizar', 'eliminar', 'mantener'];

interface DemoEvent {
  day: string;
  area: string;
  person: number;
  extension: boolean;
  ignored: boolean;
  detections: { tipo: DetectionType; accion: Accion; cantidad: number }[];
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Eventos simulados con semilla fija (siempre los mismos). El uso crece con los meses, como una empresa que lo adopta de a poco. */
function generate(): { events: DemoEvent[]; incidents: string[] } {
  let seed = 42;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
  const today = new Date();
  const events: DemoEvent[] = [];
  for (const [area, people] of AREAS) {
    for (let person = 1; person <= people; person++) {
      for (let back = 1; back <= DAYS; back++) {
        if (rand() > 0.06 + 0.14 * (1 - back / DAYS)) continue;
        const extension = rand() < 0.3;
        const decision = !extension ? null : rand() < 0.7 ? 'enmascarado' : rand() < 0.5 ? 'ignorado' : 'cancelado';
        const types = rand() < 0.15 ? 0 : 1 + Math.floor(rand() * 3);
        const tipos = new Set<DetectionType>();
        for (let i = 0; i < types; i++) tipos.add(pick(TYPE_WEIGHTS));
        const detections = [...tipos].map((tipo) => ({
          tipo,
          accion: decision === 'ignorado' ? ('mantener' as const) : decision === 'cancelado' ? ('eliminar' as const) : pick(ACTIONS),
          cantidad: 1 + Math.floor(rand() * 25),
        }));
        events.push({ day: isoDay(new Date(today.getTime() - back * 86_400_000)), area, person, extension, ignored: decision === 'ignorado', detections });
      }
    }
  }
  // Algún incidente confirmado cada mes y medio (un dato que se mandó igual a una IA externa y se revisó).
  const incidents = Array.from({ length: Math.floor(DAYS / 45) }, (_, i) => isoDay(new Date(today.getTime() - (20 + i * 45) * 86_400_000)));
  return { events, incidents };
}

let data: ReturnType<typeof generate> | null = null;

/** Mismo cálculo que app.panel_resumen (db/migraciones/02_funciones.sql). */
function resumen(desde: string, hasta: string): Resumen {
  data ??= generate();
  const ev = data.events.filter((e) => e.day >= desde && e.day <= hasta);
  const det = ev.flatMap((e) => e.detections.map((d) => ({ ...d, day: e.day, area: e.area })));
  const sum = (rows: { cantidad: number }[]) => rows.reduce((n, r) => n + r.cantidad, 0);

  const byMonth = new Map<string, number>();
  for (const d of det) byMonth.set(d.day.slice(0, 7), (byMonth.get(d.day.slice(0, 7)) ?? 0) + d.cantidad);
  const byType = new Map<DetectionType, number>();
  for (const d of det) byType.set(d.tipo, (byType.get(d.tipo) ?? 0) + d.cantidad);

  const areas = AREAS.map(([area]) => {
    const own = ev.filter((e) => e.area === area);
    return { area, personas: new Set(own.map((e) => e.person)).size, eventos: own.length, detecciones: sum(det.filter((d) => d.area === area)) };
  }).filter((a) => a.eventos > 0);
  const small = areas.filter((a) => a.personas < MIN_GROUP);
  const smallPeople = small.reduce((n, a) => n + a.personas, 0);
  const porArea = areas.filter((a) => a.personas >= MIN_GROUP).map(({ area, eventos, detecciones }) => ({ area, eventos, detecciones }));
  if (small.length && smallPeople >= MIN_GROUP) {
    porArea.push({ area: 'Otras áreas', eventos: small.reduce((n, a) => n + a.eventos, 0), detecciones: small.reduce((n, a) => n + a.detecciones, 0) });
  }

  return {
    desde,
    hasta,
    totales: {
      eventos: ev.length,
      eventos_con_sensibles: ev.filter((e) => e.detections.length > 0).length,
      detecciones: sum(det),
      enviados_a_externo: ev.filter((e) => e.extension && e.ignored).length,
      bloqueados: sum(det.filter((d) => d.accion === 'eliminar')),
      anonimizados: sum(det.filter((d) => d.accion === 'anonimizar' || d.accion === 'seudonimizar')),
      permitidos: sum(det.filter((d) => d.accion === 'mantener')),
      incidentes_confirmados: data.incidents.filter((d) => d >= desde && d <= hasta).length,
    },
    por_mes: [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([mes, detecciones]) => ({ mes, detecciones })),
    por_tipo: [...byType].sort((a, b) => b[1] - a[1]).map(([tipo, cantidad]) => ({ tipo, cantidad })),
    por_area: porArea.sort((a, b) => b.detecciones - a.detecciones),
    areas_omitidas: small.length && smallPeople < MIN_GROUP ? small.length : 0,
    minimo_por_grupo: MIN_GROUP,
  };
}

const DEMO_AREAS: Area[] = AREAS.map(([nombre], i) => ({ id: `demo-area-${i + 1}`, nombre }));

/** Empleados ficticios, como los de la base de demo ("Ventas 1", "RRHH 2"…). */
function empleados(): Empleado[] {
  return AREAS.flatMap(([area, personas], i) =>
    Array.from({ length: personas }, (_, n) => ({
      id: `demo-${i + 1}-${n + 1}`,
      nombre: `${area} ${n + 1}`,
      email: `${area.toLowerCase()}${n + 1}@demo.test`,
      area_id: DEMO_AREAS[i]!.id,
      area,
      activo: true,
      pendiente_de_ingreso: false,
      creado_en: '2025-09-01T12:00:00Z',
    })),
  ).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Mismo criterio que app.panel_eventos_riesgo: avisos ignorados, sin el empleado y con las áreas chicas agrupadas. */
function riesgo(desde: string, hasta: string): EventoRiesgo[] {
  data ??= generate();
  const people = new Map(AREAS);
  return data.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.extension && e.ignored && e.day >= desde && e.day <= hasta)
    .sort((a, b) => b.e.day.localeCompare(a.e.day))
    .slice(0, 200)
    .map(({ e, i }) => ({
      evento_id: i + 1,
      fecha: e.day,
      area: (people.get(e.area) ?? 0) >= MIN_GROUP ? e.area : 'Otras áreas',
      sitio: i % 2 ? 'claude.ai' : 'chatgpt.com',
      tipo_entrada: 'prompt' as const,
      tipos: [...new Set(e.detections.map((d) => d.tipo))].sort(),
      detecciones: e.detections.reduce((n, d) => n + d.cantidad, 0),
      incidente_id: null,
      incidente_estado: null,
    }));
}

/** Respaldo en memoria si sessionStorage no está disponible (dura hasta recargar la página). */
let memorySession: string | null = null;

function sessionEmail(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
function setSessionEmail(email: string | null) {
  try {
    if (email) sessionStorage.setItem(SESSION_KEY, email);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Sin sessionStorage (ventana privada estricta): queda solo el respaldo en memoria.
  }
  memorySession = email;
}

function me(): Me {
  const email = sessionEmail() ?? memorySession;
  const account = email ? ACCOUNTS[email] : undefined;
  if (!email || !account) throw new ApiError(401, 'No hay sesión');
  return {
    usuario: {
      id: `demo-${account.rol}`,
      nombre: account.nombre,
      email,
      rol: account.rol,
      mfa_activo: true,
      organizacion: 'Empresa Demo SA',
      area: account.rol === 'empleado' ? 'Ventas' : null,
    },
    politica: { CREDENCIAL: 'eliminar', TARJETA: 'eliminar', DATO_SENSIBLE: 'eliminar', CUIT_CUIL: 'seudonimizar', RAZON_SOCIAL: 'seudonimizar' },
    aal: 'aal2',
    mfa: 'ok',
    demo: true,
  };
}

/** Configuración del admin: las áreas de la demo y sus supervisores (las cuentas de arriba, menos el empleado). */
function configuracion(): Configuracion {
  const yo = me().usuario.email;
  return {
    organizacion: 'Empresa Demo SA',
    mostrar_detalle_usuario: false,
    minimo_por_grupo: MIN_GROUP,
    areas: AREAS.map(([, personas], i) => ({ ...DEMO_AREAS[i]!, personas })),
    supervisores: Object.entries(ACCOUNTS)
      .filter(([, a]) => a.rol !== 'empleado')
      .map(([email, a]) => ({
        id: `demo-${a.rol}`,
        nombre: a.nombre,
        email,
        rol: a.rol as 'responsable' | 'admin',
        area_id: null,
        activo: true,
        mfa_activo: true,
        pendiente_de_ingreso: false,
        yo: email === yo,
      })),
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const READ_ONLY = 'La demo es de solo lectura: en una instalación real este cambio se guarda.';

/** Misma firma que api() de @securedata/shared/http, respondiendo como la API real. */
export async function demoApi<T>(path: string, body?: unknown): Promise<T> {
  await new Promise((r) => setTimeout(r, 150)); // que se note la carga, como con un servidor
  const [route = '', query = ''] = path.split('?');
  switch (route) {
    case '/salud':
      return { estado: 'ok', demo: true } as T;
    case '/auth/login': {
      const { email = '', password = '' } = (body ?? {}) as { email?: string; password?: string };
      const normalized = email.trim().toLowerCase();
      if (!ACCOUNTS[normalized] || password !== DEMO_PASSWORD) throw new ApiError(401, 'Email o contraseña incorrectos');
      setSessionEmail(normalized);
      return { estado: 'ok' } as T;
    }
    case '/auth/logout':
      setSessionEmail(null);
      return { estado: 'ok' } as T;
    case '/me':
      return me() as T;
    case '/panel/resumen': {
      const user = me();
      if (user.usuario.rol === 'empleado') throw new ApiError(403, 'Solo para responsables de seguridad');
      const params = new URLSearchParams(query);
      const desde = params.get('desde') ?? '';
      const hasta = params.get('hasta') ?? '';
      if (!DATE.test(desde) || !DATE.test(hasta)) throw new ApiError(400, 'Fechas inválidas (AAAA-MM-DD)');
      return resumen(desde, hasta) as T;
    }
    case '/panel/riesgo': {
      if (me().usuario.rol === 'empleado') throw new ApiError(403, 'Solo para supervisores');
      const params = new URLSearchParams(query);
      const desde = params.get('desde') ?? '';
      const hasta = params.get('hasta') ?? '';
      if (!DATE.test(desde) || !DATE.test(hasta)) throw new ApiError(400, 'Fechas inválidas (AAAA-MM-DD)');
      return riesgo(desde, hasta) as T;
    }
    case '/supervisor/empleados':
      if (body === undefined) {
        if (me().usuario.rol === 'empleado') throw new ApiError(403, 'Solo para supervisores');
        return { empleados: empleados(), areas: DEMO_AREAS } as T;
      }
      throw new ApiError(403, READ_ONLY);
    case '/admin/configuracion':
      if (body !== undefined) throw new ApiError(403, READ_ONLY);
      if (me().usuario.rol !== 'admin') throw new ApiError(403, 'se requiere rol de admin');
      return configuracion() as T;
    default:
      // Altas, cambios de política, incidentes…: la demo no guarda nada.
      if (body !== undefined) throw new ApiError(403, READ_ONLY);
      throw new ApiError(404, 'No disponible en la demo');
  }
}
