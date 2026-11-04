import type { Action, DetectionType } from '@securedata/shared';
import { api, ApiError } from '@securedata/shared/http';

export { ApiError };

export interface Session {
  nombre: string;
  organizacion: string;
  politica: Partial<Record<DetectionType, Action>>;
}

/** Sesión actual, o null si no hay (la app funciona igual sin sesión). */
export async function fetchSession(): Promise<Session | null> {
  try {
    const me = await api<{ usuario: { nombre: string; organizacion: string }; politica: Session['politica']; cambiarPassword?: boolean }>('/me');
    // Con la contraseña temporal sin cambiar no puede registrar nada: es como no tener sesión.
    if (me.cambiarPassword) return null;
    return { nombre: me.usuario.nombre, organizacion: me.usuario.organizacion, politica: me.politica };
  } catch {
    return null;
  }
}

type LoginState = 'ok' | 'pendiente' | 'configurar' | 'cambiar_password';
export const login = (email: string, password: string) => api<{ estado: LoginState }>('/auth/login', { email, password });
export const verify2fa = (codigo: string) => api<{ estado: LoginState }>('/auth/2fa', { codigo });
export const changePassword = (actual: string, nueva: string) => api<{ estado: LoginState }>('/auth/password', { actual, nueva });
export const logout = () => api('/auth/logout', {});

/** Envía SOLO metadatos: tipos y cantidades. Nunca contenido, nombre de archivo ni nombres de columnas. */
export async function sendEvent(e: {
  tipoEntrada: 'tabla' | 'documento' | 'prompt';
  tipoArchivo?: string;
  filas?: number;
  detecciones: { tipo: DetectionType; accion: Action; cantidad: number }[];
}) {
  await api('/eventos', { origen: 'web', ...e });
}
