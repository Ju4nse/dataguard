import type { Action, DetectionType } from '@securedata/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, body?: unknown): Promise<T> {
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

export interface Session {
  nombre: string;
  organizacion: string;
  politica: Partial<Record<DetectionType, Action>>;
}

/** Sesión actual, o null si no hay (la app funciona igual sin sesión). */
export async function fetchSession(): Promise<Session | null> {
  try {
    const me = await api<{ usuario: { nombre: string; organizacion: string }; politica: Session['politica'] }>('/me');
    return { nombre: me.usuario.nombre, organizacion: me.usuario.organizacion, politica: me.politica };
  } catch {
    return null;
  }
}

export const login = (email: string, password: string) => api<{ estado: 'ok' | 'pendiente' | 'configurar' }>('/auth/login', { email, password });
export const verify2fa = (codigo: string) => api<{ estado: 'ok' }>('/auth/2fa', { codigo });
export const logout = () => api('/auth/logout', {});

/** Envía SOLO metadatos: tipos y cantidades. Nunca contenido, nombre de archivo ni nombres de columnas. */
export async function sendEvent(e: {
  tipoEntrada: 'tabla' | 'documento';
  tipoArchivo: string;
  filas?: number;
  detecciones: { tipo: DetectionType; accion: Action; cantidad: number }[];
}) {
  await api('/eventos', { origen: 'web', ...e });
}
