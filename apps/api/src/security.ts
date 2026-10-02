import type { MiddlewareHandler } from 'hono';
import { config } from './config';

/** Limita intentos por clave (IP + email) en una ventana de tiempo. En memoria: alcanza para un solo servidor. */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= max;
  };
}

/**
 * Protección CSRF para requests que modifican datos: solo JSON y solo desde orígenes conocidos.
 * (La cookie de sesión además es SameSite=Strict.)
 */
export const csrfGuard: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    if (!c.req.header('content-type')?.startsWith('application/json')) {
      return c.json({ error: 'Se espera Content-Type: application/json' }, 415);
    }
    const origin = c.req.header('origin');
    if (origin && !config.allowedOrigins.includes(origin)) {
      return c.json({ error: 'Origen no permitido' }, 403);
    }
  }
  await next();
};

/** Codificación base32 (RFC 4648) para mostrar el secreto TOTP en apps autenticadoras. */
export function base32(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
