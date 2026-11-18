import { AppError } from '#src/core/errors.js';
import { chatRoom } from '#src/realtime/channels.js';
import {
  historySchema,
  joinRoomSchema,
  markReadSchema,
  sendMessageSchema,
} from './chat.schemas.js';

/**
 * Eventos del chat que llegan por WebSocket (excepción documentada en ADR-0011: en el chat los
 * mensajes viajan por el socket, no por HTTP). Cada evento:
 * 1. ya viene de un socket autenticado en el handshake (misma sesión que Express);
 * 2. se valida y sanea con zod;
 * 3. pasa por el servicio, que verifica el permiso de la sala y el límite de frecuencia;
 * 4. responde con un acknowledgement `{ ok, ... }` o `{ ok: false, error: { code, message } }`.
 *
 * @param {{ chatService: ReturnType<import('./chat.service.js').createChatService>,
 *           presence: ReturnType<import('#src/realtime/presence.js').createPresence>,
 *           logger: import('pino').Logger }} deps
 */
export function createChatSocketHandler({ chatService, presence, logger }) {
  /** Envuelve un manejador: valida, ejecuta y responde siempre (nunca deja el ack colgado). */
  function handle(socket, schema, work) {
    return async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const parsed = schema.safeParse(payload ?? {});
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? 'Los datos enviados no son válidos.';
        return reply({ ok: false, error: { code: 'VALIDATION_ERROR', message } });
      }
      try {
        reply({ ok: true, ...(await work(parsed.data)) });
      } catch (err) {
        if (err instanceof AppError && err.status < 500) {
          return reply({ ok: false, error: { code: err.code, message: err.message } });
        }
        logger.error({ err, userId: socket.data.user.id }, 'falló un evento del chat');
        reply({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'No se pudo completar la acción del chat.' },
        });
      }
    };
  }

  return (socket) => {
    const { id, name, role } = socket.data.user;
    const user = { id, fullName: name, role };

    socket.on(
      'chat:join',
      handle(socket, joinRoomSchema, async ({ room, afterId }) => {
        chatService.roomFor(user, room);
        // Un socket mira una sola sala a la vez.
        for (const joined of socket.rooms) {
          if (joined.startsWith('chat:') && joined !== chatRoom(room)) socket.leave(joined);
        }
        socket.join(chatRoom(room));
        const messages =
          afterId === undefined
            ? (await chatService.history({ user, room })).messages
            : await chatService.since({ user, room, afterId });
        await chatService.markRead({ user, room });
        return { room, messages, online: presence.list() };
      }),
    );

    socket.on(
      'chat:send',
      handle(socket, sendMessageSchema, async ({ room, body }) => ({
        message: await chatService.postMessage({ user, room, body }),
      })),
    );

    socket.on(
      'chat:history',
      handle(socket, historySchema, ({ room, beforeId }) =>
        chatService.history({ user, room, beforeId }),
      ),
    );

    socket.on(
      'chat:read',
      handle(socket, markReadSchema, async ({ room, messageId }) => {
        await chatService.markRead({ user, room, messageId });
        return {};
      }),
    );
  };
}
