/**
 * Carga los datos de demostración (usuarios, tipos de habitación y habitaciones).
 * Es idempotente: se puede ejecutar varias veces sin duplicar nada.
 *   npm run db:seed
 */
import { loadConfig } from '#src/config/env.js';
import { createDatabase } from '#src/db/database.js';
import { seedDemoData } from '#src/db/seed.js';

const config = loadConfig();
if (config.isProduction && process.env.ALLOW_SEED_IN_PRODUCTION !== 'true') {
  console.error(
    'Por seguridad, db:seed no corre en producción (ALLOW_SEED_IN_PRODUCTION=true para forzarlo).',
  );
  process.exit(1);
}

const password = process.env.SEED_PASSWORD ?? 'Aurora2026!';
const db = createDatabase(config.databaseUrl);
try {
  const result = await seedDemoData(db, { password });
  console.log(
    `✔ ${result.users} usuarios, ${result.roomTypes} tipos de habitación, ${result.rooms} habitaciones y ${result.guests} huéspedes listos.`,
  );
  console.log('  Las cuentas de demostración se encuentran en src/db/seed-data.js.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
