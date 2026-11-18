import { Router } from 'express';
import { requirePermission } from '#src/http/middlewares/auth.js';

/** @param {ReturnType<import('./users.controller.js').createUsersController>} controller */
export function createUsersRouter(controller) {
  const router = Router();
  const canManage = requirePermission('users.manage');
  router.get('/users', canManage, controller.index);
  router.post('/users/:id', canManage, controller.update);
  return router;
}
