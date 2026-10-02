const isProduction = process.env.NODE_ENV === 'production';

const DEV_SECRET = 'solo-para-desarrollo-cambiar-en-produccion-0123456789';

export const config = {
  isProduction,
  port: Number(process.env.API_PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL_API ?? 'postgres://securedata_api:api_dev@localhost:5433/securedata',
  sessionSecret: new TextEncoder().encode(process.env.SESSION_SECRET ?? DEV_SECRET),
  sessionHours: 8,
  /** Orígenes desde los que se aceptan requests que modifican datos (protección CSRF). */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:5174,http://localhost:5180').split(',').map((s) => s.trim()),
};

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('Falta SESSION_SECRET: en producción es obligatorio.');
}
