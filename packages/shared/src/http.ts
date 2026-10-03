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
 * Llama a la API del mismo origen (/api…): GET sin cuerpo, POST con JSON. La cookie de sesión viaja
 * sola (same-origin) y es httpOnly: el código del navegador nunca la ve.
 */
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
