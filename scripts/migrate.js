/**
 * Aplica las migraciones pendientes.
 *   npm run db:migrate            → aplica lo pendiente
 *   npm run db:reset              → BORRA todo, migra y carga datos de demostración (solo dev/test)
 */
import { loadConfig } from '#src/config/env.js';
import { createDatabase } from '#src/db/database.js';
import { migrate, resetSchema } from '#src/db/migrator.js';

const config = loadConfig();
const reset = process.argv.includes('--reset');

if (reset && config.isProduction) {
  console.error('db:reset está deshabilitado en producción.');
  process.exit(1);
}

const db = createDatabase(config.databaseUrl);
try {
  if (reset) {
    await resetSchema(db);
    console.log('⚠ esquema public recreado desde cero');
  }
  const applied = await migrate(db, { logger: { info: console.log } });
  console.log(
    applied.length ? `${applied.length} migración(es) aplicada(s).` : 'Base de datos al día.',
  );
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
