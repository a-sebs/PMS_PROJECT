/**
 * Tokens de recuperación de clave (tabla password_reset_tokens). Se guarda el SHA-256 del token,
 * nunca el token en claro.
 * @typedef {import('#src/db/database.js').Queryable} Queryable
 */

/**
 * @typedef {object} ResetToken
 * @property {number} id
 * @property {number} userId
 * @property {string} email
 * @property {string} fullName
 * @property {string} expiresAt  Instante ISO 8601.
 */

/** @returns {ResetToken} */
function toToken(row) {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    expiresAt: row.expires_at.toISOString(),
  };
}

/**
 * @param {Queryable} q
 * @param {{ userId: number, tokenHash: Buffer, ttlMinutes: number }} token
 */
export async function insert(q, { userId, tokenHash, ttlMinutes }) {
  await q.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [userId, tokenHash, ttlMinutes],
  );
}

/**
 * Anula los tokens pendientes de un usuario: solo el enlace más reciente sirve.
 * @param {Queryable} q
 * @param {number} userId
 */
export async function invalidatePending(q, userId) {
  await q.query(
    `UPDATE password_reset_tokens SET used_at = now()
      WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
}

const VALID_TOKEN_QUERY = `
  SELECT t.id, t.user_id, t.expires_at, u.email, u.full_name
    FROM password_reset_tokens t
    JOIN users u ON u.id = t.user_id
   WHERE t.token_hash = $1
     AND t.used_at IS NULL
     AND t.expires_at > now()
     AND u.is_active`;

/**
 * Token vigente (sin usar, sin caducar y de un usuario activo), o null.
 * @param {Queryable} q
 * @param {Buffer} tokenHash
 * @returns {Promise<ResetToken | null>}
 */
export async function findValid(q, tokenHash) {
  const { rows } = await q.query(VALID_TOKEN_QUERY, [tokenHash]);
  return rows[0] ? toToken(rows[0]) : null;
}

/**
 * Igual que findValid, pero bloquea el token: dos envíos simultáneos del mismo enlace no pueden
 * usarlo dos veces.
 * @param {Queryable} q
 * @param {Buffer} tokenHash
 */
export async function findValidForUpdate(q, tokenHash) {
  const { rows } = await q.query(`${VALID_TOKEN_QUERY} FOR UPDATE OF t`, [tokenHash]);
  return rows[0] ? toToken(rows[0]) : null;
}

/** @param {Queryable} q */
export async function markUsed(q, id) {
  await q.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [id]);
}
