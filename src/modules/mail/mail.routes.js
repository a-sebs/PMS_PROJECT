import { Router } from 'express';

/**
 * Bandeja de pruebas: muestra los correos simulados. Solo se monta si `config.showMailOutbox`
 * (por defecto, únicamente en desarrollo): contiene enlaces de recuperación de clave.
 *
 * @param {{ mailService: ReturnType<import('./mail.service.js').createMailService> }} deps
 */
export function createMailRouter({ mailService }) {
  const router = Router();

  router.get('/dev/correos', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.renderPage('mail/outbox', {
      title: 'Bandeja de pruebas',
      layout: req.user ? 'layouts/main' : 'layouts/auth',
      transportName: mailService.transportName,
      emails: await mailService.listOutbox(30),
    });
  });

  return router;
}
