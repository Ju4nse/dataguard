/**
 * Verifica la estructura y los permisos de la base local (Docker).
 * Uso: npm run db:up && npm run db:test
 *
 * Se conecta como `securedata_api` (el rol que usará la API) y simula sesiones de distintos usuarios
 * con SET LOCAL app.user_id / app.aal, igual que lo hará la API después de verificar el login.
 */
import pg from 'pg';
import { DETECTION_TYPES } from '../packages/shared/src';

const OWNER_URL = process.env.DATABASE_URL ?? 'postgres://securedata:securedata_dev@localhost:5433/securedata';
const API_URL = process.env.DATABASE_URL_API ?? 'postgres://securedata_api:api_dev@localhost:5433/securedata';

const ID = {
  admin: 'aaaaaaaa-0000-0000-0000-0000000000a1',
  responsable: 'aaaaaaaa-0000-0000-0000-0000000000a2',
  responsableSin2fa: 'aaaaaaaa-0000-0000-0000-0000000000a3',
  empleado: 'aaaaaaaa-0000-0000-0000-0000000000e1',
  responsableOtra: 'bbbbbbbb-0000-0000-0000-0000000000b2',
  empleadoOtra: 'bbbbbbbb-0000-0000-0000-0000000000e1',
  orgDemo: 'aaaaaaaa-0000-0000-0000-000000000001',
  areaVentas: 'aaaaaaaa-0000-0000-0000-000000000011',
};

const api = new pg.Client({ connectionString: API_URL });
const owner = new pg.Client({ connectionString: OWNER_URL });

/** Ejecuta una consulta como si fuera el usuario indicado (lo que hará la API). */
async function as<T extends pg.QueryResultRow = pg.QueryResultRow>(userId: string | null, sql: string, params: unknown[] = [], aal = 'aal1') {
  await api.query('BEGIN');
  try {
    if (userId) await api.query(`SELECT set_config('app.user_id', $1, true), set_config('app.aal', $2, true)`, [userId, aal]);
    const r = await api.query<T>(sql, params);
    await api.query('COMMIT');
    return r;
  } catch (e) {
    await api.query('ROLLBACK');
    throw e;
  }
}

async function fails(promise: Promise<unknown>, expected: RegExp): Promise<string> {
  try {
    await promise;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (expected.test(msg)) return msg;
    throw new Error(`falló con un error distinto al esperado: "${msg}"`);
  }
  throw new Error('se esperaba un error y la operación se permitió');
}

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const REGISTRAR = `SELECT app.registrar_evento($1::app.origen, $2::app.tipo_entrada, $3::jsonb, $4, $5, $6, $7::app.decision_usuario) AS id`;
const hoy = new Date();
const desde = new Date(hoy.getTime() - 120 * 86_400_000).toISOString().slice(0, 10);
const hasta = hoy.toISOString().slice(0, 10);

