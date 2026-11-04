/**
 * Publica la API como Edge Function de Supabase (para el panel de GitHub Pages):
 *   1. Empaqueta apps/api en supabase/functions/api/index.ts (npm run api:edge).
 *   2. Carga los secretos de la función desde .env (rol securedata_api, certificado) y .env.panel
 *      (secreto de sesión propio, el mismo que usa npm run panel:online).
 *   3. Despliega la función "api" sin verificar el JWT de Supabase (la sesión la verifica la API).
 * Requiere haber entrado una vez con: npx supabase login (en una terminal propia). Con --yes no pide confirmar.
 * Uso: npm run api:deploy              (demo: los supervisores entran sin el código del segundo factor)
 *      npm run api:deploy -- --con-2fa  (con segundo factor, para datos reales)
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv, requireDbUrl, ROOT } from '../apps/api/src/pgConfig';

const PAGES_ORIGIN = 'https://ju4nse.github.io';
// La base de Supabase es solo para mostrar la demo: por defecto, sin el paso del segundo factor.
const withoutMfa = !process.argv.includes('--con-2fa');

loadEnv();
const dbUrl = requireDbUrl('DATABASE_URL_API');
const ref = new URL(dbUrl).username.split('.')[1];
if (!ref) throw new Error('No encontré el ID del proyecto en DATABASE_URL_API (usuario securedata_api.<ref>).');

/** Secreto de sesión: el de .env.panel si ya existe (lo genera panel:online), si no uno nuevo. */
function sessionSecret(): string {
  const file = join(ROOT, '.env.panel');
  const m = existsSync(file) ? readFileSync(file, 'utf8').match(/^SESSION_SECRET=(.+)$/m) : null;
  if (m) return m[1]!.trim();
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(file, `# Generado por npm run api:deploy. No lo compartas ni lo subas a git.\nSESSION_SECRET=${secret}\n`, { mode: 0o600 });
  return secret;
}

const caFile = process.env.DATABASE_SSL_CA;
const secrets: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL_API: dbUrl,
  SESSION_SECRET: sessionSecret(),
  TOKEN_ORIGINS: PAGES_ORIGIN,
  // Supabase pone la IP real del cliente en X-Forwarded-For.
  TRUST_PROXY: '1',
  DESACTIVAR_2FA: withoutMfa ? '1' : '0',
  // El certificado mismo (la función no ve los archivos del repo), en una línea.
  ...(caFile ? { DATABASE_SSL_CA: readFileSync(join(ROOT, caFile), 'utf8').trim().replace(/\r?\n/g, '\\n') } : {}),
};

const supabase = (...args: string[]) => execFileSync('npx', ['-y', 'supabase@3', ...args, '--project-ref', ref], { cwd: ROOT, stdio: 'inherit' });

console.log('\n▶ Empaquetando la API');
execFileSync('npm', ['run', 'api:edge'], { cwd: ROOT, stdio: 'inherit' });

console.log('\n▶ Cargando los secretos de la función');
const dir = mkdtempSync(join(tmpdir(), 'dataguard-'));
const envFile = join(dir, '.env');
try {
  writeFileSync(
    envFile,
    Object.entries(secrets)
      .map(([k, v]) => `${k}="${v}"`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  supabase('secrets', 'set', '--env-file', envFile, '--yes');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('\n▶ Desplegando la función');
supabase('functions', 'deploy', 'api', '--no-verify-jwt', '--use-api', '--yes');

console.log(`\n✅ API en https://${ref}.supabase.co/functions/v1/api (salud: /api/salud)`);
if (withoutMfa) console.warn('⚠ SEGUNDO FACTOR DESACTIVADO (demo). Para datos reales: npm run api:deploy -- --con-2fa');
