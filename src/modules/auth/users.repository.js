/**
 * Acceso a la tabla users. Cada función recibe `q`: el pool o el cliente de una transacción.
 * @typedef {import('#src/db/database.js').Queryable} Queryable
 */

/**
 * @typedef {object} User
 * @property {number} id
 * @property {string} email
 * @property {string} fullName
 * @property {'admin'|'front_desk'|'housekeeping'|'maintenance'} role
 * @property {boolean} isActive
 */

/** @returns {User} */
function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
  };
}

/**
 * @typedef {User & { createdAt: string, lastLoginAt: string | null }} UserSummary
 */

/** @returns {UserSummary} */
function toUserSummary(row) {
  return {
    ...toUser(row),
    createdAt: row.created_at.toISOString(),
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
  };
}

/**
 * @param {Queryable} q
 * @param {string} email
 * @returns {Promise<(User & { passwordHash: string }) | null>}
 */
export async function findByEmailWithHash(q, email) {
  const { rows } = await q.query(
    `SELECT id, email, full_name, role, is_active, password_hash
       FROM users
      WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ? { ...toUser(rows[0]), passwordHash: rows[0].password_hash } : null;
}

/**
 * @param {Queryable} q
 * @param {number} id
 * @returns {Promise<User | null>}
 */
export async function findActiveById(q, id) {
  const { rows } = await q.query(
    `SELECT id, email, full_name, role, is_active
       FROM users
      WHERE id = $1 AND is_active`,
    [id],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/** @param {Queryable} q */
export async function recordLogin(q, id, newPasswordHash = null) {
  await q.query(
    `UPDATE users
        SET last_login_at = now(),
            password_hash = COALESCE($2, password_hash)
      WHERE id = $1`,
    [id, newPasswordHash],
  );
}

/**
 * Crea o actualiza un usuario por correo (usado por los datos de demostración).
 * @param {Queryable} q
 * @param {{ email: string, fullName: string, role: string, passwordHash: string }} user
 */
export async function upsertUser(q, { email, fullName, role, passwordHash }) {
  const { rows } = await q.query(
    `INSERT INTO users (email, full_name, role, password_hash)
     VALUES (lower($1), $2, $3, $4)
     ON CONFLICT (lower(email)) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           role = EXCLUDED.role,
           password_hash = EXCLUDED.password_hash,
           is_active = true
     RETURNING id, email, full_name, role, is_active`,
    [email, fullName, role, passwordHash],
  );
  return toUser(rows[0]);
}

/**
 * Crea un usuario. Si el correo ya existe, PostgreSQL lanza el error 23505 (unique_violation)
 * por el índice users_email_lower_key: el servicio lo traduce a un mensaje claro.
 * @param {Queryable} q
 * @param {{ email: string, fullName: string, role: string, passwordHash: string }} user
 * @returns {Promise<User>}
 */
export async function insertUser(q, { email, fullName, role, passwordHash }) {
  const { rows } = await q.query(
    `INSERT INTO users (email, full_name, role, password_hash)
     VALUES (lower($1), $2, $3, $4)
     RETURNING id, email, full_name, role, is_active`,
    [email, fullName, role, passwordHash],
  );
  return toUser(rows[0]);
}

/**
 * @param {Queryable} q
 * @returns {Promise<UserSummary[]>}
 */
export async function listUsers(q) {
  const { rows } = await q.query(
    `SELECT id, email, full_name, role, is_active, created_at, last_login_at
       FROM users
      ORDER BY is_active DESC, full_name, id`,
  );
  return rows.map(toUserSummary);
}

/**
 * Bloquea la fila del usuario hasta el final de la transacción.
 * @param {Queryable} q
 * @param {number} id
 * @returns {Promise<User | null>}
 */
export async function lockById(q, id) {
  const { rows } = await q.query(
    `SELECT id, email, full_name, role, is_active FROM users WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/** @param {Queryable} q */
export async function countActiveAdmins(q) {
  const { rows } = await q.query(
    `SELECT count(*)::int AS total FROM users WHERE role = 'admin' AND is_active`,
  );
  return rows[0].total;
}

/**
 * @param {Queryable} q
 * @param {number} id
 * @param {{ role: string, isActive: boolean }} access
 * @returns {Promise<User>}
 */
export async function updateAccess(q, id, { role, isActive }) {
  const { rows } = await q.query(
    `UPDATE users SET role = $2, is_active = $3
      WHERE id = $1
      RETURNING id, email, full_name, role, is_active`,
    [id, role, isActive],
  );
  return toUser(rows[0]);
}

/** @param {Queryable} q */
export async function updatePasswordHash(q, id, passwordHash) {
  await q.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [id, passwordHash]);
}

/**
 * Cierra todas las sesiones guardadas de un usuario (tabla de connect-pg-simple). Se usa al
 * restablecer la clave: quien tuviera la sesión robada la pierde.
 * @param {Queryable} q
 * @param {number} userId
 * @returns {Promise<number>} Cuántas sesiones se cerraron.
 */
export async function deleteSessionsOfUser(q, userId) {
  const { rowCount } = await q.query(`DELETE FROM user_sessions WHERE sess->>'userId' = $1`, [
    String(userId),
  ]);
  return rowCount;
}
