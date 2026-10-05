import { relative } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { DETECTION_TYPES } from '@securedata/shared';
import { Hono, type Context } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { config } from './config';
import { pool, withSession, type DbSession } from './db';
import { base32, clientIp, createRateLimiter, csrfGuard } from './security';
import { clearSession, getSession, setSession, type Session } from './session';

/**
 * API de DataGuard. Nunca recibe contenido de archivos: solo credenciales de login,
 * metadatos de eventos y consultas de agregados. Los permisos los aplica Postgres.
 */
const app = new Hono().basePath('/api');

app.use('*', secureHeaders());
app.use('*', csrfGuard);
// Log mínimo: método, ruta y estado. Nunca cuerpos ni parámetros.
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
});

// ---------- Errores ----------
type PgError = Error & { code?: string };

function fail(c: Context, e: unknown) {
  const err = e as PgError;
  if (err.code === '28000') return c.json({ error: 'Sesión inválida' }, 401);
  if (err.code === '42501') return c.json({ error: err.message.replace(/^no autorizado: /, '') }, 403);
  if (err.code?.startsWith('22') || err.code?.startsWith('23') || err.code === 'P0001') {
    return c.json({ error: 'Datos inválidos' }, 400);
  }
  // Solo el código: el mensaje de Postgres puede incluir valores enviados por el usuario.
  console.error('Error inesperado en la base:', err.code ?? err.name);
  return c.json({ error: 'Error interno' }, 500);
}

/** Sesión completa (con segundo factor si corresponde). */
async function requireSession(c: Context, opts: { allowConfigurar?: boolean } = {}): Promise<Session | Response> {
  const s = await getSession(c);
  if (!s) return c.json({ error: 'No hay sesión' }, 401);
  if (s.mfa === 'pendiente') return c.json({ error: 'Falta el código del segundo factor' }, 401);
  if (s.mfa === 'configurar' && !opts.allowConfigurar) return c.json({ error: 'Primero configurá el segundo factor' }, 403);
  return s;
}

const dbSession = (s: Session): DbSession => ({ userId: s.userId, aal: s.aal });

// ---------- Autenticación ----------
// Por email (frena la fuerza bruta contra una cuenta aunque cambie la IP) y por IP (frena barridos de emails).
const loginByEmail = createRateLimiter(5, 60_000);
const loginByIp = createRateLimiter(20, 60_000);
const codeLimiter = createRateLimiter(5, 60_000);

const LoginBody = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
const CodeBody = z.object({ codigo: z.string().regex(/^\d{6}$/) });

app.post('/auth/login', async (c) => {
  const body = LoginBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Email o contraseña inválidos' }, 400);
  if (!loginByEmail(body.data.email.toLowerCase()) || !loginByIp(clientIp(c))) {
    return c.json({ error: 'Demasiados intentos. Esperá un minuto.' }, 429);
  }
  try {
    const r = await withSession(null, (db) => db.query(`SELECT * FROM app.autenticar($1, $2)`, [body.data.email, body.data.password]));
    const u = r.rows[0];
    if (!u) return c.json({ error: 'Email o contraseña incorrectos' }, 401);
    // Con el segundo factor desactivado (solo demo), quien ya lo tiene configurado entra directo.
    if (config.mfaDisabled && u.requiere_2fa) {
      await setSession(c, { userId: u.usuario_id, aal: 'aal2', mfa: 'ok' });
      return c.json({ estado: 'ok' });
    }
    const mfa = u.requiere_2fa ? 'pendiente' : u.debe_configurar_2fa ? 'configurar' : 'ok';
    await setSession(c, { userId: u.usuario_id, aal: 'aal1', mfa });
    return c.json({ estado: mfa });
  } catch (e) {
    return fail(c, e);
  }
});

