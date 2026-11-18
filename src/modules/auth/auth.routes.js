import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '#src/http/middlewares/auth.js';

const limiter = (options) =>
  rateLimit({ standardHeaders: 'draft-8', legacyHeaders: false, ...options });

/**
 * @param {ReturnType<import('./auth.controller.js').createAuthController>} controller
 */
export function createAuthRouter(controller) {
  const router = Router();

  // HU-01 · 10 intentos fallidos por IP cada 15 minutos. Los inicios exitosos no cuentan.
  const loginLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    handler: controller.tooManyAttempts,
  });

  // HU-39 · Evita la creación masiva de cuentas desde una misma conexión.
  const signupLimiter = limiter({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    skipFailedRequests: true,
    handler: controller.signupLimited,
  });

  // HU-40 · Evita usar el formulario para inundar de correos a alguien…
  const forgotLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    handler: controller.forgotPasswordLimited,
  });
  // …y probar tokens o claves en masa contra los enlaces de recuperación.
  const resetLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    handler: controller.resetPasswordLimited,
  });

  router.get('/login', controller.showLogin);
  router.post('/login', loginLimiter, controller.login);
  router.post('/logout', requireAuth, controller.logout);

  router.get('/signup', controller.showSignup);
  router.post('/signup', signupLimiter, controller.signup);

  router.get('/forgot-password', controller.showForgotPassword);
  router.post('/forgot-password', forgotLimiter, controller.forgotPassword);
  router.get('/reset-password/:token', controller.showResetPassword);
  router.post('/reset-password/:token', resetLimiter, controller.resetPassword);

  return router;
}
