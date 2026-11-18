/** @typedef {import('#src/db/database.js').Queryable} Queryable */

/**
 * @typedef {object} Room
 * @property {number} id
 * @property {string} number
 * @property {number} floor
 * @property {{ id: number, code: string, name: string }} roomType
 * @property {'vacant' | 'occupied'} occupancyStatus
 * @property {'dirty' | 'cleaning' | 'clean' | 'inspected'} housekeepingStatus
 * @property {boolean} isOutOfOrder
 * @property {string | null} outOfOrderReason
 * @property {string | null} outOfOrderSince  Instante ISO 8601.
 * @property {number} version
 * @property {string} updatedAt               Instante ISO 8601.
 * @property {string | null} updatedByName
 */

const SELECT_ROOM = `
  SELECT r.id, r.number, r.floor, r.occupancy_status, r.housekeeping_status,
         r.is_out_of_order, r.out_of_order_reason, r.out_of_order_since,
         r.version, r.updated_at,
         rt.id AS room_type_id, rt.code AS room_type_code, rt.name AS room_type_name,
         u.full_name AS updated_by_name
    FROM rooms r
    JOIN room_types rt ON rt.id = r.room_type_id
    LEFT JOIN users u ON u.id = r.updated_by`;

/** @returns {Room} */
function toRoom(row) {
  return {
    id: row.id,
    number: row.number,
    floor: row.floor,
    roomType: { id: row.room_type_id, code: row.room_type_code, name: row.room_type_name },
    occupancyStatus: row.occupancy_status,
    housekeepingStatus: row.housekeeping_status,
    isOutOfOrder: row.is_out_of_order,
    outOfOrderReason: row.out_of_order_reason,
    outOfOrderSince: row.out_of_order_since?.toISOString() ?? null,
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
    updatedByName: row.updated_by_name,
  };
}

/**
 * Habitaciones activas ordenadas por piso y número ("99" antes que "101").
 * @param {Queryable} q
 * @returns {Promise<Room[]>}
 */
export async function listActive(q) {
  const { rows } = await q.query(
    `${SELECT_ROOM}
      WHERE r.is_active
      ORDER BY r.floor, length(r.number), r.number`,
  );
  return rows.map(toRoom);
}

/**
 * @param {Queryable} q
 * @param {number} id
 * @returns {Promise<Room | null>}
 */
export async function findById(q, id) {
  const { rows } = await q.query(`${SELECT_ROOM} WHERE r.id = $1 AND r.is_active`, [id]);
  return rows[0] ? toRoom(rows[0]) : null;
}

/**
 * Lee la habitación y la bloquea hasta el fin de la transacción (`FOR UPDATE OF r`): otra
 * transacción que quiera cambiarla espera su turno. Solo tiene sentido dentro de una transacción.
 * @param {import('pg').PoolClient} client
 * @param {number} id
 */
export async function findByIdForUpdate(client, id) {
  const { rows } = await client.query(
    `${SELECT_ROOM} WHERE r.id = $1 AND r.is_active FOR UPDATE OF r`,
    [id],
  );
  return rows[0] ? toRoom(rows[0]) : null;
}

/**
 * @param {Queryable} q
 * @param {{ id: number, status: string, actorId: number }} change
 */
export async function updateHousekeepingStatus(q, { id, status, actorId }) {
  await q.query(
    `UPDATE rooms
        SET housekeeping_status = $2, updated_by = $3, version = version + 1
      WHERE id = $1`,
    [id, status, actorId],
  );
}

/**
 * @param {Queryable} q
 * @param {{ id: number, reason: string, actorId: number }} change
 */
export async function markOutOfOrder(q, { id, reason, actorId }) {
  await q.query(
    `UPDATE rooms
        SET is_out_of_order = true, out_of_order_reason = $2, out_of_order_since = now(),
            updated_by = $3, version = version + 1
      WHERE id = $1`,
    [id, reason, actorId],
  );
}

/**
 * @param {Queryable} q
 * @param {{ id: number, actorId: number }} change
 */
export async function releaseOutOfOrder(q, { id, actorId }) {
  await q.query(
    `UPDATE rooms
        SET is_out_of_order = false, out_of_order_reason = NULL, out_of_order_since = NULL,
            updated_by = $2, version = version + 1
      WHERE id = $1`,
    [id, actorId],
  );
}
