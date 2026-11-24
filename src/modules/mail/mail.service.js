import * as outbox from './outbox.repository.js';
import { createOutboxTransport } from './transports/outbox.js';
import { createSmtpTransport } from './transports/smtp.js';

/**
 * Elige el transporte según la configuración. Es el único lugar donde se decide; el resto del
 * sistema solo conoce `mailService`.
 *
 * @param {{ mailTransport: 'outbox' | 'smtp', mailFrom?: string | null, smtpHost?: string | null,
 *           smtpPort?: number, smtpUser?: string | null, smtpPass?: string | null }} config
 */
export function createMailTransport(config) {
  if (config.mailTransport === 'smtp') {
    return createSmtpTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      user: config.smtpUser,
      pass: config.smtpPass,
      from: config.mailFrom,
    });
  }
  return createOutboxTransport();
}

/**
 * Envío de correos.
 *
 * El correo se escribe SIEMPRE en `email_outbox` (es el registro de qué se intentó mandar y con qué
 * resultado) y después se entrega por el transporte elegido. Esa separación en dos pasos permite
 * encolar dentro de una transacción y entregar fuera de ella: si el proveedor falla, el token de
 * recuperación no se pierde y el usuario no ve un error de servidor.
 *
 * @param {{ db: ReturnType<import('#src/db/database.js').createDatabase>,
 *           logger: import('pino').Logger,
 *           transport?: ReturnType<typeof createOutboxTransport> }} deps
 */
export function createMailService({ db, logger, transport = createOutboxTransport() }) {
  /**
   * Paso 1: deja el correo en la bandeja, en estado `queued`. No sale nada de la máquina.
   * @param {{ to: string, subject: string, body: string, linkUrl?: string | null }} email
   * @param {import('#src/db/database.js').Queryable} [q] Cliente de una transacción en curso.
   */
  async function queue(email, q = db.pool) {
    const saved = await outbox.insert(q, email);
    // El enlace NO se escribe en el log: un log se comparte más que la base de datos.
    logger.info({ emailId: saved.id, to: email.to, transport: transport.name }, 'correo encolado');
    return saved;
  }

  /**
   * Paso 2: entrega y anota el resultado. Nunca lanza: un fallo del proveedor queda registrado en
   * la bandeja y en el log, pero no rompe la petición del usuario.
   * @param {import('./outbox.repository.js').OutboxEmail} saved
   */
  async function deliver(saved) {
    try {
      const { status, providerId } = await transport.deliver(saved);
      await outbox.markDelivered(db.pool, saved.id, { status, providerId });
      if (status === 'sent') logger.info({ emailId: saved.id, providerId }, 'correo enviado');
      return { ok: true, status };
    } catch (err) {
      logger.warn(
        { err, emailId: saved.id, transport: transport.name },
        'no se pudo entregar el correo',
      );
      await outbox.markFailed(db.pool, saved.id, err.message).catch((nested) => {
        logger.error({ err: nested, emailId: saved.id }, 'tampoco se pudo anotar el fallo');
      });
      return { ok: false, status: 'failed' };
    }
  }

  return {
    transportName: transport.name,

    queue,
    deliver,

    /**
     * Encola y entrega en un solo paso, para quien no está dentro de una transacción.
     * @param {{ to: string, subject: string, body: string, linkUrl?: string | null }} email
     * @param {import('#src/db/database.js').Queryable} [q]
     */
    async send(email, q = db.pool) {
      const saved = await queue(email, q);
      await deliver(saved);
      return saved;
    },

    listOutbox(limit = 30) {
      return outbox.listRecent(db.pool, Math.min(Math.max(limit, 1), 100));
    },
  };
}
