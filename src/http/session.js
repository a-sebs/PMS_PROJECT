import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';

export const SESSION_COOKIE_NAME = 'pms.sid';
const EIGHT_HOURS = 8 * 60 * 60 * 1000;

const PgStore = connectPgSimple(session);

/**
 * Sesiones guardadas en PostgreSQL (tabla user_sessions): sobreviven a reinicios y no dejan
 * estado en la memoria del proceso. La misma instancia se comparte con Socket.IO.
 *
 * @param {{ config: ReturnType<import('#src/config/env.js').loadConfig>,
 *           db: ReturnType<import('#src/db/database.js').createDatabase> }} deps
 */
export function createSessionMiddleware({ config, db }) {
  const store = new PgStore({
    pool: db.pool,
    tableName: 'user_sessions',
    createTableIfMissing: false,
    // En pruebas no se programa la limpieza periódica (mantendría vivo el proceso).
    pruneSessionInterval: config.isTest ? false : 15 * 60,
  });

  const middleware = session({
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true, // la expiración se renueva con la actividad: 8 h de inactividad = un turno
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto', // Secure cuando la conexión es HTTPS (requiere TRUST_PROXY detrás de un proxy)
      maxAge: EIGHT_HOURS,
    },
  });

  return { middleware, store };
}
