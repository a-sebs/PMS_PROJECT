import { createEventBus } from './core/events.js';
import { createDatabase } from './db/database.js';
import { registerAuditRealtime } from './modules/audit/audit.realtime.js';
import { createAuditService } from './modules/audit/audit.service.js';
import { registerAuthRealtime } from './modules/auth/auth.realtime.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { registerChatRealtime } from './modules/chat/chat.realtime.js';
import { createChatService } from './modules/chat/chat.service.js';
import { createGuestsService } from './modules/guests/guests.service.js';
import { createMailService, createMailTransport } from './modules/mail/mail.service.js';
import { registerRoomsRealtime } from './modules/rooms/rooms.realtime.js';
import { createRoomsService } from './modules/rooms/rooms.service.js';
import { createRealtimeGateway } from './realtime/gateway.js';
import { createPresence } from './realtime/presence.js';

/**
 * Composition root: crea UNA vez las piezas compartidas y conecta los módulos entre sí.
 * Es el único lugar que sabe "quién depende de quién"; las pruebas lo reutilizan apuntando a la
 * base de datos de pruebas. Ver docs/03-diseno/arquitectura.md § 8.
 *
 * @param {{
 *   config: ReturnType<import('./config/env.js').loadConfig>,
 *   logger: import('pino').Logger,
 *   presenceGraceMs?: number,
 * }} deps
 */
export function createContainer({ config, logger, presenceGraceMs = 4000 }) {
  const db = createDatabase(config.databaseUrl, { logger });
  const events = createEventBus({ logger });
  const realtime = createRealtimeGateway();
  const presence = createPresence({
    graceMs: presenceGraceMs,
    onChange: (online) => realtime.broadcast('presence:update', { online }),
  });

  const auditService = createAuditService({ db });
  const mailService = createMailService({ db, logger, transport: createMailTransport(config) });
  if (config.isProduction && config.mailTransport === 'outbox') {
    logger.warn(
      'MAIL_TRANSPORT=outbox en producción: los correos de recuperación no saldrán de la aplicación',
    );
  }
  const authService = createAuthService({
    db,
    events,
    auditService,
    mailService,
    appUrl: config.appUrl,
  });
  const roomsService = createRoomsService({ db, events, auditService });
  const guestsService = createGuestsService({ db, events, auditService });
  const chatService = createChatService({ db, events });

  // Suscriptores: cómo los eventos de dominio llegan a los navegadores.
  registerRoomsRealtime({ events, realtime });
  registerAuditRealtime({ events, realtime });
  registerAuthRealtime({ events, realtime });
  registerChatRealtime({ events, realtime });

  return {
    config,
    logger,
    db,
    events,
    realtime,
    presence,
    services: {
      auth: authService,
      audit: auditService,
      mail: mailService,
      rooms: roomsService,
      guests: guestsService,
      chat: chatService,
    },
    async close() {
      presence.clear();
      await db.close();
    },
  };
}