async function main() {
  try {
    await api.connect();
    await owner.connect();
  } catch (e) {
    console.error(`No se pudo conectar a la base (${e instanceof Error ? e.message : e}).\n¿Está corriendo? Probá: npm run db:up`);
    process.exit(2);
  }

  // ---------- Estructura ----------
  await test('los tipos de dato de la base coinciden con los del detector', async () => {
    const r = await owner.query(`SELECT unnest(enum_range(NULL::app.tipo_dato))::text AS t`);
    const db = r.rows.map((x) => x.t);
    assert(JSON.stringify(db) === JSON.stringify([...DETECTION_TYPES]), `base: ${db.join(',')} · detector: ${DETECTION_TYPES.join(',')}`);
  });

  await test('la tabla de eventos no tiene columnas para contenido ni nombres de archivo', async () => {
    const r = await owner.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'eventos'`);
    const cols = r.rows.map((x) => x.column_name as string);
    const sospechosas = cols.filter((c) => /contenido|texto|prompt|nombre|archivo_nombre|columna|valor/.test(c));
    assert(sospechosas.length === 0, `columnas sospechosas: ${sospechosas.join(', ')}`);
  });

  // ---------- Empleado ----------
  await test('sin sesión no se puede registrar nada', async () => {
    await fails(as(null, REGISTRAR, ['web', 'tabla', '[]', 'csv', 10, null, null]), /sin sesión/);
  });

  let eventoEmpleado = 0;
  await test('un empleado registra un evento; organización y área salen de su sesión', async () => {
    const det = JSON.stringify([
      { tipo: 'DNI', accion: 'seudonimizar', cantidad: 12 },
      { tipo: 'DNI', accion: 'seudonimizar', cantidad: 3 },
      { tipo: 'EMAIL', accion: 'anonimizar', cantidad: 5 },
    ]);
    const r = await as(ID.empleado, REGISTRAR, ['web', 'tabla', det, 'XLSX', 120, null, null]);
    eventoEmpleado = Number(r.rows[0]!.id);
    const e = await owner.query(`SELECT organizacion_id, area_id, tipo_archivo FROM app.eventos WHERE id = $1`, [eventoEmpleado]);
    assert(e.rows[0]!.organizacion_id === ID.orgDemo && e.rows[0]!.area_id === ID.areaVentas, 'organización/área incorrectas');
    assert(e.rows[0]!.tipo_archivo === 'xlsx', 'el tipo de archivo debería normalizarse a minúsculas');
    const d = await owner.query(`SELECT tipo, cantidad FROM app.detecciones WHERE evento_id = $1 ORDER BY tipo`, [eventoEmpleado]);
    assert(d.rows.find((x) => x.tipo === 'DNI')?.cantidad === 15, 'las detecciones repetidas deberían sumarse');
  });

  await test('un empleado NO puede insertar directamente en las tablas', async () => {
    await fails(
      as(
        ID.empleado,
        `INSERT INTO app.eventos (organizacion_id, usuario_id, origen, tipo_entrada, tuvo_datos_sensibles) VALUES ($1, $2, 'web', 'tabla', false)`,
        [ID.orgDemo, ID.empleado],
      ),
      /permission denied/,
    );
  });

  await test('un empleado solo ve sus propios eventos', async () => {
    const r = await as(ID.empleado, `SELECT DISTINCT usuario_id FROM app.eventos`);
    assert(r.rows.length === 1 && r.rows[0]!.usuario_id === ID.empleado, `ve eventos de: ${r.rows.map((x) => x.usuario_id).join(', ')}`);
  });

  await test('un empleado solo ve su propio usuario', async () => {
    const r = await as(ID.empleado, `SELECT id FROM app.usuarios`);
    assert(r.rows.length === 1 && r.rows[0]!.id === ID.empleado, `ve ${r.rows.length} usuarios`);
  });

  await test('un empleado NO puede ver el panel', async () => {
    await fails(as(ID.empleado, `SELECT app.panel_resumen($1, $2)`, [desde, hasta], 'aal2'), /rol de responsable/);
  });

  await test('un tipo de dato inexistente se rechaza', async () => {
    await fails(
      as(ID.empleado, REGISTRAR, ['web', 'tabla', JSON.stringify([{ tipo: 'CONTRASENIA_BANCO', accion: 'eliminar', cantidad: 1 }]), null, null, null, null]),
      /invalid input value for enum/,
    );
  });

  await test('la extensión no puede mandar un sitio con formato de URL completa', async () => {
    await fails(
      as(ID.empleado, REGISTRAR, ['extension', 'prompt', '[]', null, null, 'https://chatgpt.com/c/123?q=mi dni', 'ignorado']),
      /violates check constraint/,
    );
  });

  // ---------- Responsable ----------
  await test('un responsable sin segundo factor NO puede ver el panel', async () => {
    await fails(as(ID.responsableSin2fa, `SELECT app.panel_resumen($1, $2)`, [desde, hasta], 'aal2'), /segundo factor/);
  });

  await test('un responsable con 2FA configurado pero sesión sin segundo factor NO puede ver el panel', async () => {
    await fails(as(ID.responsable, `SELECT app.panel_resumen($1, $2)`, [desde, hasta], 'aal1'), /segundo factor/);
  });

  let resumen: { totales: { eventos: number; detecciones: number }; por_tipo: unknown[]; por_mes: unknown[]; por_area: { area: string }[] } | undefined;
  await test('un responsable con segundo factor ve los agregados de su organización', async () => {
    const r = await as(ID.responsable, `SELECT app.panel_resumen($1, $2) AS r`, [desde, hasta], 'aal2');
    resumen = r.rows[0]!.r;
    assert(resumen && resumen.totales.eventos > 0 && resumen.totales.detecciones > 0, 'el resumen debería tener datos de demo');
    assert(resumen && resumen.por_tipo.length > 0 && resumen.por_mes.length > 0, 'faltan series por tipo o por mes');
  });

  await test('las áreas con menos de 5 personas no aparecen solas (se agrupan en "Otras áreas")', async () => {
    const areas = (resumen?.por_area ?? []).map((a) => a.area);
    assert(!areas.includes('Marketing') && !areas.includes('Sistemas'), `aparecen áreas chicas: ${areas.join(', ')}`);
    assert(areas.includes('Otras áreas') && areas.includes('Ventas'), `áreas: ${areas.join(', ')}`);
  });

  await test('cada consulta al panel queda en la auditoría', async () => {
    const r = await owner.query(`SELECT count(*)::int AS n FROM app.auditoria WHERE usuario_id = $1 AND accion = 'panel_resumen'`, [ID.responsable]);
    assert(r.rows[0]!.n >= 1, 'no hay registro de auditoría');
  });

  await test('un responsable NO puede leer la auditoría ni los eventos de otros fila por fila', async () => {
    await fails(as(ID.responsable, `SELECT * FROM app.auditoria`, [], 'aal2'), /permission denied/);
    const r = await as(ID.responsable, `SELECT count(*)::int AS n FROM app.eventos`, [], 'aal2');
    assert(r.rows[0]!.n === 0, `el responsable ve ${r.rows[0]!.n} eventos sueltos`);
  });

  await test('el detalle por empleado está bloqueado si la empresa no lo habilitó', async () => {
    await fails(as(ID.responsable, `SELECT * FROM app.panel_detalle_usuarios($1, $2)`, [desde, hasta], 'aal2'), /no habilitó/);
  });

  // ---------- Aislamiento entre organizaciones ----------
  await test('un responsable de otra empresa no ve nada de Empresa Demo', async () => {
    await as(ID.empleadoOtra, REGISTRAR, [
      'web',
      'documento',
      JSON.stringify([{ tipo: 'CUIT_CUIL', accion: 'seudonimizar', cantidad: 2 }]),
      'pdf',
      null,
      null,
      null,
    ]);
    const r = await as(ID.responsableOtra, `SELECT app.panel_resumen($1, $2) AS r`, [desde, hasta], 'aal2');
    const otro = r.rows[0]!.r;
    assert(otro.totales.detecciones < 50, `ve ${otro.totales.detecciones} detecciones (¿datos de otra empresa?)`);
    // Su única área tiene 1 persona: se omite en vez de mostrarse.
    assert(otro.por_area.length === 0 && otro.areas_omitidas === 1, `por_area=${JSON.stringify(otro.por_area)} omitidas=${otro.areas_omitidas}`);
  });

  await test('un responsable no puede abrir un incidente sobre un evento de otra empresa', async () => {
    await fails(as(ID.responsableOtra, `SELECT app.incidente_crear($1)`, [eventoEmpleado], 'aal2'), /evento inexistente/);
  });

  await test('un responsable puede abrir y confirmar un incidente de su empresa', async () => {
    const r = await as(ID.responsable, `SELECT app.incidente_crear($1) AS id`, [eventoEmpleado], 'aal2');
    await as(ID.responsable, `SELECT app.incidente_actualizar($1, 'confirmado')`, [r.rows[0]!.id], 'aal2');
  });

  // ---------- Administración ----------
  await test('solo un admin puede habilitar el detalle por usuario', async () => {
    await fails(as(ID.responsable, `SELECT app.admin_configurar(true, 5)`, [], 'aal2'), /rol de admin/);
    await as(ID.admin, `SELECT app.admin_configurar(true, 5)`, [], 'aal2');
    const r = await as(ID.responsable, `SELECT * FROM app.panel_detalle_usuarios($1, $2)`, [desde, hasta], 'aal2');
    assert(r.rows.length > 0, 'con el detalle habilitado debería devolver filas');
    await as(ID.admin, `SELECT app.admin_configurar(false, 5)`, [], 'aal2');
  });

  // ---------- Autenticación ----------
  await test('login: contraseña correcta devuelve el usuario; incorrecta no devuelve nada', async () => {
    const ok = await as(null, `SELECT * FROM app.autenticar($1, $2)`, ['seguridad@demo.test', 'demo1234']);
    assert(ok.rows[0]?.usuario_id === ID.responsable && ok.rows[0]!.requiere_2fa === true, `login correcto: ${JSON.stringify(ok.rows)}`);
    const mal = await as(null, `SELECT * FROM app.autenticar($1, $2)`, ['seguridad@demo.test', 'otra']);
    const inexistente = await as(null, `SELECT * FROM app.autenticar($1, $2)`, ['nadie@demo.test', 'demo1234']);
    assert(mal.rows.length === 0 && inexistente.rows.length === 0, 'un login incorrecto no debería devolver filas');
  });

  await test('un responsable sin 2FA debe configurarlo antes de entrar al panel', async () => {
    const r = await as(null, `SELECT * FROM app.autenticar($1, $2)`, ['gerente@demo.test', 'demo1234']);
    assert(r.rows[0]?.debe_configurar_2fa === true, JSON.stringify(r.rows));
  });

  await test('segundo factor: el código actual sirve una sola vez; uno inventado no sirve', async () => {
    const codigo = (
      await owner.query(`SELECT app.totp_codigo(totp_secreto, floor(extract(epoch FROM now()) / 30)::bigint) AS c FROM app.usuarios WHERE id = $1`, [
        ID.responsableOtra,
      ])
    ).rows[0]!.c;
    const ok = await as(null, `SELECT app.verificar_totp($1, $2) AS ok`, [ID.responsableOtra, codigo]);
    const repetido = await as(null, `SELECT app.verificar_totp($1, $2) AS ok`, [ID.responsableOtra, codigo]);
    const inventado = await as(null, `SELECT app.verificar_totp($1, '000000') AS ok`, [ID.responsableOtra]);
    assert(ok.rows[0]!.ok === true, 'el código actual debería ser válido');
    assert(repetido.rows[0]!.ok === false, 'el mismo código no debería servir dos veces');
    assert(inventado.rows[0]!.ok === false || codigo === '000000', 'un código inventado no debería servir');
  });

  await test('la API no puede leer contraseñas ni secretos de 2FA, ni siquiera los propios', async () => {
    await fails(as(ID.responsable, `SELECT password_hash FROM app.usuarios`, [], 'aal2'), /permission denied/);
    await fails(as(ID.responsable, `SELECT totp_secreto FROM app.usuarios`, [], 'aal2'), /permission denied/);
  });

  await test('cualquier empleado puede leer la política de su empresa', async () => {
    const r = await as(ID.empleado, `SELECT app.mi_politica() AS p`);
    assert(r.rows[0]!.p.CREDENCIAL === 'eliminar', JSON.stringify(r.rows[0]!.p));
  });

  await api.end();
  await owner.end();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? `\n     → ${r.detail}` : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} pruebas OK`);
  process.exit(failed.length ? 1 : 0);
}

void main();
