import { createDatabase } from '#src/db/database.js';
import { seedDemoData } from '#src/db/seed.js';

// La conexión de staging se recibe explícitamente. El .env de desarrollo puede apuntar a otra BD.
const { DATABASE_URL, SEED_PASSWORD } = process.env;
if (!DATABASE_URL || !SEED_PASSWORD) {
  console.error('Define DATABASE_URL de staging y SEED_PASSWORD para las nuevas cuentas de demo.');
  process.exit(1);
}

const db = createDatabase(DATABASE_URL);
try {
  const result = await seedDemoData(db, { password: SEED_PASSWORD, once: true });
  console.log(result ? 'Datos de prueba de staging cargados.' : 'La demo ya estaba cargada.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
