import pg from 'pg';
import { config } from './config';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export interface DbSession {
  userId: string;
  aal: 'aal1' | 'aal2';
}

/**
 * Ejecuta `fn` en una transacción con la identidad del usuario cargada para la base
 * (app.user_id / app.aal). Los permisos los aplica Postgres: funciones + seguridad por filas.
 */
export async function withSession<T>(session: DbSession | null, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (session) {
      await client.query(`SELECT set_config('app.user_id', $1, true), set_config('app.aal', $2, true)`, [session.userId, session.aal]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
