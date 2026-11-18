import { ROLES } from '#src/core/permissions.js';

/**
 * Salas del chat del personal (HU-42) y qué roles entran a cada una. La guía exige al menos una
 * sala general; las otras dos coordinan a recepción con limpieza y con mantenimiento.
 * Si se agrega una sala, también hay que agregarla al CHECK de chat_messages.room.
 */
export const CHAT_ROOMS = Object.freeze([
  {
    slug: 'general',
    name: 'General',
    description: 'Todo el personal del hotel.',
    roles: ROLES,
  },
  {
    slug: 'limpieza',
    name: 'Limpieza',
    description: 'Recepción y limpieza: habitaciones listas, pedidos de huéspedes.',
    roles: ['admin', 'front_desk', 'housekeeping'],
  },
  {
    slug: 'mantenimiento',
    name: 'Mantenimiento',
    description: 'Averías, reparaciones y habitaciones bloqueadas.',
    roles: ['admin', 'front_desk', 'maintenance'],
  },
]);

export const CHAT_ROOM_SLUGS = Object.freeze(CHAT_ROOMS.map((room) => room.slug));
export const MESSAGE_MAX_LENGTH = 1000;
export const HISTORY_PAGE_SIZE = 50;

/** @param {string} slug */
export const findRoom = (slug) => CHAT_ROOMS.find((room) => room.slug === slug) ?? null;

/** @param {{ role: string } | null | undefined} user */
export const canAccessRoom = (user, room) => Boolean(user && room?.roles.includes(user.role));

/** @param {{ role: string }} user */
export const roomsFor = (user) => CHAT_ROOMS.filter((room) => canAccessRoom(user, room));
