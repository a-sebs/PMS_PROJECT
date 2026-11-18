import { STATUS_CODES } from './room-status.js';

/**
 * Traduce el evento de dominio `room.status_changed` al evento delgado `room:updated` del canal
 * `rooms` (contrato en docs/03-diseno/tiempo-real.md). Cada cliente pide luego su propio
 * fragmento con sus permisos (ADR-0006).
 *
 * @param {{ events: ReturnType<import('#src/core/events.js').createEventBus>,
 *           realtime: import('#src/realtime/gateway.js').RealtimeGateway }} deps
 */
export function registerRoomsRealtime({ events, realtime }) {
  events.subscribe('room.status_changed', ({ payload, occurredAt }) => {
    const { room, code, actor } = payload;
    realtime.toChannel('rooms', 'room:updated', {
      roomId: room.id,
      number: room.number,
      version: room.version,
      statusCode: code,
      statusLabel: STATUS_CODES[code].label,
      housekeepingStatus: room.housekeepingStatus,
      actor,
      occurredAt,
    });
  });
}
