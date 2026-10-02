import type { DetectionType } from '@securedata/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Error inesperado');
  return data as T;
}

export interface Me {
  usuario: { id: string; nombre: string; email: string; rol: 'empleado' | 'responsable' | 'admin'; mfa_activo: boolean; organizacion: string; area: string | null };
  politica: Partial<Record<DetectionType, string>>;
  aal: 'aal1' | 'aal2';
  mfa: 'ok' | 'configurar';
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
