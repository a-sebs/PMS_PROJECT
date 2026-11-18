import { Router } from 'express';
import { requirePermission } from '#src/http/middlewares/auth.js';

/**
 * Rutas del CRUD de huéspedes (HU-41). Los formularios HTML solo envían GET y POST, por eso
 * actualizar y eliminar usan POST (ver docs/03-diseno/rutas.md).
 * @param {ReturnType<import('./guests.controller.js').createGuestsController>} controller
 */
export function createGuestsRouter(controller) {
  const router = Router();
  const canView = requirePermission('guests.view');
  const canManage = requirePermission('guests.manage');

  router.get('/guests', canView, controller.index);
  router.get('/guests/new', canManage, controller.newForm);
  router.get('/guests/lookup', canView, controller.lookup);
  router.post('/guests', canManage, controller.create);
  router.get('/guests/:id', canView, controller.show);
  router.get('/guests/:id/edit', canManage, controller.editForm);
  router.post('/guests/:id', canManage, controller.update);
  router.get('/guests/:id/delete', canManage, controller.confirmDelete);
  router.post('/guests/:id/delete', canManage, controller.destroy);

  return router;
}
