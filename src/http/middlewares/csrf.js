import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ForbiddenError } from '#src/core/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function tokensMatch(sent, expected) {
  const a = Buffer.from(String(sent));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Protección CSRF con el patrón "synchronizer token":
 * - Cada sesión tiene un token aleatorio que se expone a las vistas como `csrfToken`.
 * - Los formularios lo envían en el campo `_csrf`; fetch, en la cabecera `X-CSRF-Token`.
 * - Cualquier método que no sea GET/HEAD/OPTIONS sin un token válido recibe 403.
 */
export function csrfProtection() {
  return (req, res, next) => {
    req.session.csrfToken ??= randomBytes(32).toString('base64url');
    res.locals.csrfToken = req.session.csrfToken;

    if (SAFE_METHODS.has(req.method)) return next();

    const sent = req.get('X-CSRF-Token') ?? req.body?._csrf;
    if (sent && tokensMatch(sent, req.session.csrfToken)) return next();

    throw new ForbiddenError(
      'La página caducó por seguridad. Recárgala e inténtalo de nuevo.',
      'CSRF_INVALID',
    );
  };
}
