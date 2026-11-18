import { chatRoom, roleRoom, userRoom } from '#src/realtime/channels.js';

/**
 * Difusión de los mensajes del chat (contrato en docs/03-diseno/tiempo-real.md).
 *
 * - `chat:message` → a quienes tienen la sala abierta (incluidas otras pestañas del autor).
 * - `chat:unread`  → a todos los que pueden ver la sala pero NO la tienen abierta, menos el autor:
 *   es la notificación en tiempo real de "mensaje nuevo" (insignia en el menú y aviso).
 *
 * @param {{ events: ReturnType<import('#src/core/events.js').createEventBus>,
 *           realtime: import('#src/realtime/gateway.js').RealtimeGateway }} deps
 */
export function registerChatRealtime({ events, realtime }) {
  events.subscribe('chat.message_posted', ({ payload }) => {
    const { message, room } = payload;
    realtime.emit({ to: [chatRoom(room.slug)] }, 'chat:message', message);
    realtime.emit(
      { to: room.roles.map(roleRoom), except: [chatRoom(room.slug), userRoom(message.author.id)] },
      'chat:unread',
      {
        room: room.slug,
        roomName: room.name,
        messageId: message.id,
        authorName: message.author.name,
        preview: message.body.length > 80 ? `${message.body.slice(0, 79)}…` : message.body,
      },
    );
  });
}
