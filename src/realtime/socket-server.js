import { Server } from 'socket.io';
import { can } from '#src/core/permissions.js';
import { CHANNEL_PERMISSIONS, channelRoom, roleRoom, sessionRoom, userRoom } from './channels.js';

/**
 * Ejecuta el middleware de sesión de Express solo en el handshake de Engine.IO (la primera
 * petición), no en cada petición de long-polling. Patrón recomendado por la documentación de
 * Socket.IO para compartir la sesión.
 */
function onlyForHandshake(middleware) {
  return (req, res, next) => {
    const isHandshake = req._query.sid === undefined;
    if (isHandshake) middleware(req, res, next);
    else next();
  };
}

/**
 * Defensa contra Cross-Site WebSocket Hijacking: un navegador en otro sitio no puede abrir un
 * socket con la cookie de nuestros usuarios. Los clientes que no son navegadores (pruebas) no
 * envían Origin; igual necesitan una cookie de sesión válida.
 */
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   httpServer: import('node:http').Server,
 *   sessionMiddleware: import('express').RequestHandler,
 *   authService: { getActiveUser(id: number): Promise<{ id: number, fullName: string, role: string } | null> },
 *   gateway: import('./gateway.js').RealtimeGateway,
 *   presence: ReturnType<import('./presence.js').createPresence>,
 *   logger: import('pino').Logger,
 *   socketHandlers?: Array<(socket: import('socket.io').Socket) => void>,
 * }} deps
 */
export function createSocketServer({
  httpServer,
  sessionMiddleware,
  authService,
  gateway,
  presence,
  logger,
  socketHandlers = [],
}) {
  const io = new Server(httpServer, {
    serveClient: true,
    allowRequest: (req, callback) => callback(null, isSameOrigin(req)),
    // Ningún evento legítimo pesa más de unos KB (un mensaje del chat: máx. 1000 caracteres).
    // El valor por defecto (1 MB) facilitaría agotar la memoria con mensajes gigantes.
    maxHttpBufferSize: 16 * 1024,
    // Cortes de red breves: Socket.IO reenvía los eventos perdidos y restaura las salas.
    // skipMiddlewares: false → la autenticación se vuelve a verificar también al recuperar.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000, skipMiddlewares: false },
  });

  io.engine.use(onlyForHandshake(sessionMiddleware));

  // Autenticación: misma sesión que Express; sin usuario activo no hay conexión.
  io.use(async (socket, next) => {
    try {
      const userId = socket.request.session?.userId;
      const user = userId ? await authService.getActiveUser(userId) : null;
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = { id: user.id, name: user.fullName, role: user.role };
      socket.data.sessionId = socket.request.sessionID;
      next();
    } catch (err) {
      logger.error({ err }, 'falló la autenticación de un socket');
      next(new Error('server_error'));
    }
  });

  io.on('connection', (socket) => {
    const { user, sessionId } = socket.data;
    socket.join([userRoom(user.id), sessionRoom(sessionId), roleRoom(user.role)]);
    presence.connect(user, socket.id);
    logger.debug({ userId: user.id, recovered: socket.recovered }, 'socket conectado');

    // Eventos propios de cada módulo (por ahora, el chat).
    for (const register of socketHandlers) register(socket);

    socket.on('channel:join', (channel, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const permission = CHANNEL_PERMISSIONS[channel];
      if (!permission) return reply({ ok: false, error: 'unknown_channel' });
      if (!can(user, permission)) return reply({ ok: false, error: 'forbidden' });
      socket.join(channelRoom(channel));
      reply({ ok: true });
    });

    socket.on('channel:leave', (channel, ack) => {
      socket.leave(channelRoom(channel));
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('disconnect', (reason) => {
      presence.disconnect(user.id, socket.id);
      logger.debug({ userId: user.id, reason }, 'socket desconectado');
    });
  });

  gateway.attach(io);
  return io;
}
