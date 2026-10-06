import { ApiError } from '@securedata/shared/http';
import type { Decision, Detection } from './messages';
import type { Policy } from './protect';
import { getSettings, saveSettings, type SessionInfo } from './storage';

export { ApiError };

/**
 * Llama a la API de DataGuard. La cookie de sesión (httpOnly) la guarda Chrome para el servidor y viaja
 * sola: la extensión tiene permiso de host sobre el servidor, así que Chrome la trata como del mismo sitio.
 */
async function call<T>(path: string, body?: unknown): Promise<T> {
  const { apiBase } = await getSettings();
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor de DataGuard');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Error inesperado');
  return data as T;
}

export const login = (email: string, password: string) => call<{ estado: 'ok' | 'pendiente' | 'configurar' }>('/auth/login', { email, password });
export const verify2fa = (codigo: string) => call<{ estado: 'ok' }>('/auth/2fa', { codigo });

export async function logout(): Promise<void> {
  try {
    await call('/auth/logout', {});
  } finally {
    await saveSettings({ session: null });
  }
}

/**
 * Trae el usuario y la política de su empresa y los guarda. Sin sesión, la borra. Si el servidor no
 * responde, conserva la anterior: proteger con la política de hace un rato es mejor que sin política.
 */
export async function refreshSession(): Promise<SessionInfo | null> {
  try {
    const me = await call<{ usuario: { nombre: string; organizacion: string }; politica: Policy | null }>('/me');
    const session = { nombre: me.usuario.nombre, organizacion: me.usuario.organizacion, politica: me.politica ?? {} };
    await saveSettings({ session });
    return session;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      await saveSettings({ session: null });
      return null;
    }
    throw e;
  }
}

/** Registra un aviso de la extensión: sitio, decisión, tipos y cantidades. Nunca el texto del prompt. */
export async function sendEvent(sitio: string, decision: Decision, detecciones: Detection[]): Promise<void> {
  await call('/eventos', { origen: 'extension', tipoEntrada: 'prompt', sitio, decision, detecciones });
}
