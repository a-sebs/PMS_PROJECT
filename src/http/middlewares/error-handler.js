import { AppError, NotFoundError } from '#src/core/errors.js';
import { backPath, wantsJson } from '../helpers.js';

/** Última ruta: nada coincidió. */
export function notFound(req, _res, next) {
  next(new NotFoundError('No encontramos la página que buscas.'));
}

const TITLES = {
  401: 'Inicia sesión',
  403: 'Acceso no permitido',
  404: 'Página no encontrada',
  409: 'Conflicto',
  422: 'Datos no válidos',
  429: 'Demasiadas solicitudes',
  500: 'Algo salió mal',
};

/**
 * Manejador central de errores (OWASP A10: manejo de condiciones excepcionales).
 *
 * - fetch → JSON `{ ok: false, error: { code, message, details? } }`.
 * - POST de formulario sin JS con error de negocio → mensaje flash y vuelta a la página anterior.
 * - Navegación normal → página de error con el layout adecuado.
 * - Los errores inesperados (5xx) se registran con su stack y nunca se muestran al usuario.
 *
 * @param {{ isProduction: boolean }} options
 */
export function errorHandler({ isProduction }) {
  // Express reconoce un manejador de errores por tener 4 parámetros.
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    const isKnown = err instanceof AppError;
    const status = isKnown ? err.status : (err.status ?? err.statusCode ?? 500);
    const isClientError = status >= 400 && status < 500;

    if (isClientError) {
      req.log?.warn({ code: err.code, status, msg: err.message }, 'petición rechazada');
    } else {
      req.log?.error({ err }, 'error no controlado');
    }

    if (res.headersSent) return;

    const message =
      isKnown || isClientError ? err.message : 'Ocurrió un error inesperado. Ya quedó registrado.';
    const error = {
      code: isKnown ? err.code : isClientError ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
      message,
    };
    if (isKnown && isClientError && err.details !== undefined) error.details = err.details;

    if (wantsJson(req)) {
      return res.status(status).json({ ok: false, error });
    }

    const isFormPost = req.method !== 'GET' && req.method !== 'HEAD';
    if (isFormPost && isClientError && status !== 401 && req.session && req.flash) {
      req.flash('error', message);
      return res.redirect(303, backPath(req));
    }

    if (typeof res.renderPage !== 'function') {
      return res.status(status).type('text').send(message);
    }

    res.status(status).renderPage('errors/error', {
      layout: req.user ? 'layouts/main' : 'layouts/auth',
      title: TITLES[status] ?? TITLES[500],
      status,
      message,
      stack: !isProduction && status >= 500 ? err.stack : null,
    });
  };
}
