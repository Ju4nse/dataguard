import type { DetectionType } from '@securedata/shared';
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
  politica: Partial<Record<DetectionType, string>>;
  aal: 'aal1' | 'aal2';
  mfa: 'ok' | 'configurar';
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
