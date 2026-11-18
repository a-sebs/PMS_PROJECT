import { Router } from 'express';
import { requirePermission } from '#src/http/middlewares/auth.js';

/** @param {ReturnType<import('./dashboard.controller.js').createDashboardController>} controller */
export function createDashboardRouter(controller) {
  const router = Router();
  router.get('/dashboard', requirePermission('dashboard.view'), controller.show);
  return router;
}
