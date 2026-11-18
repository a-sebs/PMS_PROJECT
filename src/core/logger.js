import pino from 'pino';

/**
 * Logger estructurado (JSON en producción, legible en desarrollo).
 *
 * @param {{ level: string, pretty?: boolean }} options
 */
export function createLogger({ level, pretty = false }) {
  return pino({
    level,
    base: { app: 'aurora-pms' },
    redact: {
      paths: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'password', '*.password'],
      censor: '[oculto]',
    },
    transport: pretty
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  });
}
