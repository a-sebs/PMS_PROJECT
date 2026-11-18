import { channelRoom, roleRoom, sessionRoom, userRoom } from './channels.js';

/**
 * @typedef {object} RealtimeGateway
 * @property {(io: import('socket.io').Server) => void} attach
 * @property {(channel: string, event: string, payload: unknown) => void} toChannel
 * @property {(userId: number, event: string, payload: unknown) => void} toUser
 * @property {(roles: string[], event: string, payload: unknown) => void} toRoles
 * @property {(target: { to: string[], except?: string[] }, event: string, payload: unknown) => void} emit
 * @property {(event: string, payload: unknown) => void} broadcast
 * @property {(sessionId: string, reason: string) => void} endSession
 * @property {(userId: number, reason: string) => void} endUserSessions
 * @property {(userId: number, reason: string) => void} refreshUser
 */

/**
 * Fachada sobre Socket.IO que usan los módulos. Puede crearse antes que el servidor de sockets
 * (y en pruebas que no lo levantan): mientras no tenga un `io` conectado, las emisiones se ignoran.
 *
 * @returns {RealtimeGateway}
 */
export function createRealtimeGateway() {
  /** @type {import('socket.io').Server | null} */
  let io = null;

  function endRoom(room, event, reason) {
    if (!io) return;
    io.to(room).emit(event, { reason });
    io.in(room).disconnectSockets();
  }

  return {
    attach(server) {
      io = server;
    },
    toChannel(channel, event, payload) {
      io?.to(channelRoom(channel)).emit(event, payload);
    },
    toUser(userId, event, payload) {
      io?.to(userRoom(userId)).emit(event, payload);
    },
    toRoles(roles, event, payload) {
      if (!io || roles.length === 0) return;
      io.to(roles.map(roleRoom)).emit(event, payload);
    },
    /** Emisión con salas destino y salas excluidas (por ejemplo: "a estos roles, menos al autor"). */
    emit({ to, except = [] }, event, payload) {
      if (!io || to.length === 0) return;
      io.to(to).except(except).emit(event, payload);
    },
    broadcast(event, payload) {
      io?.emit(event, payload);
    },
    /** Cierre de sesión: el cliente muestra un aviso y vuelve al login. */
    endSession(sessionId, reason) {
      endRoom(sessionRoom(sessionId), 'session:ended', reason);
    },
    endUserSessions(userId, reason) {
      endRoom(userRoom(userId), 'session:ended', reason);
    },
    /** Cambiaron los permisos de alguien: sus pestañas recargan para ver el menú correcto. */
    refreshUser(userId, reason) {
      endRoom(userRoom(userId), 'session:changed', reason);
    },
  };
}
