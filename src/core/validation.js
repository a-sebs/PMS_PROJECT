import { z } from 'zod';
import { ValidationError } from './errors.js';

// Mensajes de validación de zod en español por defecto.
z.config(z.locales.es());

/**
 * Valida `input` con un esquema de zod y devuelve los datos ya transformados.
 * Si no es válido lanza ValidationError (422) con el detalle por campo.
 *
 * @template T
 * @param {z.ZodType<T>} schema
 * @param {unknown} input
 * @returns {T}
 */
export function parseInput(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const { fieldErrors, formErrors } = z.flattenError(result.error);
  const firstMessage = result.error.issues[0]?.message ?? 'Los datos enviados no son válidos.';
  throw new ValidationError(firstMessage, { fieldErrors, formErrors });
}

export { z };
