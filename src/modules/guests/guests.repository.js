/**
 * SQL de la tabla guests. Todas las consultas son parametrizadas ($1, $2…): los valores nunca se
 * concatenan al texto del SQL (OWASP A05: inyección).
 * @typedef {import('#src/db/database.js').Queryable} Queryable
 */

/**
 * @typedef {object} Guest
 * @property {number} id
 * @property {'cedula'|'passport'} documentType
 * @property {string} documentNumber
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 * @property {string} phone        E.164, por ejemplo +593991234567
 * @property {string} birthDate    AAAA-MM-DD
 * @property {string} nationality  ISO 3166-1 alfa-2
 * @property {string | null} notes
 * @property {number} version
 * @property {string | null} createdByName
 * @property {string} createdAt
 * @property {string} updatedAt
 */

const COLUMNS = `g.id, g.document_type, g.document_number, g.first_name, g.last_name, g.email,
  g.phone, g.birth_date, g.nationality, g.notes, g.version, g.created_at, g.updated_at,
  u.full_name AS created_by_name`;

/** @returns {Guest} */
function toGuest(row) {
  return {
    id: row.id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    birthDate: row.birth_date,
    nationality: row.nationality,
    notes: row.notes,
    version: row.version,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Escapa los comodines de LIKE (% y _) para buscar el texto tal como lo escribió la persona. */
const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Condiciones del listado. La búsqueda se normaliza igual que la columna generada search_text
 * (minúsculas y sin tildes) para que "garcia" encuentre "García", y usa el índice trigram.
 */
function filters({ q, nationality }) {
  const conditions = [];
  const params = [];
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    conditions.push(`g.search_text LIKE translate(lower($${params.length}), 'áéíóúüñ', 'aeiouun')`);
  }
  if (nationality) {
    params.push(nationality);
    conditions.push(`g.nationality = $${params.length}`);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

/**
 * @param {Queryable} q
 * @param {{ q?: string, nationality?: string, limit: number, offset: number }} options
 * @returns {Promise<{ guests: Guest[], total: number }>}
 */
export async function list(q, { q: search, nationality, limit, offset }) {
  const { where, params } = filters({ q: search, nationality });
  // Con búsqueda de texto se filtra PRIMERO (índice trigram) y luego se ordena lo encontrado.
  // Sin el MATERIALIZED, PostgreSQL recorría el índice por apellido y descartaba fila por fila:
  // con 200 000 huéspedes, buscar "zambr" tardaba 100 ms en lugar de unos pocos (ver
  // docs/05-pruebas/rendimiento.md).
  const source = search
    ? `(WITH matches AS MATERIALIZED (SELECT * FROM guests g ${where}) SELECT * FROM matches) g`
    : 'guests g';
  const pageWhere = search ? '' : where;
  const [count, page] = await Promise.all([
    q.query(`SELECT count(*)::int AS total FROM guests g ${where}`, params),
    q.query(
      `SELECT ${COLUMNS}
         FROM ${source}
         LEFT JOIN users u ON u.id = g.created_by
         ${pageWhere}
        ORDER BY g.last_name, g.first_name, g.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ]);
  return { guests: page.rows.map(toGuest), total: count.rows[0].total };
}

/**
 * @param {Queryable} q
 * @param {number} id
 * @returns {Promise<Guest | null>}
 */
export async function findById(q, id) {
  const { rows } = await q.query(
    `SELECT ${COLUMNS} FROM guests g LEFT JOIN users u ON u.id = g.created_by WHERE g.id = $1`,
    [id],
  );
  return rows[0] ? toGuest(rows[0]) : null;
}

/** Valores en el orden de las columnas de INSERT/UPDATE. */
const valuesOf = (g) => [
  g.documentType,
  g.documentNumber,
  g.firstName,
  g.lastName,
  g.email,
  g.phone,
  g.birthDate,
  g.nationality,
  g.notes,
];

/**
 * @param {Queryable} q
 * @param {Omit<Guest, 'id'|'version'|'createdByName'|'createdAt'|'updatedAt'>} guest
 * @param {number} createdBy
 * @returns {Promise<number>} id del huésped creado.
 */
export async function insert(q, guest, createdBy) {
  const { rows } = await q.query(
    `INSERT INTO guests (document_type, document_number, first_name, last_name, email, phone,
                         birth_date, nationality, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [...valuesOf(guest), createdBy],
  );
  return rows[0].id;
}

/**
 * Actualiza solo si nadie cambió el registro desde que se abrió el formulario (concurrencia
 * optimista con la columna version).
 * @param {Queryable} q
 * @returns {Promise<boolean>} false si la versión ya no coincide (o el huésped no existe).
 */
export async function update(q, id, expectedVersion, guest) {
  const { rowCount } = await q.query(
    `UPDATE guests
        SET document_type = $1, document_number = $2, first_name = $3, last_name = $4,
            email = $5, phone = $6, birth_date = $7, nationality = $8, notes = $9,
            version = version + 1
      WHERE id = $10 AND version = $11`,
    [...valuesOf(guest), id, expectedVersion],
  );
  return rowCount === 1;
}

/**
 * @param {Queryable} q
 * @returns {Promise<{ id: number, firstName: string, lastName: string } | null>}
 */
export async function remove(q, id) {
  const { rows } = await q.query(
    `DELETE FROM guests WHERE id = $1 RETURNING id, first_name, last_name`,
    [id],
  );
  return rows[0]
    ? { id: rows[0].id, firstName: rows[0].first_name, lastName: rows[0].last_name }
    : null;
}

/**
 * Id del huésped que ya usa un documento (para enlazarlo en el mensaje de duplicado).
 * @param {Queryable} q
 */
export async function findIdByDocument(q, documentType, documentNumber) {
  const { rows } = await q.query(
    `SELECT id FROM guests WHERE document_type = $1 AND document_number = $2`,
    [documentType, documentNumber],
  );
  return rows[0]?.id ?? null;
}
