import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { jwtVerify, SignJWT } from 'jose';
import { config } from './config';

const COOKIE = 'sd_sesion';

/**
 * - ok: sesión completa.
 * - pendiente: pasó la contraseña pero le falta el código del segundo factor (no puede usar nada más).
 * - configurar: responsable/admin que todavía no dio de alta su segundo factor.
 */
export type MfaState = 'ok' | 'pendiente' | 'configurar';

export interface Session {
  userId: string;
  aal: 'aal1' | 'aal2';
  mfa: MfaState;
}

/**
 * Sesiones cerradas antes de vencer (jti → vencimiento en ms). La cookie es un JWT sin estado: sin
 * esta lista, un token copiado seguiría sirviendo hasta vencer aunque el usuario haya salido.
 * En memoria: alcanza para un solo servidor (al reiniciar, los tokens igual vencen en pocas horas).
 */
const revoked = new Map<string, number>();

function forgetExpired() {
  const now = Date.now();
  for (const [jti, exp] of revoked) if (exp < now) revoked.delete(jti);
}

export async function setSession(c: Context, s: Session) {
  const token = await new SignJWT({ aal: s.aal, mfa: s.mfa })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${config.sessionHours}h`)
    .sign(config.sessionSecret);
  // Al pasar de "pendiente" a "ok" se reemplaza la cookie: la anterior deja de valer.
  await revokeCurrent(c);
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'Strict',
    path: '/',
    maxAge: config.sessionHours * 3600,
  });
}

async function readToken(c: Context) {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, config.sessionSecret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || (payload.jti && revoked.has(payload.jti))) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(c: Context): Promise<Session | null> {
  const payload = await readToken(c);
  if (!payload) return null;
  const mfa: MfaState = payload.mfa === 'pendiente' || payload.mfa === 'configurar' ? payload.mfa : 'ok';
  return { userId: payload.sub!, aal: payload.aal === 'aal2' ? 'aal2' : 'aal1', mfa };
}

async function revokeCurrent(c: Context) {
  const payload = await readToken(c);
  if (payload?.jti && payload.exp) {
    forgetExpired();
    revoked.set(payload.jti, payload.exp * 1000);
  }
}

export async function clearSession(c: Context) {
  await revokeCurrent(c);
  deleteCookie(c, COOKIE, { path: '/' });
}
