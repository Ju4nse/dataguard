import type { Context, MiddlewareHandler } from 'hono';
import { config } from './config';

/**
 * Limita intentos por clave en una ventana de tiempo. En memoria: alcanza para un solo servidor.
 * Las entradas vencidas se limpian y hay un tope de claves, para que nadie llene la memoria
 * mandando claves distintas.
 */
export function createRateLimiter(max: number, windowMs: number, maxKeys = 10_000) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = Date.now();
  return (key: string): boolean => {
    const now = Date.now();
    if (now - lastSweep > windowMs || hits.size >= maxKeys) {
      for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
      lastSweep = now;
      // Si aún así está lleno, se rechaza lo nuevo (ante un ataque, mejor frenar que olvidar intentos).
      if (hits.size >= maxKeys && !hits.has(key)) return false;
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= max;
  };
}

/** IP del cliente: X-Forwarded-For solo si hay un proxy propio adelante (ver config.trustProxy). */
export function clientIp(c: Context): string {
  if (!config.trustProxy) return 'directo';
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'desconocida';
}

/**
 * Protección CSRF para requests que modifican datos: solo JSON y solo desde orígenes conocidos.
 * (La cookie de sesión además es SameSite=Strict, y un JSON entre orígenes exige preflight de CORS,
 * que esta API no habilita: por eso alcanza con validar el Origin cuando viene.)
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
