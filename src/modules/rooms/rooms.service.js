import { ConflictError, ForbiddenError, NotFoundError } from '#src/core/errors.js';
import { can } from '#src/core/permissions.js';
import { housekeepingMachine, statusCode, STATUS_CODES } from './room-status.js';
import * as repository from './rooms.repository.js';

/**
 * @typedef {{ id: number, fullName: string, role: string }} Actor
 * @typedef {import('./rooms.repository.js').Room} Room
 */

/**
 * Reglas de negocio del inventario de habitaciones.
 *
 * Patrón de cada comando (ver ADR-0008):
 *   1. Transacción + SELECT … FOR UPDATE (nadie más cambia la fila mientras decidimos).
 *   2. ¿La versión que vio el usuario sigue vigente? Si no → 409.
 *   3. ¿La regla de negocio lo permite? (máquina de estados, permisos, RN-10).
 *   4. UPDATE (version + 1) + registro en la bitácora, en la misma transacción.
 *   5. Después del COMMIT, publicar eventos de dominio.
 *
 * @param {{
 *   db: ReturnType<import('#src/db/database.js').createDatabase>,
 *   events: ReturnType<import('#src/core/events.js').createEventBus>,
 *   auditService: ReturnType<import('../audit/audit.service.js').createAuditService>,
 * }} deps
 */
export function createRoomsService({ db, events, auditService }) {
  async function lockRoom(client, roomId, expectedVersion) {
    const room = await repository.findByIdForUpdate(client, roomId);
    if (!room) throw new NotFoundError('La habitación no existe.');
    if (room.version !== expectedVersion) {
      throw new ConflictError(
        `Otra persona actualizó la ${room.number} hace un momento. Ya ves el estado actual; ` +
          'vuelve a intentarlo si aún aplica.',
        { code: 'VERSION_CONFLICT' },
      );
    }
    return room;
  }

  /**
   * Ejecuta un comando en una transacción y, tras el COMMIT, publica los eventos.
   * @param {(client: import('pg').PoolClient) => Promise<{ room: Room, previous: Room, activity: object, message: string }>} work
   * @param {Actor} actor
   */
  async function runCommand(work, actor) {
    const result = await db.transaction(work);
    const { room, previous, activity } = result;

    events.publish('room.status_changed', {
      room,
      previousCode: statusCode(previous),
      code: statusCode(room),
      actor: { id: actor.id, name: actor.fullName },
    });
    events.publish('activity.recorded', { item: activity });
    return result;
  }

  return {
    /** @returns {Promise<Room[]>} */
    listRooms() {
      return repository.listActive(db.pool);
    },

    /** @returns {Promise<Room | null>} */
    findRoom(roomId) {
      return repository.findById(db.pool, roomId);
    },

    /** @returns {Promise<Room>} */
    async getRoom(roomId) {
      const room = await repository.findById(db.pool, roomId);
      if (!room) throw new NotFoundError('La habitación no existe.');
      return room;
    },

    /**
     * HU-08 · Cambia el estado de limpieza respetando la máquina de estados y el rol.
     * @param {{ roomId: number, status: string, expectedVersion: number, actor: Actor }} command
     */
    changeHousekeepingStatus({ roomId, status, expectedVersion, actor }) {
      return runCommand(async (client) => {
        const previous = await lockRoom(client, roomId, expectedVersion);
        const from = previous.housekeepingStatus;
        const check = housekeepingMachine.check(from, status, actor.role, previous);

        if (!check.ok && check.reason === 'role_not_allowed') {
          throw new ForbiddenError('Tu rol no puede hacer este cambio de estado.');
        }
        if (!check.ok && check.reason === 'guard_failed') {
          throw new ConflictError(check.message, { code: 'INVALID_TRANSITION' });
        }
        if (!check.ok) {
          throw new ConflictError(
            `La ${previous.number} está "${housekeepingMachine.label(from)}": no se puede pasar a ` +
              `"${housekeepingMachine.label(status)}".`,
            { code: 'INVALID_TRANSITION' },
          );
        }

        await repository.updateHousekeepingStatus(client, {
          id: roomId,
          status,
          actorId: actor.id,
        });
        const room = await repository.findById(client, roomId);
        const activity = await auditService.record(client, {
          actorId: actor.id,
          action: 'room.housekeeping_changed',
          entityType: 'room',
          entityId: roomId,
          summary: `Habitación ${room.number}: ${housekeepingMachine.label(from)} → ${housekeepingMachine.label(status)}`,
          data: { from, to: status, version: room.version },
        });
        return {
          room,
          previous,
          activity,
          message: `${check.transition.done} en la ${room.number}.`,
        };
      }, actor);
    },

    /**
     * HU-09 · Bloquea una habitación por avería. RN-10: no si está ocupada.
     * @param {{ roomId: number, reason: string, expectedVersion: number, actor: Actor }} command
     */
    markOutOfOrder({ roomId, reason, expectedVersion, actor }) {
      if (!can(actor, 'rooms.out_of_order')) {
        throw new ForbiddenError('Tu rol no puede bloquear habitaciones.');
      }
      return runCommand(async (client) => {
        const previous = await lockRoom(client, roomId, expectedVersion);
        if (previous.isOutOfOrder) {
          throw new ConflictError(`La ${previous.number} ya está fuera de servicio.`, {
            code: 'INVALID_TRANSITION',
          });
        }
        if (previous.occupancyStatus === 'occupied') {
          throw new ConflictError(
            `La ${previous.number} está ocupada. Cambia al huésped de habitación antes de bloquearla.`,
            { code: 'ROOM_OCCUPIED' },
          );
        }

        await repository.markOutOfOrder(client, { id: roomId, reason, actorId: actor.id });
        const room = await repository.findById(client, roomId);
        const activity = await auditService.record(client, {
          actorId: actor.id,
          action: 'room.out_of_order',
          entityType: 'room',
          entityId: roomId,
          summary: `Habitación ${room.number} bloqueada: ${reason}`,
          data: { reason, version: room.version },
        });
        return { room, previous, activity, message: `Habitación ${room.number} bloqueada.` };
      }, actor);
    },

    /**
     * HU-09 · Libera una habitación bloqueada; conserva su estado de limpieza.
     * @param {{ roomId: number, expectedVersion: number, actor: Actor }} command
     */
    releaseOutOfOrder({ roomId, expectedVersion, actor }) {
      if (!can(actor, 'rooms.out_of_order')) {
        throw new ForbiddenError('Tu rol no puede liberar habitaciones.');
      }
      return runCommand(async (client) => {
        const previous = await lockRoom(client, roomId, expectedVersion);
        if (!previous.isOutOfOrder) {
          throw new ConflictError(`La ${previous.number} no está fuera de servicio.`, {
            code: 'INVALID_TRANSITION',
          });
        }

        await repository.releaseOutOfOrder(client, { id: roomId, actorId: actor.id });
        const room = await repository.findById(client, roomId);
        const activity = await auditService.record(client, {
          actorId: actor.id,
          action: 'room.back_in_service',
          entityType: 'room',
          entityId: roomId,
          summary: `Habitación ${room.number} liberada (${STATUS_CODES[statusCode(room)].label.toLowerCase()})`,
          data: { version: room.version },
        });
        return { room, previous, activity, message: `Habitación ${room.number} liberada.` };
      }, actor);
    },
  };
}
