const isProduction = process.env.NODE_ENV === 'production';

/**
 * Secreto de desarrollo: es público (está en el repo), así que en desarrollo la API solo escucha en
 * 127.0.0.1 y nadie desde la red puede usarlo para falsificar una sesión. Fuera de desarrollo es
 * obligatorio un SESSION_SECRET propio.
 */
const DEV_SECRET = 'solo-para-desarrollo-cambiar-en-produccion-0123456789';

if (isProduction && (process.env.SESSION_SECRET?.length ?? 0) < 32) {
  throw new Error('Falta SESSION_SECRET (32 caracteres o más): en producción es obligatorio. Usá npm run panel:online, que lo genera.');
}

export const config = {
  isProduction,
  port: Number(process.env.API_PORT ?? 8787),
  /** Solo localhost: la publicación hacia la red la hace un proxy (tailscale serve), nunca la API directo. */
  host: process.env.API_HOST ?? '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL_API ?? 'postgres://securedata_api:api_dev@localhost:5433/securedata',
  sessionSecret: new TextEncoder().encode(process.env.SESSION_SECRET ?? DEV_SECRET),
  sessionHours: 8,
  /** Orígenes desde los que se aceptan requests que modifican datos (protección CSRF). */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:5174,http://localhost:5180').split(',').map((s) => s.trim()),
  /**
   * Confiar en X-Forwarded-For (la IP real del cliente) solo detrás de un proxy propio. Sin proxy,
   * cualquiera podría inventar ese encabezado para esquivar el límite de intentos.
   */
  trustProxy: process.env.TRUST_PROXY === '1',
  /** Carpeta del panel compilado: si está, la API también lo sirve (un solo puerto para publicar). */
  panelDir: process.env.PANEL_DIR,
};
