import { ApiError } from '@securedata/shared/http';
import type { Decision, Detection, Message } from './messages';
import type { Policy } from './protect';
import { getSettings, saveSettings, type SessionInfo } from './storage';

export { ApiError };

/**
 * Llama a la API de DataGuard. La cookie de sesión (httpOnly) la guarda Chrome para el servidor y viaja
 * sola: la extensión tiene permiso de host sobre el servidor, así que Chrome la trata como del mismo sitio.
 */
async function call<T>(path: string, body?: unknown): Promise<T> {
  const { apiBase, token } = await getSettings();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // Sesión tomada del panel de DataGuard: va como Bearer (la cookie es de otra sesión, o no hay).
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor de DataGuard');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Error inesperado');
  return data as T;
}

type LoginState = 'ok' | 'pendiente' | 'configurar' | 'cambiar_password';
export const login = (email: string, password: string) => call<{ estado: LoginState }>('/auth/login', { email, password });
export const verify2fa = (codigo: string) => call<{ estado: LoginState }>('/auth/2fa', { codigo });
export const changePassword = (actual: string, nueva: string) => call<{ estado: LoginState }>('/auth/password', { actual, nueva });

export async function logout(): Promise<void> {
  try {
    await call('/auth/logout', {});
  } finally {
    await saveSettings({ session: null, token: null });
  }
}

/**
 * Trae el usuario y la política de su empresa y los guarda. Sin sesión, la borra. Si el servidor no
 * responde, conserva la anterior: proteger con la política de hace un rato es mejor que sin política.
 */
export async function refreshSession(): Promise<SessionInfo | null> {
  try {
    const me = await call<{ usuario: { nombre: string; organizacion: string }; politica: Policy | null; cambiarPassword?: boolean }>('/me');
    // Con la contraseña temporal sin cambiar no puede registrar nada: es como no tener sesión.
    if (me.cambiarPassword) {
      await saveSettings({ session: null, token: null });
      return null;
    }
    const session = { nombre: me.usuario.nombre, organizacion: me.usuario.organizacion, politica: me.politica ?? {} };
    await saveSettings({ session });
    return session;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      await saveSettings({ session: null, token: null });
      return null;
    }
    throw e;
  }
}

/**
 * Conecta la extensión con la sesión que el usuario ya inició en el panel de DataGuard. Si la extensión
 * ya tiene su propia sesión, no la pisa (por ejemplo, un supervisor que abre el panel en la PC de un empleado).
 */
export async function adoptPageSession(token: string): Promise<void> {
  const { session, token: current } = await getSettings();
  if (session || current === token) return;
  await saveSettings({ token });
  await refreshSession().catch(() => saveSettings({ token: null }));
}

/** Registra un aviso de la extensión: sitio, decisión, tipos y cantidades. Nunca el texto del prompt. */
export async function sendEvent(sitio: string, decision: Decision, detecciones: Detection[], archivo?: Message['archivo']): Promise<void> {
  await call('/eventos', {
    origen: 'extension',
    tipoEntrada: archivo?.entrada ?? 'prompt',
    ...(archivo ? { tipoArchivo: archivo.formato, filas: archivo.filas } : {}),
    sitio,
    decision,
    detecciones,
  });
}
