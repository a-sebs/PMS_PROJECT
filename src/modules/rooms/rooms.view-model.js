import { can } from '#src/core/permissions.js';
import { housekeepingMachine, STATUS_CODES, statusCode } from './room-status.js';

/** Ícono del sprite /img/icons.svg que acompaña al estado (el estado nunca va solo en color). */
function iconFor(room) {
  if (room.isOutOfOrder) return 'ooo';
  if (room.housekeepingStatus === 'cleaning') return 'cleaning';
  if (room.housekeepingStatus === 'inspected') return 'inspected';
  if (room.housekeepingStatus === 'clean') return 'clean';
  return 'dirty';
}

/**
 * Prepara una habitación para las vistas, ya resuelto TODO lo que depende del usuario:
 * la vista solo dibuja (ADR-0003). Las acciones salen de la misma máquina de estados que valida
 * el servicio, así que el botón que se ve es exactamente lo que el servidor aceptará.
 *
 * @param {import('./rooms.repository.js').Room} room
 * @param {{ role: string }} user
 */
export function toRoomView(room, user) {
  const code = statusCode(room);
  const meta = STATUS_CODES[code];
  const canManageOutOfOrder = can(user, 'rooms.out_of_order');

  return {
    icon: iconFor(room),
    id: room.id,
    number: room.number,
    floor: room.floor,
    version: room.version,
    typeName: room.roomType.name,
    typeCode: room.roomType.code,
    code,
    label: meta.label,
    tone: meta.tone,
    groups: meta.groups,
    isAssignable: meta.assignable,
    isOccupied: room.occupancyStatus === 'occupied',
    housekeepingStatus: room.housekeepingStatus,
    housekeepingLabel: housekeepingMachine.label(room.housekeepingStatus),
    isOutOfOrder: room.isOutOfOrder,
    outOfOrderReason: room.outOfOrderReason,
    outOfOrderSince: room.outOfOrderSince,
    updatedAt: room.updatedAt,
    updatedByName: room.updatedByName,
    housekeepingActions: housekeepingMachine
      .availableTransitions(room.housekeepingStatus, user.role, room)
      .map((t) => ({ to: t.to, label: t.action })),
    canBlock: canManageOutOfOrder && !room.isOutOfOrder && room.occupancyStatus === 'vacant',
    canRelease: canManageOutOfOrder && room.isOutOfOrder,
  };
}

/**
 * Agrupa las tarjetas por piso para el tablero.
 * @param {ReturnType<typeof toRoomView>[]} rooms
 */
export function groupByFloor(rooms) {
  const floors = new Map();
  for (const room of rooms) {
    if (!floors.has(room.floor)) floors.set(room.floor, []);
    floors.get(room.floor).push(room);
  }
  return [...floors].map(([floor, floorRooms]) => ({ floor, rooms: floorRooms }));
}
