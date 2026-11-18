import { ConflictError, NotFoundError } from '#src/core/errors.js';
import { can } from '#src/core/permissions.js';
import { parseInput } from '#src/core/validation.js';
import { backPath, wantsJson } from '#src/http/helpers.js';
import { STATUS_GROUPS, summarize } from './room-status.js';
import {
  housekeepingCommandSchema,
  outOfOrderCommandSchema,
  roomIdSchema,
} from './rooms.schemas.js';
import { groupByFloor, toRoomView } from './rooms.view-model.js';

/** Un id que no es un entero positivo equivale a una habitación inexistente (404, no 422). */
function parseRoomId(raw) {
  const parsed = roomIdSchema.safeParse(raw);
  if (!parsed.success) throw new NotFoundError('La habitación no existe.');
  return parsed.data;
}

/** Renderiza la tarjeta de una habitación a texto, sin enviarla. */
function renderCard(res, room, user) {
  return new Promise((resolve, reject) => {
    res.render('partials/room-card', { room: toRoomView(room, user) }, (err, html) =>
      err ? reject(err) : resolve(html),
    );
  });
}

/**
 * @param {{
 *   roomsService: ReturnType<import('./rooms.service.js').createRoomsService>,
 *   auditService: ReturnType<import('../audit/audit.service.js').createAuditService>,
 * }} deps
 */
export function createRoomsController({ roomsService, auditService }) {
  /**
   * Ejecuta un comando sobre una habitación y responde según quién preguntó:
   * - fetch → JSON con la tarjeta actualizada (o la tarjeta vigente si hubo conflicto).
   * - formulario sin JS → mensaje flash y redirección a la página anterior (PRG).
   */
  async function respondToCommand(req, res, roomId, command) {
    try {
      const { room, message } = await command();
      if (!wantsJson(req)) {
        req.flash('success', message);
        return res.redirect(303, backPath(req, '/rooms'));
      }
      res.json({
        ok: true,
        message,
        version: room.version,
        html: await renderCard(res, room, req.user),
      });
    } catch (err) {
      if (!(err instanceof ConflictError) || !wantsJson(req)) throw err;
      const current = await roomsService.findRoom(roomId);
      res.status(409).json({
        ok: false,
        error: { code: err.code, message: err.message },
        html: current ? await renderCard(res, current, req.user) : null,
      });
    }
  }

  return {
    /** GET /rooms — tablero en vivo (HU-07). */
    async board(req, res) {
      const rooms = await roomsService.listRooms();
      const views = rooms.map((room) => toRoomView(room, req.user));
      const summary = summarize(rooms);
      const showActivity = can(req.user, 'activity.view');

      res.renderPage('rooms/board', {
        title: 'Habitaciones',
        floors: groupByFloor(views),
        groups: STATUS_GROUPS.map((g) => ({ ...g, count: summary.byGroup[g.id] })),
        total: summary.total,
        activity: showActivity ? await auditService.listRecent(15) : null,
        liveChannels: showActivity ? ['rooms', 'activity'] : ['rooms'],
        scripts: ['/js/pages/rooms-board.js'],
      });
    },

    /** GET /rooms/:id/card — fragmento para actualizaciones en vivo (ADR-0006). */
    async card(req, res) {
      const room = await roomsService.getRoom(parseRoomId(req.params.id));
      res.render('partials/room-card', { room: toRoomView(room, req.user) });
    },

    /** POST /rooms/:id/housekeeping — HU-08. */
    async changeHousekeeping(req, res) {
      const roomId = parseRoomId(req.params.id);
      const input = parseInput(housekeepingCommandSchema, req.body);
      await respondToCommand(req, res, roomId, () =>
        roomsService.changeHousekeepingStatus({
          roomId,
          status: input.status,
          expectedVersion: input.version,
          actor: req.user,
        }),
      );
    },

    /** POST /rooms/:id/out-of-order — HU-09. */
    async outOfOrder(req, res) {
      const roomId = parseRoomId(req.params.id);
      const input = parseInput(outOfOrderCommandSchema, req.body);
      await respondToCommand(req, res, roomId, () =>
        input.action === 'block'
          ? roomsService.markOutOfOrder({
              roomId,
              reason: input.reason,
              expectedVersion: input.version,
              actor: req.user,
            })
          : roomsService.releaseOutOfOrder({
              roomId,
              expectedVersion: input.version,
              actor: req.user,
            }),
      );
    },
  };
}
