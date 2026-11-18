/**
 * Medición simple del rendimiento de la búsqueda de huéspedes (requisito de la guía: paginación,
 * índices en los campos de búsqueda y al menos una medición).
 *
 *   npm run perf:guests             → mide con 20 000 huéspedes sintéticos
 *   npm run perf:guests -- 100000   → con la cantidad que indiques
 *
 * No deja rastro: inserta los datos dentro de una transacción y al final hace ROLLBACK.
 * Cada consulta se mide 5 veces con EXPLAIN ANALYZE (se informa la mediana) con los índices
 * habilitados y luego obligando a PostgreSQL a recorrer toda la tabla, para comparar.
 */
import { loadConfig } from '#src/config/env.js';
import { createDatabase } from '#src/db/database.js';

const total = Number.parseInt(process.argv[2] ?? '20000', 10);
if (!Number.isSafeInteger(total) || total < 1000 || total > 1_000_000) {
  console.error('Indica una cantidad entre 1000 y 1000000.');
  process.exit(1);
}

const config = loadConfig();
if (config.isProduction) {
  console.error('Por seguridad, la medición no corre en producción.');
  process.exit(1);
}

// Las mismas consultas que src/modules/guests/guests.repository.js.
const SEARCH = `translate(lower($1), 'áéíóúüñ', 'aeiouun')`;
const QUERIES = [
  {
    name: 'Buscar "zambr" (contar coincidencias)',
    sql: `SELECT count(*) FROM guests g WHERE g.search_text LIKE ${SEARCH}`,
    params: ['%zambr%'],
  },
  {
    name: 'Buscar "zambr", página 1 (versión inicial)',
    sql: `SELECT g.*, u.full_name FROM guests g LEFT JOIN users u ON u.id = g.created_by
           WHERE g.search_text LIKE ${SEARCH}
           ORDER BY g.last_name, g.first_name, g.id LIMIT 10 OFFSET 0`,
    params: ['%zambr%'],
  },
  {
    name: 'Buscar "zambr", página 1 (versión final: filtrar y luego ordenar)',
    sql: `SELECT g.*, u.full_name
            FROM (WITH matches AS MATERIALIZED (
                    SELECT * FROM guests g WHERE g.search_text LIKE ${SEARCH}
                  ) SELECT * FROM matches) g
            LEFT JOIN users u ON u.id = g.created_by
           ORDER BY g.last_name, g.first_name, g.id LIMIT 10 OFFSET 0`,
    params: ['%zambr%'],
  },
  {
    name: 'Buscar por documento exacto',
    sql: `SELECT count(*) FROM guests g WHERE g.search_text LIKE ${SEARCH}`,
    params: ['%perf00012345%'],
  },
  {
    name: 'Filtrar por nacionalidad (CO, página 1)',
    sql: `SELECT g.* FROM guests g WHERE g.nationality = $1
           ORDER BY g.last_name, g.first_name, g.id LIMIT 10 OFFSET 0`,
    params: ['CO'],
  },
  {
    name: 'Listado sin filtros (página 1)',
    sql: `SELECT g.* FROM guests g ORDER BY g.last_name, g.first_name, g.id LIMIT 10 OFFSET 0`,
    params: [],
  },
];

/** Mediana del tiempo de ejecución (ms) de EXPLAIN ANALYZE y el tipo de recorrido principal. */
async function measure(client, { sql, params }) {
  const times = [];
  let scan = '';
  for (let i = 0; i < 5; i += 1) {
    const { rows } = await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, params);
    const [result] = rows[0]['QUERY PLAN'];
    times.push(result['Execution Time']);
    scan = scanTypes(result.Plan).join(' + ');
  }
  times.sort((a, b) => a - b);
  return { ms: times[2], scan };
}

/** Nodos de la consulta que leen la tabla guests (Seq Scan, Bitmap Index Scan, Index Scan…). */
function scanTypes(node, found = []) {
  if (
    /Scan/.test(node['Node Type']) &&
    (node['Relation Name'] === 'guests' || node['Index Name']?.startsWith('guests'))
  ) {
    found.push(
      node['Index Name'] ? `${node['Node Type']} (${node['Index Name']})` : node['Node Type'],
    );
  }
  for (const child of node.Plans ?? []) scanTypes(child, found);
  return [...new Set(found)];
}

const db = createDatabase(config.databaseUrl, { max: 1 });
const client = await db.pool.connect();
try {
  await client.query('BEGIN');
  const started = performance.now();
  await client.query(
    `INSERT INTO guests (document_type, document_number, first_name, last_name, email, phone,
                         birth_date, nationality)
     SELECT 'passport',
            'PERF' || lpad(i::text, 8, '0'),
            (ARRAY['Ana','Mateo','Camila','Santiago','Valentina','Sebastián','Lucía','Joaquín'])[1 + i % 8],
            (ARRAY['Salazar','Andrade','Paredes','Cárdenas','Mora','Zambrano','Núñez','León',
                   'Chávez','Espinoza','Guerrero','Ortiz','Benítez','Montalvo','Vásquez','Pazmiño'])[1 + (i / 8) % 16]
              || ' ' || (ARRAY['Torres','Rivera','Gómez','Silva','Rojas'])[1 + i % 5],
            'perf' || i || '@correo.test',
            '+5939' || lpad((10000000 + i)::text, 8, '0'),
            DATE '1950-01-01' + (i % 18000),
            (ARRAY['EC','EC','EC','CO','PE','US','ES','AR'])[1 + i % 8]
       FROM generate_series(1, $1) AS i`,
    [total],
  );
  // Lo insertado va primero a la "lista pendiente" del índice GIN; se integra al índice como lo
  // haría el autovacuum, y se actualizan las estadísticas del planificador.
  await client.query(`SELECT gin_clean_pending_list('guests_search_text_trgm_idx')`);
  await client.query('ANALYZE guests');
  const insertSeconds = ((performance.now() - started) / 1000).toFixed(1);
  const { rows } = await client.query('SELECT count(*)::int AS n FROM guests');

  const results = [];
  for (const query of QUERIES)
    results.push({ name: query.name, withIndex: await measure(client, query) });

  // Mismo trabajo, pero prohibiendo los índices: así se ve cuánto aportan.
  await client.query('SET LOCAL enable_indexscan = off');
  await client.query('SET LOCAL enable_bitmapscan = off');
  await client.query('SET LOCAL enable_indexonlyscan = off');
  for (const [i, query] of QUERIES.entries())
    results[i].withoutIndex = await measure(client, query);

  console.log(
    `\nMedición con ${rows[0].n.toLocaleString('es')} huéspedes (inserción: ${insertSeconds} s)`,
  );
  console.log(`PostgreSQL ${(await client.query('SHOW server_version')).rows[0].server_version}\n`);
  console.log('| Consulta | Con índices | Sin índices | Plan con índices |');
  console.log('| --- | ---: | ---: | --- |');
  for (const r of results) {
    console.log(
      `| ${r.name} | ${r.withIndex.ms.toFixed(2)} ms | ${r.withoutIndex.ms.toFixed(2)} ms | ${r.withIndex.scan} |`,
    );
  }
} finally {
  await client.query('ROLLBACK').catch(() => {});
  client.release();
  await db.close();
}
