import { ConflictError, NotFoundError } from '#src/core/errors.js';
import * as repository from './guests.repository.js';

const fullName = (guest) => `${guest.firstName} ${guest.lastName}`;

/**
 * Reglas de negocio del CRUD de huéspedes (HU-41). Cada cambio queda en la bitácora dentro de la
 * misma transacción, y los eventos se publican después del COMMIT.
 *
 * @param {{
 *   db: ReturnType<import('#src/db/database.js').createDatabase>,
 *   events: ReturnType<import('#src/core/events.js').createEventBus>,
 *   auditService: ReturnType<import('../audit/audit.service.js').createAuditService>,
 * }} deps
 */
export function createGuestsService({ db, events, auditService }) {
  /** Traduce la violación de la restricción única del documento a un error claro. */
  async function rethrowDuplicate(err, guest) {
    if (err.code === '23505' && err.constraint === 'guests_document_unique') {
      const existingId = await repository.findIdByDocument(
        db.pool,
        guest.documentType,
        guest.documentNumber,
      );
      throw new ConflictError('Ya hay un huésped registrado con ese documento.', {
        code: 'DOCUMENT_TAKEN',
        details: { field: 'documentNumber', existingId },
      });
    }
    throw err;
  }

  function publishActivity(item, type, payload) {
    events.publish(type, payload);
    events.publish('activity.recorded', { item });
  }

  /** @param {number} id */
  async function getGuest(id) {
    const guest = await repository.findById(db.pool, id);
    if (!guest) throw new NotFoundError('El huésped no existe o fue eliminado.');
    return guest;
  }

  return {
    /**
     * Listado paginado con búsqueda y filtro.
     * @param {{ q?: string, nationality?: string, page: number, perPage: number }} query
     */
    async list({ q, nationality, page, perPage }) {
      const offset = (page - 1) * perPage;
      const { guests, total } = await repository.list(db.pool, {
        q,
        nationality,
        limit: perPage,
        offset,
      });
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      return {
        guests,
        total,
        page,
        perPage,
        totalPages,
        from: total === 0 ? 0 : Math.min(offset + 1, total),
        to: Math.min(offset + guests.length, total),
      };
    },

    get: getGuest,

    /** @param {number} id */
    find(id) {
      return repository.findById(db.pool, id);
    },

    /**
     * @param {Parameters<typeof repository.insert>[1]} input Datos ya validados.
     * @param {{ id: number, fullName: string }} actor
     */
    async create(input, actor) {
      let result;
      try {
        result = await db.transaction(async (client) => {
          const id = await repository.insert(client, input, actor.id);
          const item = await auditService.record(client, {
            actorId: actor.id,
            action: 'guest.created',
            entityType: 'guest',
            entityId: id,
            summary: `${actor.fullName} registró al huésped ${fullName(input)}`,
          });
          return { id, item };
        });
      } catch (err) {
        await rethrowDuplicate(err, input);
      }
      publishActivity(result.item, 'guest.created', { guestId: result.id });
      return getGuest(result.id);
    },

    /**
     * @param {number} id
     * @param {number} expectedVersion Versión que tenía el formulario al abrirse.
     * @param {Parameters<typeof repository.insert>[1]} input
     * @param {{ id: number, fullName: string }} actor
     */
    async update(id, expectedVersion, input, actor) {
      let item;
      try {
        item = await db.transaction(async (client) => {
          const updated = await repository.update(client, id, expectedVersion, input);
          if (!updated) {
            const current = await repository.findById(client, id);
            if (!current) throw new NotFoundError('El huésped no existe o fue eliminado.');
            throw new ConflictError(
              'Otra persona modificó este huésped mientras lo editabas. Revisa los datos actuales y vuelve a guardar.',
              { code: 'VERSION_CONFLICT', details: { current } },
            );
          }
          return auditService.record(client, {
            actorId: actor.id,
            action: 'guest.updated',
            entityType: 'guest',
            entityId: id,
            summary: `${actor.fullName} actualizó los datos de ${fullName(input)}`,
          });
        });
      } catch (err) {
        await rethrowDuplicate(err, input);
      }
      publishActivity(item, 'guest.updated', { guestId: id });
      return getGuest(id);
    },

    /**
     * @param {number} id
     * @param {{ id: number, fullName: string }} actor
     */
    async remove(id, actor) {
      const result = await db.transaction(async (client) => {
        const removed = await repository.remove(client, id);
        if (!removed) throw new NotFoundError('El huésped no existe o ya fue eliminado.');
        const item = await auditService.record(client, {
          actorId: actor.id,
          action: 'guest.deleted',
          entityType: 'guest',
          entityId: id,
          summary: `${actor.fullName} eliminó al huésped ${fullName(removed)}`,
        });
        return { removed, item };
      });
      publishActivity(result.item, 'guest.deleted', { guestId: id });
      return result.removed;
    },
  };
}
