import { hashPassword } from '#src/modules/auth/password.js';
import { upsertUser } from '#src/modules/auth/users.repository.js';
import { DEMO_CHAT, DEMO_GUESTS, DEMO_USERS, ROOM_TYPES, ROOMS } from './seed-data.js';

/** @typedef {import('./database.js').Queryable} Queryable */

/** @param {Queryable} q */
export async function seedUsers(q, { passwordHash }) {
  for (const user of DEMO_USERS) {
    await upsertUser(q, { ...user, passwordHash });
  }
}

/** @param {Queryable} q */
export async function seedRoomTypes(q) {
  for (const type of ROOM_TYPES) {
    await q.query(
      `INSERT INTO room_types (code, name, base_rate_cents, max_occupancy)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             base_rate_cents = EXCLUDED.base_rate_cents,
             max_occupancy = EXCLUDED.max_occupancy`,
      [type.code, type.name, type.baseRateCents, type.maxOccupancy],
    );
  }
}

/**
 * Inserta las habitaciones de demostración. Las existentes NO se sobrescriben, para no borrar los
 * cambios hechos durante una demo al volver a ejecutar el seed.
 * @param {Queryable} q
 */
export async function seedRooms(q) {
  for (const room of ROOMS) {
    const outOfOrder = room.outOfOrderReason !== null;
    await q.query(
      `INSERT INTO rooms (number, floor, room_type_id, occupancy_status, housekeeping_status,
                          is_out_of_order, out_of_order_reason, out_of_order_since)
       SELECT $1, $2, rt.id, $4, $5, $6, $7, CASE WHEN $6 THEN now() END
         FROM room_types rt
        WHERE rt.code = $3
       ON CONFLICT (number) DO NOTHING`,
      [
        room.number,
        room.floor,
        room.typeCode,
        room.occupancyStatus,
        room.housekeepingStatus,
        outOfOrder,
        room.outOfOrderReason,
      ],
    );
  }
}

/**
 * Inserta los huéspedes de demostración que aún no existan (por documento).
 * @param {Queryable} q
 */
export async function seedGuests(q) {
  for (const g of DEMO_GUESTS) {
    await q.query(
      `INSERT INTO guests (document_type, document_number, first_name, last_name, email, phone,
                           birth_date, nationality, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               (SELECT id FROM users WHERE email = 'recepcion@aurora.test'))
       ON CONFLICT (document_type, document_number) DO NOTHING`,
      [
        g.documentType,
        g.documentNumber,
        g.firstName,
        g.lastName,
        g.email,
        g.phone,
        g.birthDate,
        g.nationality,
        g.notes,
      ],
    );
  }
}

/**
 * Conversación de ejemplo, solo si el chat está vacío (no duplica mensajes al repetir el seed).
 * @param {Queryable} q
 */
export async function seedChat(q) {
  const { rows } = await q.query('SELECT 1 FROM chat_messages LIMIT 1');
  if (rows.length > 0) return;
  for (const message of DEMO_CHAT) {
    await q.query(
      `INSERT INTO chat_messages (room, author_id, body)
       SELECT $1, id, $3 FROM users WHERE email = $2`,
      [message.room, message.email, message.body],
    );
  }
}

/**
 * Carga todos los datos de demostración en una sola transacción (idempotente).
 * @param {ReturnType<import('./database.js').createDatabase>} db
 * @param {{ password: string, chat?: boolean }} options `chat: false` en las pruebas, para que
 *   los conteos de mensajes sin leer empiecen en cero.
 */
export async function seedDemoData(db, { password, chat = true }) {
  // Todos los usuarios de demostración comparten contraseña: basta con un hash.
  const passwordHash = await hashPassword(password);
  await db.transaction(async (client) => {
    await seedUsers(client, { passwordHash });
    await seedRoomTypes(client);
    await seedRooms(client);
    await seedGuests(client);
    if (chat) await seedChat(client);
  });
  return {
    users: DEMO_USERS.length,
    roomTypes: ROOM_TYPES.length,
    rooms: ROOMS.length,
    guests: DEMO_GUESTS.length,
  };
}
