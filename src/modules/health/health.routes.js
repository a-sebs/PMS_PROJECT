import { Router } from 'express';

/**
 * GET /health — para el balanceador o el PaaS: 200 si la app y la base de datos responden, 503 si no.
 * @param {{ db: { ping(): Promise<void> }, version: string }} deps
 */
export function createHealthRouter({ db, version }) {
  const router = Router();
  router.get('/health', async (_req, res) => {
    let database = 'ok';
    try {
      await db.ping();
    } catch {
      database = 'unavailable';
    }
    const healthy = database === 'ok';
    res
      .status(healthy ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({
        status: healthy ? 'ok' : 'degraded',
        database,
        version,
        uptime: Math.round(process.uptime()),
      });
  });
  return router;
}
