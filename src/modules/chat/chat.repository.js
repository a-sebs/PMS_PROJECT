/**
 * SQL del chat: mensajes (chat_messages) y lectura por usuario (chat_reads).
 * @typedef {import('#src/db/database.js').Queryable} Queryable
 */

/**
 * @typedef {object} ChatMessage
 * @property {number} id
 * @property {string} room
 * @property {string} body
 * @property {string} createdAt  Instante ISO 8601.
 * @property {{ id: number, name: string, role: string }} author
 */

/** @returns {ChatMessage} */
function toMessage(row) {
  return {
    id: row.id,
    room: row.room,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    author: { id: row.author_id, name: row.author_name, role: row.author_role },
  };
}

const SELECT_MESSAGES = `
  SELECT m.id, m.room, m.body, m.created_at, m.author_id,
         u.full_name AS author_name, u.role AS author_role
    FROM chat_messages m
    JOIN users u ON u.id = m.author_id`;

/**
 * @param {Queryable} q
 * @param {{ room: string, authorId: number, body: string }} message
 * @returns {Promise<ChatMessage>}
 */
export async function insert(q, { room, authorId, body }) {
  const { rows } = await q.query(
    `WITH inserted AS (
       INSERT INTO chat_messages (room, author_id, body) VALUES ($1, $2, $3) RETURNING *
     )
     SELECT i.id, i.room, i.body, i.created_at, i.author_id,
            u.full_name AS author_name, u.role AS author_role
       FROM inserted i
       JOIN users u ON u.id = i.author_id`,
    [room, authorId, body],
  );
  return toMessage(rows[0]);
}

/**
 * Los `limit` mensajes más recientes de una sala (o anteriores a `beforeId`), del más viejo al
 * más nuevo, listos para mostrarse en orden.
 * @param {Queryable} q
 * @returns {Promise<ChatMessage[]>}
 */
export async function listRecent(q, room, limit, beforeId = null) {
  const { rows } = await q.query(
    `${SELECT_MESSAGES}
      WHERE m.room = $1 AND ($2::bigint IS NULL OR m.id < $2)
      ORDER BY m.id DESC
      LIMIT $3`,
    [room, beforeId, limit],
  );
  return rows.map(toMessage).reverse();
}

/**
 * Mensajes posteriores a `afterId` (para ponerse al día tras una reconexión).
 * @param {Queryable} q
 * @returns {Promise<ChatMessage[]>}
 */
export async function listAfter(q, room, afterId, limit) {
  const { rows } = await q.query(
    `${SELECT_MESSAGES}
      WHERE m.room = $1 AND m.id > $2
      ORDER BY m.id
      LIMIT $3`,
    [room, afterId, limit],
  );
  return rows.map(toMessage);
}

/** @param {Queryable} q */
export async function latestId(q, room) {
  const { rows } = await q.query(
    `SELECT coalesce(max(id), 0)::bigint AS id FROM chat_messages WHERE room = $1`,
    [room],
  );
  return rows[0].id;
}

/**
 * Avanza la marca de lectura (nunca la retrocede).
 * @param {Queryable} q
 */
export async function markRead(q, userId, room, messageId) {
  await q.query(
    `INSERT INTO chat_reads (user_id, room, last_read_message_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, room) DO UPDATE
       SET last_read_message_id = GREATEST(chat_reads.last_read_message_id, EXCLUDED.last_read_message_id)`,
    [userId, room, messageId],
  );
}

/**
 * Mensajes sin leer por sala (sin contar los propios).
 * @param {Queryable} q
 * @param {number} userId
 * @param {string[]} rooms
 * @returns {Promise<Record<string, number>>}
 */
export async function unreadCounts(q, userId, rooms) {
  const { rows } = await q.query(
    `SELECT r.room, count(m.id)::int AS unread
       FROM unnest($2::text[]) AS r(room)
       LEFT JOIN chat_reads cr ON cr.user_id = $1 AND cr.room = r.room
       LEFT JOIN chat_messages m
              ON m.room = r.room
             AND m.id > coalesce(cr.last_read_message_id, 0)
             AND m.author_id <> $1
      GROUP BY r.room`,
    [userId, rooms],
  );
  return Object.fromEntries(rows.map((row) => [row.room, row.unread]));
}