app.post('/auth/2fa', async (c) => {
  const s = await getSession(c);
  if (!s || s.mfa !== 'pendiente') return c.json({ error: 'Primero ingresá con tu contraseña' }, 401);
  const body = CodeBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'El código tiene 6 dígitos' }, 400);
  if (!codeLimiter(s.userId)) return c.json({ error: 'Demasiados intentos. Esperá un minuto.' }, 429);
  try {
    const r = await withSession(null, (db) => db.query(`SELECT app.verificar_totp($1, $2) AS ok`, [s.userId, body.data.codigo]));
    if (!r.rows[0].ok) return c.json({ error: 'Código incorrecto o vencido' }, 401);
    await setSession(c, { userId: s.userId, aal: 'aal2', mfa: 'ok' });
    return c.json({ estado: 'ok' });
  } catch (e) {
    return fail(c, e);
  }
});

// Alta del segundo factor: devuelve el secreto UNA vez para cargarlo en la app autenticadora.
app.post('/auth/2fa/iniciar', async (c) => {
  const s = await requireSession(c, { allowConfigurar: true });
  if (s instanceof Response) return s;
  try {
    const r = await withSession(dbSession(s), (db) =>
      Promise.all([db.query(`SELECT app.totp_iniciar() AS secreto`), db.query(`SELECT email FROM app.usuarios WHERE id = app.uid()`)]),
    );
    const secreto = base32(r[0].rows[0].secreto as Buffer);
    const email = r[1].rows[0].email as string;
    const otpauth = `otpauth://totp/${encodeURIComponent(`DataGuard:${email}`)}?secret=${secreto}&issuer=${encodeURIComponent('DataGuard')}`;
    return c.json({ secreto, otpauth });
  } catch (e) {
    return fail(c, e);
  }
});

app.post('/auth/2fa/confirmar', async (c) => {
  const s = await requireSession(c, { allowConfigurar: true });
  if (s instanceof Response) return s;
  const body = CodeBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'El código tiene 6 dígitos' }, 400);
  if (!codeLimiter(s.userId)) return c.json({ error: 'Demasiados intentos. Esperá un minuto.' }, 429);
  try {
    const r = await withSession(dbSession(s), (db) => db.query(`SELECT app.totp_confirmar($1) AS ok`, [body.data.codigo]));
    if (!r.rows[0].ok) return c.json({ error: 'Código incorrecto o vencido' }, 401);
    await setSession(c, { userId: s.userId, aal: 'aal2', mfa: 'ok' });
    return c.json({ estado: 'ok' });
  } catch (e) {
    return fail(c, e);
  }
});

app.post('/auth/logout', async (c) => {
  await clearSession(c);
  return c.json({ estado: 'ok' });
});

// ---------- Usuario actual ----------
app.get('/me', async (c) => {
  const s = await requireSession(c, { allowConfigurar: true });
  if (s instanceof Response) return s;
  try {
    const data = await withSession(dbSession(s), async (db) => {
      const u = await db.query(
        `SELECT u.id, u.nombre, u.email, u.rol, u.mfa_activo, o.nombre AS organizacion, a.nombre AS area
         FROM app.usuarios u JOIN app.organizaciones o ON o.id = u.organizacion_id LEFT JOIN app.areas a ON a.id = u.area_id
         WHERE u.id = app.uid()`,
      );
      const p = await db.query(`SELECT app.mi_politica() AS politica`);
      return { usuario: u.rows[0], politica: p.rows[0].politica, aal: s.aal, mfa: s.mfa, mfaDesactivado: config.mfaDisabled };
    });
    if (!data.usuario) return c.json({ error: 'Sesión inválida' }, 401);
    return c.json(data);
  } catch (e) {
    return fail(c, e);
  }
});

