/**
 * Reenvía cada registro nuevo de la bitácora al canal `activity` (contrato: `activity:created`).
 * El ítem es igual para todos los miembros del canal, así que viaja con sus datos.
 *
 * @param {{ events: ReturnType<import('#src/core/events.js').createEventBus>,
 *           realtime: import('#src/realtime/gateway.js').RealtimeGateway }} deps
 */
export function registerAuditRealtime({ events, realtime }) {
  events.subscribe('activity.recorded', ({ payload }) => {
    const { item } = payload;
    realtime.toChannel('activity', 'activity:created', {
      id: item.id,
      occurredAt: item.occurredAt,
      actorName: item.actorName,
      summary: item.summary,
      entityType: item.entityType,
      entityId: item.entityId,
    });
  });
}
