import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { can, ROLE_LABELS } from './core/permissions.js';
import { DEMO_USERS } from './db/seed-data.js';
import { attrs } from './http/forms.js';
import { wantsJson } from './http/helpers.js';
import { loadCurrentUser } from './http/middlewares/auth.js';
import { csrfProtection } from './http/middlewares/csrf.js';
import { errorHandler, notFound } from './http/middlewares/error-handler.js';
import { flash } from './http/middlewares/flash.js';
import { renderPage } from './http/middlewares/render-page.js';
import { createSessionMiddleware } from './http/session.js';
import { createAuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createChatController } from './modules/chat/chat.controller.js';
import { createChatRouter } from './modules/chat/chat.routes.js';
import { createDashboardController } from './modules/dashboard/dashboard.controller.js';
import { createDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { createGuestsController } from './modules/guests/guests.controller.js';
import { createGuestsRouter } from './modules/guests/guests.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createMailRouter } from './modules/mail/mail.routes.js';
import { createRoomsController } from './modules/rooms/rooms.controller.js';
import { createRoomsRouter } from './modules/rooms/rooms.routes.js';
import { createUsersController } from './modules/users/users.controller.js';
import { createUsersRouter } from './modules/users/users.routes.js';

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const { version: APP_VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const FONT_PACKAGES = ['@fontsource/atkinson-hyperlegible-next', '@fontsource/big-shoulders'];
const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;
// El token de recuperación de clave viaja en la URL: nunca debe quedar escrito en los logs.
const SECRET_IN_URL = /(\/reset-password\/)[^/?#]+/;

/** Formateadores de fecha y hora en la zona horaria del hotel, disponibles en todas las vistas. */
function viewHelpers(timezone) {
  const time = new Intl.DateTimeFormat('es', { timeZone: timezone, timeStyle: 'short' });
  const dateTime = new Intl.DateTimeFormat('es', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  // Una fecha de calendario (AAAA-MM-DD) no tiene hora ni zona: se formatea en UTC para que no
  // "retroceda" un día.
  const longDate = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: 'UTC' });
  return {
    formatTime: (iso) => (iso ? time.format(new Date(iso)) : ''),
    formatDateTime: (iso) => (iso ? dateTime.format(new Date(iso)) : ''),
    formatDate: (isoDate) => (isoDate ? longDate.format(new Date(`${isoDate}T00:00:00Z`)) : ''),
    roleLabel: (role) => ROLE_LABELS[role] ?? role,
    // No se llama `attrs` porque las vistas reciben un parámetro con ese nombre.
    htmlAttrs: attrs,
  };
}

/**
 * Crea la aplicación Express. No escucha ningún puerto: de eso se encarga server.js (y las pruebas
 * usan Supertest o su propio servidor).
 *
 * @param {ReturnType<import('./container.js').createContainer>} container
 */
export function createApp(container) {
  const { config, logger, db, services, realtime } = container;
  const app = express();

  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.set('view engine', 'ejs');
  app.set('views', path.join(SRC_DIR, 'views'));
  Object.assign(app.locals, viewHelpers(config.timezone), {
    appName: 'Aurora',
    timezone: config.timezone,
  });

  // ── Seguridad de cabeceras (CSP estricta: sin JS ni CSS en línea) ──────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      strictTransportSecurity: config.isProduction,
    }),
  );

  // ── Compresión gzip de HTML, CSS, JS y JSON (medición de Lighthouse en docs/05-pruebas) ─────
  app.use(compression());

  // ── Archivos estáticos y health check: antes de logs y sesiones (no los necesitan) ────────────
  app.use(express.static(path.join(SRC_DIR, 'public'), { maxAge: 0 }));
  for (const pkg of FONT_PACKAGES) {
    const dir = path.dirname(fileURLToPath(import.meta.resolve(`${pkg}/latin-400.css`)));
    app.use(
      `/vendor/${pkg.split('/')[1]}`,
      express.static(dir, { maxAge: '30d', immutable: true }),
    );
  }
  app.use(createHealthRouter({ db, version: APP_VERSION }));

  // ── Logs por petición con id de correlación ────────────────────────────────────────────────
  app.use(
    pinoHttp({
      logger,
      genReqId(req, res) {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      // Solo lo necesario: sin cabeceras (llevan cookies de sesión) y sin secretos en la URL.
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url.replace(SECRET_IN_URL, '$1[oculto]'),
        }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // ── Sesión, usuario actual y protecciones ──────────────────────────────────────────────────
  const { middleware: sessionMiddleware, store: sessionStore } = createSessionMiddleware({
    config,
    db,
  });
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '20kb' }));
  app.use(sessionMiddleware);
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    next();
  });
  app.use(renderPage());
  app.use(flash());
  app.use(loadCurrentUser({ authService: services.auth }));
  app.use(csrfProtection());

  // Insignia de mensajes sin leer del chat en el menú (solo en páginas completas).
  app.use(async (req, res, next) => {
    res.locals.chatUnread = 0;
    const isFullPage =
      req.method === 'GET' &&
      !req.get('X-Partial') &&
      !wantsJson(req) &&
      !req.path.endsWith('/card');
    if (isFullPage && can(req.user, 'chat.use')) {
      res.locals.chatUnread = await services.chat.unreadTotal(req.user);
    }
    next();
  });

  // ── Rutas ─────────────────────────────────────────────────────────────────────────────────
  app.get('/', (req, res) => res.redirect(req.user ? '/dashboard' : '/login'));

  const demoUsers =
    config.env === 'development'
      ? DEMO_USERS.map((u) => ({ email: u.email, role: ROLE_LABELS[u.role] }))
      : [];
  app.use(
    createAuthRouter(
      createAuthController({
        authService: services.auth,
        realtime,
        demoUsers,
        showMailOutbox: config.showMailOutbox,
      }),
    ),
  );
  if (config.showMailOutbox) app.use(createMailRouter({ mailService: services.mail }));
  app.use(
    createDashboardRouter(
      createDashboardController({ roomsService: services.rooms, presence: container.presence }),
    ),
  );
  app.use(
    createRoomsRouter(
      createRoomsController({ roomsService: services.rooms, auditService: services.audit }),
    ),
  );
  app.use(
    createGuestsRouter(
      createGuestsController({ guestsService: services.guests, timezone: config.timezone }),
    ),
  );
  app.use(
    createChatRouter(
      createChatController({
        chatService: services.chat,
        presence: container.presence,
        timezone: config.timezone,
      }),
    ),
  );
  app.use(createUsersRouter(createUsersController({ authService: services.auth })));

  app.use(notFound);
  app.use(errorHandler({ isProduction: config.isProduction }));

  return { app, sessionMiddleware, sessionStore };
}