// ---------- Eventos (metadatos) ----------
// strictObject: un campo de más (ej. "contenido") se rechaza en vez de ignorarse. Si un cliente con un bug
// intenta mandar contenido, el error se ve en desarrollo en lugar de pasar en silencio.
const EventBody = z.strictObject({
  origen: z.enum(['web', 'extension']),
  tipoEntrada: z.enum(['tabla', 'documento', 'prompt']),
  tipoArchivo: z
    .string()
    .regex(/^[a-z0-9]{1,8}$/i)
    .optional(),
  filas: z.number().int().min(0).max(100_000_000).optional(),
  sitio: z
    .string()
    .regex(/^[a-z0-9.-]{3,100}$/i)
    .optional(),
  decision: z.enum(['enmascarado', 'ignorado', 'cancelado']).optional(),
  detecciones: z
    .array(
      z.strictObject({
        tipo: z.enum(DETECTION_TYPES),
        accion: z.enum(['eliminar', 'anonimizar', 'seudonimizar', 'mantener']),
        cantidad: z.number().int().min(1).max(10_000_000),
      }),
    )
    .max(100),
});

app.post('/eventos', async (c) => {
  const s = await requireSession(c, { allowConfigurar: true });
  if (s instanceof Response) return s;
  const body = EventBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Evento inválido' }, 400);
  const e = body.data;
  try {
    const r = await withSession(dbSession(s), (db) =>
      db.query(`SELECT app.registrar_evento($1::app.origen, $2::app.tipo_entrada, $3::jsonb, $4, $5, $6, $7::app.decision_usuario) AS id`, [
        e.origen,
        e.tipoEntrada,
        JSON.stringify(e.detecciones),
        e.tipoArchivo ?? null,
        e.filas ?? null,
        e.sitio ?? null,
        e.decision ?? null,
      ]),
    );
    return c.json({ id: Number(r.rows[0].id) }, 201);
  } catch (err) {
    return fail(c, err);
  }
});

// ---------- Panel del responsable ----------
const RangeQuery = z.object({ desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

app.get('/panel/resumen', async (c) => {
  const s = await requireSession(c);
  if (s instanceof Response) return s;
  const q = RangeQuery.safeParse(c.req.query());
  if (!q.success) return c.json({ error: 'Fechas inválidas (AAAA-MM-DD)' }, 400);
  try {
    const r = await withSession(dbSession(s), (db) => db.query(`SELECT app.panel_resumen($1, $2) AS r`, [q.data.desde, q.data.hasta]));
    return c.json(r.rows[0].r);
  } catch (e) {
    return fail(c, e);
  }
});

app.get('/panel/usuarios', async (c) => {
  const s = await requireSession(c);
  if (s instanceof Response) return s;
  const q = RangeQuery.safeParse(c.req.query());
  if (!q.success) return c.json({ error: 'Fechas inválidas (AAAA-MM-DD)' }, 400);
  try {
    const r = await withSession(dbSession(s), (db) => db.query(`SELECT * FROM app.panel_detalle_usuarios($1, $2)`, [q.data.desde, q.data.hasta]));
    return c.json(r.rows);
  } catch (e) {
    return fail(c, e);
  }
});

app.get('/salud', async (c) => {
  try {
    await pool.query('SELECT 1');
    return c.json({ estado: 'ok', mfaDesactivado: config.mfaDisabled });
  } catch {
    return c.json({ estado: 'sin base de datos' }, 503);
  }
});

app.notFound((c) => c.json({ error: 'No encontrado' }, 404));

// Servidor: la API en /api y, si se compiló, el panel en el resto (un solo puerto para publicar con tailscale serve).
const server = new Hono();
server.route('/', app);
if (config.panelDir) {
  const root = relative(process.cwd(), config.panelDir) || '.';
  server.use('*', secureHeaders());
  server.use('/*', serveStatic({ root }));
  // Rutas del panel que no son archivos: la aplicación de una sola página.
  server.get('*', serveStatic({ root, path: 'index.html' }));
}

if (config.mfaDisabled) {
  console.warn('⚠ SEGUNDO FACTOR DESACTIVADO (DESACTIVAR_2FA=1): solo para desarrollo o demo, nunca en una instalación real.');
}

serve({ fetch: server.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`API de DataGuard en http://${config.host}:${info.port}/api${config.panelDir ? ' (y el panel en /)' : ''}`);
});

export default server;
