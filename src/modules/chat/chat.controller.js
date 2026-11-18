import { todayIn } from '#src/core/dates.js';
import { ValidationError } from '#src/core/errors.js';
import { parseInput, z } from '#src/core/validation.js';
import { wantsJson } from '#src/http/helpers.js';
import { CHAT_ROOMS, MESSAGE_MAX_LENGTH } from './chat-rooms.js';
import { sendMessageSchema } from './chat.schemas.js';

const beforeSchema = z.coerce.number().int().positive().optional().catch(undefined);

/**
 * HU-42 · Página del chat (renderizada en el servidor) y envío por HTTP como respaldo sin
 * JavaScript. Con JavaScript, los mensajes viajan por Socket.IO (src/modules/chat/chat.socket.js).
 *
 * @param {{ chatService: ReturnType<import('./chat.service.js').createChatService>,
 *           presence: ReturnType<import('#src/realtime/presence.js').createPresence>,
 *           timezone: string }} deps
 */
export function createChatController({ chatService, presence, timezone }) {
  /** "14:05" si el mensaje es de hoy; "3 nov, 14:05" si es más viejo. */
  const dayOf = (iso) => todayIn(timezone, new Date(iso));

  return {
    index(req, res) {
      res.redirect(303, `/chat/${CHAT_ROOMS[0].slug}`);
    },

    /** GET /chat/:room?before=ID */
    async show(req, res) {
      const room = chatService.roomFor(req.user, req.params.room);
      const beforeId = beforeSchema.parse(req.query.before);
      const [{ messages, hasOlder }, rooms] = await Promise.all([
        chatService.history({ user: req.user, room: room.slug, beforeId }),
        chatService.roomsWithUnread(req.user),
      ]);
      // Viendo los últimos mensajes (no una página vieja), la sala queda leída.
      if (!beforeId) {
        await chatService.markRead({ user: req.user, room: room.slug });
        const currentUnread = rooms.find((r) => r.slug === room.slug)?.unread ?? 0;
        res.locals.chatUnread = Math.max(0, (res.locals.chatUnread ?? 0) - currentUnread);
      }

      const today = todayIn(timezone);
      res.renderPage('chat/index', {
        title: `Chat · ${room.name}`,
        room,
        rooms: rooms.map((r) => (r.slug === room.slug ? { ...r, unread: 0 } : r)),
        messages: messages.map((message) => ({
          ...message,
          mine: message.author.id === req.user.id,
          isToday: dayOf(message.createdAt) === today,
        })),
        hasOlder,
        olderHref:
          hasOlder && messages.length > 0 ? `/chat/${room.slug}?before=${messages[0].id}` : null,
        isHistoryPage: Boolean(beforeId),
        online: presence.list(),
        lastId: messages.at(-1)?.id ?? 0,
        maxLength: MESSAGE_MAX_LENGTH,
        liveManual: true,
        scripts: ['/js/forms.js', '/js/pages/chat.js'],
      });
    },

    /** POST /chat/:room/messages — respaldo HTTP (sin JavaScript o sin conexión en vivo). */
    async send(req, res) {
      const room = chatService.roomFor(req.user, req.params.room);
      let input;
      try {
        input = parseInput(sendMessageSchema, { room: room.slug, body: req.body?.body });
      } catch (err) {
        if (!(err instanceof ValidationError) || wantsJson(req)) throw err;
        req.flash('error', err.message);
        return res.redirect(303, `/chat/${room.slug}`);
      }
      const message = await chatService.postMessage({ user: req.user, ...input });
      if (wantsJson(req)) return res.status(201).json({ ok: true, message });
      res.redirect(303, `/chat/${room.slug}#mensaje-${message.id}`);
    },
  };
}
