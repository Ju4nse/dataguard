/**
 * Publica el panel del responsable en la red privada de Tailscale (solo tus dispositivos):
 *   1. Genera (una vez) un secreto de sesión propio en .env.panel (no se sube a git).
 *   2. Levanta Postgres y compila el panel.
 *   3. Arranca la API en modo producción, sirviendo el panel, solo en 127.0.0.1:8790.
 *   4. `tailscale serve` la publica con HTTPS en https://<tu-pc>.<tu-red>.ts.net
 * Uso: npm run panel:online   (Ctrl+C para cortar; la base sigue en Docker)
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ENV_FILE = join(ROOT, '.env.panel');
const PORT = 8790;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function step(text: string) {
  console.log(`\n▶ ${text}`);
}

/** El CLI de Tailscale: en el PATH o en la carpeta de instalación de Windows. */
function tailscaleBin(): string {
  const candidates = ['tailscale', 'C:\\Program Files\\Tailscale\\tailscale.exe'];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['version'], { stdio: 'ignore' });
      return bin;
    } catch {
      // probar el siguiente
    }
  }
  throw new Error('No encontré Tailscale. Instalalo desde https://tailscale.com/download y entrá con tu cuenta.');
}

function tailscaleName(bin: string): string {
  let status: { BackendState?: string; Self?: { DNSName?: string } };
  try {
    status = JSON.parse(execFileSync(bin, ['status', '--json'], { encoding: 'utf8' }));
  } catch {
    throw new Error('Tailscale no responde. Abrí la app de Tailscale y entrá con tu cuenta.');
  }
  if (status.BackendState !== 'Running') throw new Error('Tailscale no está conectado. Abrí la app y entrá con tu cuenta.');
  const name = status.Self?.DNSName?.replace(/\.$/, '');
  if (!name) throw new Error('Tailscale no tiene nombre DNS para esta PC: activá MagicDNS en https://login.tailscale.com/admin/dns');
  return name;
}

/** Secreto de sesión propio, generado una sola vez (si cambia, se cierran todas las sesiones). */
function sessionSecret(): string {
  if (existsSync(ENV_FILE)) {
    const m = readFileSync(ENV_FILE, 'utf8').match(/^SESSION_SECRET=(.+)$/m);
    if (m) return m[1]!.trim();
  }
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(ENV_FILE, `# Generado por npm run panel:online. No lo compartas ni lo subas a git.\nSESSION_SECRET=${secret}\n`, { mode: 0o600 });
  console.log('  Secreto de sesión generado en .env.panel');
  return secret;
}

function run(cmd: string, args: string[]) {
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
}

try {
  step('Tailscale');
  const bin = tailscaleBin();
  const host = tailscaleName(bin);
  const origin = `https://${host}`;
  console.log(`  Esta PC en tu red privada: ${host}`);

  const secret = sessionSecret();

  step('Base de datos (Docker)');
  run(npm, ['run', 'db:up']);

  step('Compilando el panel');
  run(npm, ['run', 'build', '-w', '@securedata/panel']);

  step(`Publicando con HTTPS en ${origin}`);
  try {
    execFileSync(bin, ['serve', '--bg', `http://127.0.0.1:${PORT}`], { stdio: 'inherit' });
  } catch {
    throw new Error(
      'tailscale serve falló. Si dice que HTTPS no está habilitado, activalo en https://login.tailscale.com/admin/dns ("HTTPS Certificates") y volvé a correr este comando.',
    );
  }

  step('API + panel en modo producción (Ctrl+C para cortar)');
  const api = spawn(process.execPath, ['--import', 'tsx', join(ROOT, 'apps/api/src/index.ts')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SESSION_SECRET: secret,
      API_PORT: String(PORT),
      PANEL_DIR: join(ROOT, 'apps/panel/dist'),
      TRUST_PROXY: '1',
      ALLOWED_ORIGINS: origin,
    },
  });
  console.log(`\n  Panel: ${origin}\n  Abrilo desde cualquier dispositivo con Tailscale y tu cuenta.\n`);
  const stop = () => api.kill();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  api.on('exit', (code) => process.exit(code ?? 0));
} catch (e) {
  console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
