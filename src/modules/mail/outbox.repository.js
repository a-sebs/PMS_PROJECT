/** @typedef {import('#src/db/database.js').Queryable} Queryable */

/**
 * @typedef {object} OutboxEmail
 * @property {number} id
 * @property {string} to
 * @property {string} subject
 * @property {string} body
 * @property {string | null} linkUrl
 * @property {string} createdAt  Instante ISO 8601.
 * @property {'queued' | 'sent' | 'failed' | 'simulated'} status
 * @property {string | null} providerId  Identificador que devolvió el proveedor (o null).
 * @property {string | null} error       Motivo del último fallo, si lo hubo.
 * @property {string | null} sentAt      Instante ISO 8601 del envío real, si salió.
 */

/** @returns {OutboxEmail} */
function toEmail(row) {
  return {
    id: row.id,
    to: row.to_address,
    subject: row.subject,
    body: row.body_text,
    linkUrl: row.link_url,
    createdAt: row.created_at.toISOString(),
    status: row.status,
    providerId: row.provider_id,
    error: row.error,
    sentAt: row.sent_at ? row.sent_at.toISOString() : null,
  };
}

/**
 * Encola un correo. Nace en estado `queued`: todavía no salió de la aplicación.
 * @param {Queryable} q
 * @param {{ to: string, subject: string, body: string, linkUrl?: string | null }} email
 */
export async function insert(q, { to, subject, body, linkUrl = null }) {
  const { rows } = await q.query(
    `INSERT INTO email_outbox (to_address, subject, body_text, link_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [to, subject, body, linkUrl],
  );
  return toEmail(rows[0]);
}

/**
 * Marca el resultado de la entrega. `sent_at` solo se escribe cuando de verdad salió: un correo
 * simulado no tiene fecha de envío, y fingirla sería mentir en la bandeja.
 * @param {Queryable} q
 * @param {number} id
 * @param {{ status: 'sent' | 'simulated', providerId?: string | null }} result
 */
export async function markDelivered(q, id, { status, providerId = null }) {
  await q.query(
    `UPDATE email_outbox
        SET status = $2,
            provider_id = $3,
            error = NULL,
            sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE NULL END
      WHERE id = $1`,
    [id, status, providerId],
  );
}

/**
 * Marca el fallo de entrega con su motivo, recortado: la columna es para diagnosticar, no para
 * guardar una traza entera.
 * @param {Queryable} q
 * @param {number} id
 * @param {string} message
 */
export async function markFailed(q, id, message) {
  await q.query(`UPDATE email_outbox SET status = 'failed', error = $2 WHERE id = $1`, [
    id,
    String(message).slice(0, 500),
  ]);
}

/** @param {Queryable} q */
export async function listRecent(q, limit = 30) {
  const { rows } = await q.query(`SELECT * FROM email_outbox ORDER BY id DESC LIMIT $1`, [limit]);
  return rows.map(toEmail);
}
