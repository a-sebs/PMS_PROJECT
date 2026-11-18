import { Router } from 'express';
import { requirePermission } from '#src/http/middlewares/auth.js';

/** @param {ReturnType<import('./chat.controller.js').createChatController>} controller */
export function createChatRouter(controller) {
  const router = Router();
  const canChat = requirePermission('chat.use');
  router.get('/chat', canChat, controller.index);
  router.get('/chat/:room', canChat, controller.show);
  router.post('/chat/:room/messages', canChat, controller.send);
  return router;
}
