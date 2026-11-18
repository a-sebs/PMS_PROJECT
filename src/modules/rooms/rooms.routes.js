import { Router } from 'express';
import { requirePermission } from '#src/http/middlewares/auth.js';

/**
 * Rutas del módulo de habitaciones. Mapa completo: docs/03-diseno/rutas.md
 * @param {ReturnType<import('./rooms.controller.js').createRoomsController>} controller
 */
export function createRoomsRouter(controller) {
  const router = Router();
  const canView = requirePermission('rooms.view');

  router.get('/rooms', canView, controller.board);
  router.get('/rooms/:id/card', canView, controller.card);
  // El permiso fino de cada transición (qué rol puede qué) lo decide la máquina de estados.
  router.post('/rooms/:id/housekeeping', canView, controller.changeHousekeeping);
  router.post(
    '/rooms/:id/out-of-order',
    requirePermission('rooms.out_of_order'),
    controller.outOfOrder,
  );

  return router;
}
