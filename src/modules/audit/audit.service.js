import * as repository from './audit.repository.js';

/**
 * Bitácora de actividad (RN-07, HU-30).
 *
 * `record()` recibe el cliente de la transacción del servicio que hace el cambio: así el registro
 * y el cambio se confirman o se revierten juntos. Nunca hay un cambio sin rastro ni un rastro de un
 * cambio que no ocurrió.
 *
 * @param {{ db: ReturnType<import('#src/db/database.js').createDatabase> }} deps
 */
export function createAuditService({ db }) {
  return {
    /**
     * @param {import('#src/db/database.js').Queryable} q Cliente de la transacción en curso.
     * @param {Parameters<typeof repository.insert>[1]} entry
     */
    record(q, entry) {
      return repository.insert(q, entry);
    },

    /** @param {number} [limit] */
    listRecent(limit = 20) {
      return repository.listRecent(db.pool, Math.min(Math.max(limit, 1), 100));
    },
  };
}
