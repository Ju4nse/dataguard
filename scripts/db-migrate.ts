/**
 * Aplica el esquema en la base (Supabase o el Postgres del CI).
 *   npm run db:migrate              aplica las migraciones nuevas de db/migraciones, en orden
 *   npm run db:seed                 carga los datos de demo (db/demo.sql), una sola vez
 *   npm run db:reset -- --confirmar BORRA los esquemas app y migraciones y vuelve a crear todo con la demo
 *   npm run db:reset -- --confirmar --sin-demo   lo mismo, pero sin la demo (para una empresa real)
 *   npm run db:empresa -- "Nombre de la empresa" admin@empresa.com "Nombre del admin"
 *                                   da de alta una empresa con su admin (contraseña temporal; el
 *                                   admin la cambia y configura el segundo factor al entrar)
 *
 * Cada migración corre en una transacción y queda anotada (con su sha256) en migraciones.aplicadas,
 * un esquema propio: Supabase expone `public` por la Data API, así que acá no se crea nada en public.
 * Una migración ya aplicada no se edita: si cambió, el script frena. Los cambios van en un archivo nuevo.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { loadEnv, pgConfig, requireDbUrl, ROOT } from '../apps/api/src/pgConfig';

loadEnv();

const MIGRATIONS_DIR = join(ROOT, 'db/migraciones');
const DEMO_FILE = join(ROOT, 'db/demo.sql');
const DEMO_ORG = 'aaaaaaaa-0000-0000-0000-000000000001';
const command = process.argv[2] ?? 'migrate';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

async function inTransaction(client: pg.Client, fn: () => Promise<void>) {
  await client.query('BEGIN');
  try {
    await fn();
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

async function migrate(client: pg.Client) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS migraciones;
    REVOKE ALL ON SCHEMA migraciones FROM PUBLIC;
    CREATE TABLE IF NOT EXISTS migraciones.aplicadas (
      archivo     text PRIMARY KEY,
      sha256      text NOT NULL,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    );`);
  const applied = new Map(
    (await client.query<{ archivo: string; sha256: string }>('SELECT archivo, sha256 FROM migraciones.aplicadas')).rows.map((r) => [r.archivo, r.sha256]),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let count = 0;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const hash = sha256(sql);
    const previous = applied.get(file);
    if (previous) {
      if (previous !== hash) throw new Error(`${file} cambió después de aplicarse. No se editan migraciones aplicadas: agregá un archivo nuevo.`);
      continue;
    }
    console.log(`  aplicando ${file}`);
    await inTransaction(client, async () => {
      await client.query(sql);
      await client.query('INSERT INTO migraciones.aplicadas (archivo, sha256) VALUES ($1, $2)', [file, hash]);
    });
    count++;
  }
  console.log(count ? `✔ ${count} migraciones aplicadas` : '✔ La base ya estaba al día');

  // La contraseña del rol de la API nunca está en el repo: sale del .env y se actualiza en cada corrida.
  const password = process.env.SECUREDATA_API_PASSWORD;
  if (!password) {
    console.warn('⚠ Falta SECUREDATA_API_PASSWORD: el rol securedata_api no tiene contraseña y la API no va a poder entrar.');
  } else {
    if (password.length < 20) throw new Error('SECUREDATA_API_PASSWORD tiene que tener 20 caracteres o más.');
    await client.query(`ALTER ROLE securedata_api PASSWORD ${client.escapeLiteral(password)}`);
    console.log('✔ Contraseña de securedata_api actualizada');
  }
}

async function seed(client: pg.Client) {
  const exists = await client.query('SELECT 1 FROM app.organizaciones WHERE id = $1', [DEMO_ORG]);
  if (exists.rowCount) {
    console.log('✔ Los datos de demo ya estaban cargados (para empezar de cero: npm run db:reset -- --confirmar)');
    return;
  }
  await inTransaction(client, async () => {
    await client.query(readFileSync(DEMO_FILE, 'utf8'));
  });
  console.log('✔ Datos de demo cargados (contraseña demo1234; código 2FA: npm run db:totp -- seguridad@demo.test)');
}

async function reset(client: pg.Client) {
  const { host, pathname } = new URL(requireDbUrl('DATABASE_URL'));
  const withDemo = !process.argv.includes('--sin-demo');
  if (!process.argv.includes('--confirmar')) {
    console.log(`Esto BORRA los esquemas app y migraciones de ${host}${pathname} (todos los eventos, usuarios y auditoría)`);
    console.log(`y los vuelve a crear ${withDemo ? 'con' : 'sin'} los datos de demo. Para hacerlo: npm run db:reset -- --confirmar${withDemo ? '' : ' --sin-demo'}`);
    process.exit(1);
  }
  await client.query('DROP SCHEMA IF EXISTS app CASCADE; DROP SCHEMA IF EXISTS migraciones CASCADE;');
  console.log('✔ Esquemas borrados');
  await migrate(client);
  if (withDemo) await seed(client);
  else console.log('✔ Base vacía. Para dar de alta la empresa: npm run db:empresa -- "Empresa" admin@empresa.com "Nombre del admin"');
}

/** Empresa nueva con su admin. Es la única forma de crear una empresa: no hay registro abierto. */
async function createCompany(client: pg.Client) {
  const [nombre, email, nombreAdmin] = process.argv.slice(3).filter((a) => !a.startsWith('--'));
  if (!nombre || !email || !nombreAdmin) {
    console.log('Uso: npm run db:empresa -- "Nombre de la empresa" admin@empresa.com "Nombre del admin"');
    process.exit(1);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email inválido');
  let temporal = '';
  await inTransaction(client, async () => {
    const org = await client.query<{ id: string }>('INSERT INTO app.organizaciones (nombre) VALUES ($1) RETURNING id', [nombre.trim()]);
    temporal = (await client.query<{ t: string }>('SELECT app.password_temporal() AS t')).rows[0].t;
    const u = await client.query<{ id: string }>(
      `INSERT INTO app.usuarios (organizacion_id, email, nombre, rol, password_hash, debe_cambiar_password)
       VALUES ($1, lower(trim($2)), trim($3), 'admin', extensions.crypt($4, extensions.gen_salt('bf', 10)), true) RETURNING id`,
      [org.rows[0].id, email, nombreAdmin, temporal],
    );
    await client.query(`INSERT INTO app.auditoria (usuario_id, accion) VALUES ($1, 'alta_empresa')`, [u.rows[0].id]);
  });
  console.log(`✔ Empresa "${nombre.trim()}" creada con su admin ${email.toLowerCase()}`);
  console.log(`  Contraseña temporal: ${temporal}`);
  console.log('  Al entrar al panel tiene que configurar el segundo factor y cambiar la contraseña.');
}

const client = new pg.Client(pgConfig(requireDbUrl('DATABASE_URL')));
try {
  await client.connect();
} catch (e) {
  console.error(`✖ No se pudo conectar a la base: ${e instanceof Error ? e.message : e}`);
  console.error('  Revisá DATABASE_URL en .env y que el proyecto de Supabase no esté pausado.');
  process.exit(2);
}
try {
  if (command === 'migrate') await migrate(client);
  else if (command === 'seed') await seed(client);
  else if (command === 'reset') await reset(client);
  else if (command === 'empresa') await createCompany(client);
  else throw new Error(`Comando desconocido: ${command}`);
} catch (e) {
  console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
