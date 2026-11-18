import { startServer } from './server.js';

/**
 * Punto de entrada: `npm start` / `npm run dev`.
 */
let server;
try {
  server = await startServer();
} catch (err) {
  console.error(`No se pudo iniciar Aurora PMS:\n${err.message}`);
  process.exit(1);
}

const { logger, config } = server.container;
logger.info(`Aurora PMS escuchando en http://localhost:${server.port} (${config.env})`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    logger.info(`${signal} recibido: cerrando de forma ordenada…`);
    const forceExit = setTimeout(() => process.exit(1), 10_000).unref();
    await server.close();
    clearTimeout(forceExit);
    process.exit(0);
  });
}
