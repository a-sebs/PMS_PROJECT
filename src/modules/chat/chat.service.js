import { ForbiddenError, NotFoundError, RateLimitError } from '#src/core/errors.js';
import { ROLE_LABELS } from '#src/core/permissions.js';
import { createRateLimiter } from '#src/core/rate-limiter.js';
import { canAccessRoom, findRoom, HISTORY_PAGE_SIZE, roomsFor } from './chat-rooms.js';
import * as repository from './chat.repository.js';

/** Agrega datos de presentación que no dependen de quién mira (el nombre del rol). */
const withRoleLabel = (message) => ({
  ...message,
  author: { ...message.author, roleLabel: ROLE_LABELS[message.author.role] ?? message.author.role },
});

/**
 * Chat del personal (HU-42). Lo usan tanto el WebSocket (chat.socket.js) como la ruta HTTP de
 * respaldo sin JavaScript: las reglas (permiso por sala, validación, límite de frecuencia) viven
 * aquí, una sola vez.
 *
 * @param {{
 *   db: ReturnType<import('#src/db/database.js').createDatabase>,
 *   events: ReturnType<import('#src/core/events.js').createEventBus>,
 *   rateLimit?: { max: number, windowMs: number },
 * }} deps
 */
export function createChatService({ db, events, rateLimit = { max: 8, windowMs: 10_000 } }) {
  const limiter = createRateLimiter(rateLimit);

  /** La sala existe y el usuario puede entrar; si no, error 404 / 403. */
  function roomFor(user, slug) {
    const room = findRoom(slug);
    if (!room) throw new NotFoundError('La sala no existe.');
    if (!canAccessRoom(user, room)) {
      throw new ForbiddenError('No tienes acceso a esta sala del chat.', 'CHAT_ROOM_FORBIDDEN');
    }
    return room;
  }

  return {
    roomFor,

    /** Salas visibles para el usuario con sus mensajes sin leer. */
    async roomsWithUnread(user) {
      const rooms = roomsFor(user);
      const unread = await repository.unreadCounts(
        db.pool,
        user.id,
        rooms.map((room) => room.slug),
      );
      return rooms.map((room) => ({ ...room, unread: unread[room.slug] ?? 0 }));
    },

    /** Total de mensajes sin leer (para la insignia del menú). */
    async unreadTotal(user) {
      const rooms = roomsFor(user).map((room) => room.slug);
      if (rooms.length === 0) return 0;
      const unread = await repository.unreadCounts(db.pool, user.id, rooms);
      return Object.values(unread).reduce((sum, count) => sum + count, 0);
    },

    /**
     * Últimos mensajes (o los anteriores a `beforeId`) y si quedan más viejos por cargar.
     * @returns {Promise<{ messages: object[], hasOlder: boolean }>}
     */
    async history({ user, room: slug, beforeId = null }) {
      const room = roomFor(user, slug);
      const rows = await repository.listRecent(db.pool, room.slug, HISTORY_PAGE_SIZE + 1, beforeId);
      const hasOlder = rows.length > HISTORY_PAGE_SIZE;
      return { messages: (hasOlder ? rows.slice(1) : rows).map(withRoleLabel), hasOlder };
    },

    /** Mensajes nuevos desde `afterId` (al reconectarse). */
    async since({ user, room: slug, afterId }) {
      const room = roomFor(user, slug);
      const rows = await repository.listAfter(db.pool, room.slug, afterId, 200);
      return rows.map(withRoleLabel);
    },

    /**
     * Guarda el mensaje y avisa (después de guardarlo) a quienes deben enterarse.
     * @param {{ user: { id: number, fullName: string, role: string }, room: string, body: string }} input
     *   `body` ya validado y saneado por sendMessageSchema.
     */
    async postMessage({ user, room: slug, body }) {
      const room = roomFor(user, slug);
      if (!limiter.consume(user.id)) {
        throw new RateLimitError('Estás enviando mensajes muy rápido. Espera unos segundos.');
      }
      const message = withRoleLabel(
        await repository.insert(db.pool, { room: room.slug, authorId: user.id, body }),
      );
      await repository.markRead(db.pool, user.id, room.slug, message.id);
      events.publish('chat.message_posted', { message, room });
      return message;
    },

    /**
     * Marca como leído hasta `messageId` (o hasta el último mensaje si no se indica). Nunca más
     * allá del último mensaje real: un id inventado no puede "leer" mensajes futuros.
     */
    async markRead({ user, room: slug, messageId = null }) {
      const room = roomFor(user, slug);
      const latest = await repository.latestId(db.pool, room.slug);
      const upTo = messageId === null ? latest : Math.min(messageId, latest);
      if (upTo > 0) await repository.markRead(db.pool, user.id, room.slug, upTo);
    },
  };
}
