import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

// Identificador arbitrario del bloqueo consultivo: evita que dos procesos migren a la vez.
const MIGRATION_LOCK_ID = 727_001;
const FILE_PATTERN = /^\d{3,}_[a-z0-9_-]+\.sql$/i;

/**
 * Aplica, en orden, las migraciones de `migrations/` que aún no figuran en `schema_migrations`.
 * Cada migración corre en su propia transacción.
 *
 * @param {{ pool: import('pg').Pool }} db
 * @param {{ dir?: string, logger?: { info: Function } }} [options]
 * @returns {Promise<string[]>} Nombres de las migraciones aplicadas en esta ejecución.
 */
export async function migrate(db, { dir = MIGRATIONS_DIR, logger } = {}) {
  const client = await db.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.version));
    const files = (await readdir(dir)).filter((file) => FILE_PATTERN.test(file)).sort();
    const pending = files.filter((file) => !applied.has(file));

    for (const file of pending) {
      const sql = await readFile(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger?.info(`✔ migración aplicada: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`La migración ${file} falló: ${err.message}`, { cause: err });
      }
    }
    return pending;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

/**
 * Borra TODO el esquema public y lo recrea vacío. Solo para desarrollo y pruebas.
 * @param {{ pool: import('pg').Pool }} db
 */
export async function resetSchema(db) {
  await db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}
