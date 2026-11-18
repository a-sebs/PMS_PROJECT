/**
 * Canales de tiempo real y el permiso necesario para unirse a cada uno.
 * Contrato completo: docs/03-diseno/tiempo-real.md
 */
export const CHANNEL_PERMISSIONS = Object.freeze({
  rooms: 'rooms.view',
  activity: 'activity.view',
});

/** Nombre de la sala de Socket.IO que respalda un canal. */
export const channelRoom = (channel) => `channel:${channel}`;
export const userRoom = (userId) => `user:${userId}`;
export const sessionRoom = (sessionId) => `session:${sessionId}`;
/** Cada socket se une a la sala de su rol: así se avisa "a todos los administradores". */
export const roleRoom = (role) => `role:${role}`;
/** Sala de Socket.IO de una sala del chat (solo quienes la tienen abierta). */
export const chatRoom = (slug) => `chat:${slug}`;
