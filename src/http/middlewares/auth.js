import { ForbiddenError, UnauthorizedError } from '#src/core/errors.js';
import { can } from '#src/core/permissions.js';
import { wantsJson } from '../helpers.js';

/**
 * Carga el usuario de la sesión en `req.user` y `res.locals.currentUser`.
 * Se consulta la base de datos en cada petición: si un administrador desactiva a alguien,
 * pierde el acceso en su siguiente clic, no cuando expire su sesión.
 *
 * @param {{ authService: { getActiveUser(id: number): Promise<object | null> } }} deps
 */
export function loadCurrentUser({ authService }) {
  return async (req, res, next) => {
    req.user = null;
    res.locals.currentUser = null;
    res.locals.can = (permission) => can(req.user, permission);

    const userId = req.session?.userId;
    if (userId) {
      const user = await authService.getActiveUser(userId);
      if (user) {
        req.user = user;
        res.locals.currentUser = user;
      } else {
        delete req.session.userId;
      }
    }
    next();
  };
}

/** Exige sesión. Sin sesión: 401 para fetch, redirección al login para navegación normal. */
export function requireAuth(req, res, next) {
  if (req.user) return next();
  if (wantsJson(req)) throw new UnauthorizedError();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  res.redirect(303, '/login');
}

/**
 * Exige sesión y un permiso concreto (ver src/core/permissions.js).
 * @param {string} permission
 */
export function requirePermission(permission) {
  return (req, res, next) =>
    requireAuth(req, res, () => {
      if (!can(req.user, permission)) throw new ForbiddenError();
      next();
    });
}
