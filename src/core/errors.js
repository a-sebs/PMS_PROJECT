/**
 * Errores de aplicación con su código HTTP. Los servicios lanzan estos errores y el manejador
 * central (src/http/middlewares/error-handler.js) decide cómo responder según el tipo de petición.
 */
export class AppError extends Error {
  /**
   * @param {string} message Mensaje apto para mostrar al usuario.
   * @param {{ status?: number, code?: string, details?: unknown, cause?: unknown }} [options]
   */
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details, cause } = {}) {
    super(message, { cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Los datos enviados no son válidos.', details) {
    super(message, { status: 422, code: 'VALIDATION_ERROR', details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Inicia sesión para continuar.') {
    super(message, { status: 401, code: 'UNAUTHORIZED' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tienes permiso para realizar esta acción.', code = 'FORBIDDEN') {
    super(message, { status: 403, code });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'El recurso solicitado no existe.') {
    super(message, { status: 404, code: 'NOT_FOUND' });
  }
}

export class ConflictError extends AppError {
  /**
   * @param {string} message
   * @param {{ code?: string, details?: unknown }} [options] `details` puede llevar el estado
   *   actual de la entidad para que el controlador muestre la versión vigente.
   */
  constructor(message, { code = 'CONFLICT', details } = {}) {
    super(message, { status: 409, code, details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.') {
    super(message, { status: 429, code: 'RATE_LIMITED' });
  }
}
