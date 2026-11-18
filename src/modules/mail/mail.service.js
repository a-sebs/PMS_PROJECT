import * as outbox from './outbox.repository.js';

/**
 * Envío de correos SIMULADO (la guía lo permite cuando no hay servidor SMTP).
 *
 * Cada correo se guarda en la tabla `email_outbox` y se escribe en el log. En desarrollo se puede
 * leer en la "bandeja de pruebas" (/dev/correos). Para enviar correos reales bastaría con otra
 * implementación de `send()` (por ejemplo con nodemailer) sin tocar a quien la usa.
 *
 * @param {{ db: ReturnType<import('#src/db/database.js').createDatabase>,
 *           logger: import('pino').Logger }} deps
 */
export function createMailService({ db, logger }) {
  return {
    /**
     * @param {{ to: string, subject: string, body: string, linkUrl?: string | null }} email
     * @param {import('#src/db/database.js').Queryable} [q] Cliente de una transacción en curso.
     */
    async send(email, q = db.pool) {
      const saved = await outbox.insert(q, email);
      // El enlace NO se escribe en el log: un log se comparte más que la base de datos.
      logger.info(
        { emailId: saved.id, to: email.to, subject: email.subject },
        'correo simulado guardado en la bandeja de salida',
      );
      return saved;
    },

    listOutbox(limit = 30) {
      return outbox.listRecent(db.pool, Math.min(Math.max(limit, 1), 100));
    },
  };
}
