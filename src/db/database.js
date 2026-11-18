import pg from 'pg';

// Las columnas DATE (OID 1082) se leen como texto 'AAAA-MM-DD' y no como Date de JavaScript.
// Una fecha de estancia no tiene hora: convertirla a Date la corre un día según la zona horaria.
pg.types.setTypeParser(1082, (value) => value);

// BIGINT (OID 20) llega como texto por defecto. Nuestros ids y conteos caben de sobra en un Number
// (hasta 2^53), así que se convierten para poder compararlos con === y serializarlos como número.
pg.types.setTypeParser(20, (value) => Number.parseInt(value, 10));

/**
 * Cualquier objeto con `.query()`: el pool o un cliente dentro de una transacción.
 * Los repositorios reciben un Queryable para poder participar en transacciones.
 * @typedef {Pick<pg.Pool, 'query'> | pg.PoolClient} Queryable
 */

/**
 * @param {string} connectionString
 * @param {{ max?: number, logger?: import('pino').Logger }} [options]
 */
export function createDatabase(connectionString, { max = 10, logger } = {}) {
  const pool = new pg.Pool({ connectionString, max });

  pool.on('error', (err) => {
    // Un cliente inactivo perdió la conexión (por ejemplo, la BD se reinició). El pool lo reemplaza.
    logger?.error({ err }, 'Error en una conexión inactiva del pool de PostgreSQL');
  });

  return {
    pool,

    /** @type {pg.Pool['query']} */
    query: (text, params) => pool.query(text, params),

    /**
     * Ejecuta `work` dentro de una transacción. Si `work` lanza un error se hace ROLLBACK.
     * @template T
     * @param {(client: pg.PoolClient) => Promise<T>} work
     * @returns {Promise<T>}
     */
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async ping() {
      await pool.query('SELECT 1');
    },

    close: () => pool.end(),
  };
}
