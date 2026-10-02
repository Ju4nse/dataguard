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

export async function setSession(c: Context, s: Session) {
  const token = await new SignJWT({ aal: s.aal, mfa: s.mfa })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${config.sessionHours}h`)
    .sign(config.sessionSecret);
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'Strict',
    path: '/',
    maxAge: config.sessionHours * 3600,
  });
}

export async function getSession(c: Context): Promise<Session | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, config.sessionSecret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    return { userId: payload.sub, aal: payload.aal === 'aal2' ? 'aal2' : 'aal1', mfa: (payload.mfa as MfaState) ?? 'ok' };
  } catch {
    return null;
  }
}

export function clearSession(c: Context) {
  deleteCookie(c, COOKIE, { path: '/' });
}
