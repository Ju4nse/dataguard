/**
 * Muestra el código TOTP actual de un usuario de DEMO (para probar el login sin celular).
 * Uso: npm run db:totp -- seguridad@demo.test
 * Solo funciona contra la base local: se conecta como dueño del esquema.
 */
import pg from 'pg';

const email = process.argv[2] ?? 'seguridad@demo.test';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://securedata:securedata_dev@localhost:5433/securedata' });
await client.connect();
const r = await client.query(
  `SELECT app.totp_codigo(totp_secreto, floor(extract(epoch FROM now()) / 30)::bigint) AS codigo,
          30 - (extract(epoch FROM now())::int % 30) AS segundos
   FROM app.usuarios WHERE email = $1 AND totp_secreto IS NOT NULL`,
  [email],
);
await client.end();
if (!r.rows[0]) {
  console.error(`${email} no tiene segundo factor configurado.`);
  process.exit(1);
}
console.log(`Código para ${email}: ${r.rows[0].codigo}  (vence en ${r.rows[0].segundos} s)`);
