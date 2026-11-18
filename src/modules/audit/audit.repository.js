/** @typedef {import('#src/db/database.js').Queryable} Queryable */

/**
 * @typedef {object} ActivityItem
 * @property {number} id
 * @property {string} occurredAt   Instante ISO 8601.
 * @property {number | null} actorId
 * @property {string} actorName
 * @property {string} action
 * @property {string} entityType
 * @property {string} entityId
 * @property {string} summary
 * @property {Record<string, unknown>} data
 */

/** @returns {ActivityItem} */
function toItem(row) {
  return {
    id: row.id,
    occurredAt: row.occurred_at.toISOString(),
    actorId: row.actor_id,
    actorName: row.actor_name ?? 'Sistema',
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    data: row.data,
  };
}

/**
 * @param {Queryable} q
 * @param {{ actorId: number | null, action: string, entityType: string, entityId: string | number,
 *           summary: string, data?: Record<string, unknown> }} entry
 * @returns {Promise<ActivityItem>}
 */
export async function insert(q, { actorId, action, entityType, entityId, summary, data = {} }) {
  const { rows } = await q.query(
    `WITH inserted AS (
       INSERT INTO audit_events (actor_id, action, entity_type, entity_id, summary, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *
     )
     SELECT inserted.*, u.full_name AS actor_name
       FROM inserted
       LEFT JOIN users u ON u.id = inserted.actor_id`,
    [actorId, action, entityType, String(entityId), summary, data],
  );
  return toItem(rows[0]);
}

/**
 * @param {Queryable} q
 * @param {number} limit
 * @returns {Promise<ActivityItem[]>}
 */
export async function listRecent(q, limit) {
  const { rows } = await q.query(
    `SELECT e.*, u.full_name AS actor_name
       FROM audit_events e
       LEFT JOIN users u ON u.id = e.actor_id
      ORDER BY e.id DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(toItem);
}
