/** @typedef {import('#src/db/database.js').Queryable} Queryable */

/**
 * @typedef {object} OutboxEmail
 * @property {number} id
 * @property {string} to
 * @property {string} subject
 * @property {string} body
 * @property {string | null} linkUrl
 * @property {string} createdAt  Instante ISO 8601.
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
  };
}

/**
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

/** @param {Queryable} q */
export async function listRecent(q, limit = 30) {
  const { rows } = await q.query(`SELECT * FROM email_outbox ORDER BY id DESC LIMIT $1`, [limit]);
  return rows.map(toEmail);
}
