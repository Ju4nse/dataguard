import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type pg from 'pg';

/**
 * Conexión a Postgres (Supabase) compartida por la API y los scripts de npm run db:*.
 * Solo usa Node: no se importa desde el navegador.
 */
export const ROOT = resolve(import.meta.dirname, '../../..');

/** Carga el .env de la raíz si existe. No pisa variables ya definidas (las de panel:online o el CI). */
export function loadEnv() {
  const file = join(ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

/** URL de conexión obligatoria: sin valores por defecto, para no apuntar sin querer a otra base. */
export function requireDbUrl(name: 'DATABASE_URL' | 'DATABASE_URL_API'): string {
  const url = process.env[name];
  if (!url) throw new Error(`Falta ${name}. Copiá .env.example como .env y completá los datos de tu proyecto de Supabase.`);
  return url;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * SSL con verificación completa salvo en una base local (el Postgres del CI). Si DATABASE_SSL_CA indica
 * un archivo (el certificado que se descarga de Supabase), se confía solo en esa autoridad.
 */
export function pgConfig(connectionString: string): pg.ClientConfig {
  const { hostname } = new URL(connectionString);
  if (LOCAL_HOSTS.has(hostname)) return { connectionString };
  const caFile = process.env.DATABASE_SSL_CA;
  if (!caFile) return { connectionString, ssl: true };
  return { connectionString, ssl: { ca: readFileSync(isAbsolute(caFile) ? caFile : join(ROOT, caFile), 'utf8') } };
}
