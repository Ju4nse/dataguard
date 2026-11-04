/** Error de la API de DataGuard, con el estado HTTP y el mensaje para el usuario. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * API en otro dominio (GitHub Pages → Edge Function de Supabase), si se compiló con VITE_API_URL. Ahí la
 * cookie no viaja: el token de la sesión se guarda en el navegador y va como Authorization: Bearer.
 */
const API_URL = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_URL;

/**
 * Clave del token. En localStorage (no sessionStorage): la app web y el panel son del mismo origen y así
 * se inicia sesión una sola vez. La extensión lee la misma clave (apps/extension/src/content/dataguard.ts).
 */
export const TOKEN_KEY = 'dataguard_sesion';

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin almacenamiento (modo privado estricto): la sesión dura hasta recargar.
  }
}

/**
 * Llama a la API de DataGuard: GET sin cuerpo, POST con JSON. En el mismo origen (/api…) la cookie de
 * sesión viaja sola y es httpOnly: el código del navegador nunca la ve. Con VITE_API_URL, usa el token.
 */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = API_URL ? storedToken() : null;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL ?? ''}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: API_URL ? 'omit' : 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor de DataGuard');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
  if (API_URL && (res.status === 401 || path === '/auth/logout')) storeToken(null);
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Error inesperado');
  if (data.token) {
    storeToken(data.token);
    delete data.token;
    // La extensión de DataGuard, si está instalada, toma esta sesión.
    window.dispatchEvent(new Event('dataguard:sesion'));
  }
  return data as T;
}
