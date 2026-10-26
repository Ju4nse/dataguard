import type { Action, DetectionType } from '@securedata/shared';
import { api as serverApi, ApiError } from '@securedata/shared/http';

export { ApiError };

/** Demo pública (GitHub Pages, VITE_STATIC_DEMO=1): datos ficticios en el navegador, sin servidor. */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

/** API del panel. En la demo se carga aparte (import dinámico): el panel real no incluye ese código. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (STATIC_DEMO) return (await import('./demo')).demoApi<T>(path, body);
  return serverApi<T>(path, body);
}

export interface Me {
  usuario: {
    id: string;
    nombre: string;
    email: string;
    rol: 'empleado' | 'responsable' | 'admin';
    mfa_activo: boolean;
    organizacion: string;
    area: string | null;
  };
  politica: Partial<Record<DetectionType, Action>>;
  aal: 'aal1' | 'aal2';
  mfa: 'ok' | 'configurar';
  /** Entró con una contraseña temporal y todavía no la cambió. */
  cambiarPassword?: boolean;
  /** El servidor corre con el segundo factor desactivado (modo demo). */
  mfaDesactivado?: boolean;
  /** Demo pública con datos ficticios (sin servidor). */
  demo?: boolean;
}

export interface Resumen {
  desde: string;
  hasta: string;
  totales: {
    eventos: number;
    eventos_con_sensibles: number;
    detecciones: number;
    enviados_a_externo: number;
    bloqueados: number;
    anonimizados: number;
    permitidos: number;
    incidentes_confirmados: number;
  };
  por_mes: { mes: string; detecciones: number }[];
  por_tipo: { tipo: DetectionType; cantidad: number }[];
  por_area: { area: string; eventos: number; detecciones: number }[];
  areas_omitidas: number;
  minimo_por_grupo: number;
}

export interface Empleado {
  id: string;
  nombre: string;
  email: string;
  area_id: string | null;
  area: string | null;
  activo: boolean;
  /** Todavía no entró a cambiar la contraseña temporal. */
  pendiente_de_ingreso: boolean;
  creado_en: string;
}

export interface Area {
  id: string;
  nombre: string;
}

export type EstadoIncidente = 'abierto' | 'en_revision' | 'confirmado' | 'descartado';

/** Aviso de la extensión que se ignoró. Sin el empleado: fecha (sin hora) y área agrupada si es chica. */
export interface EventoRiesgo {
  evento_id: number;
  fecha: string;
  area: string;
  sitio: string | null;
  tipo_entrada: 'tabla' | 'documento' | 'prompt';
  tipos: DetectionType[];
  detecciones: number;
  incidente_id: number | null;
  incidente_estado: EstadoIncidente | null;
}
