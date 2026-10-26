/**
 * Consola SQL contra la base de .env (DATABASE_URL, dueño del esquema). Necesita psql instalado;
 * si no, usá el SQL Editor del panel de Supabase.
 */
import { spawnSync } from 'node:child_process';
import { loadEnv, requireDbUrl } from '../apps/api/src/pgConfig';

loadEnv();
const r = spawnSync('psql', [requireDbUrl('DATABASE_URL')], { stdio: 'inherit' });
if (r.error) {
  console.error('No encontré psql. Instalalo (cliente de PostgreSQL) o usá el SQL Editor de Supabase.');
  process.exit(1);
}
process.exit(r.status ?? 0);
