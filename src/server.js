import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createContainer } from './container.js';
import { createLogger } from './core/logger.js';
import { createChatSocketHandler } from './modules/chat/chat.socket.js';
import { createSocketServer } from './realtime/socket-server.js';

/**
 * Arranca la aplicación completa: HTTP + Socket.IO sobre el mismo puerto.
 * La usan src/main.js (ejecución normal) y las pruebas de tiempo real.
 *
 * @param {{ config?: ReturnType<typeof loadConfig>, logger?: import('pino').Logger,
 *           presenceGraceMs?: number }} [overrides]
 */
export async function startServer({ config = loadConfig(), logger, presenceGraceMs } = {}) {
  logger ??= createLogger({ level: config.logLevel, pretty: config.env === 'development' });
  const container = createContainer({ config, logger, presenceGraceMs });
  const { app, sessionMiddleware, sessionStore } = createApp(container);

  const httpServer = createServer(app);
  const io = createSocketServer({
    httpServer,
    sessionMiddleware,
    authService: container.services.auth,
    gateway: container.realtime,
    presence: container.presence,
    logger,
    socketHandlers: [
      createChatSocketHandler({
        chatService: container.services.chat,
        presence: container.presence,
        logger,
      }),
    ],
  });

  await new Promise((resolve) => httpServer.listen(config.port, resolve));
  const { port } = httpServer.address();

  let closing;
  /** Apagado ordenado: deja de aceptar conexiones, cierra sockets, sesiones y el pool de la BD. */
  function close() {
    closing ??= (async () => {
      await new Promise((resolve) => io.close(() => resolve()));
      sessionStore.close();
      await container.close();
    })();
    return closing;
  }

  return { app, httpServer, io, container, port, close };
}
