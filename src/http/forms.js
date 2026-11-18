import { ValidationError } from '#src/core/errors.js';

/**
 * Utilidades para volver a mostrar un formulario con errores (patrón: validar en el servidor,
 * responder 422 con el mismo formulario, los valores escritos y un mensaje junto a cada campo).
 */

/**
 * Primer mensaje de cada campo de un ValidationError de zod: `{ email: 'Escribe un correo…' }`.
 * @param {unknown} err
 * @returns {Record<string, string>}
 */
export function fieldErrorsFrom(err) {
  if (!(err instanceof ValidationError)) return {};
  const fieldErrors = /** @type {any} */ (err.details)?.fieldErrors ?? {};
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .map(([field, messages]) => [field, Array.isArray(messages) ? messages[0] : undefined])
      .filter(([, message]) => Boolean(message)),
  );
}

/**
 * Copia segura de los valores enviados para volver a pintarlos (nunca las contraseñas).
 * @param {Record<string, unknown>} body
 * @param {string[]} fields
 */
export function pickValues(body, fields) {
  return Object.fromEntries(
    fields.map((field) => [field, typeof body?.[field] === 'string' ? body[field] : '']),
  );
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/**
 * Convierte un objeto en atributos HTML escapados, para las vistas:
 * `attrs({ required: true, maxlength: 60, pattern: '\\d{10}' })` → `required maxlength="60" …`.
 * Los NOMBRES de atributo los escribe el programador; solo los valores pueden venir de datos.
 * @param {Record<string, string | number | boolean | null | undefined>} [attributes]
 */
export function attrs(attributes = {}) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value !== null && value !== undefined)
    .map(([name, value]) => (value === true ? name : `${name}="${escapeHtml(value)}"`))
    .join(' ');
}
