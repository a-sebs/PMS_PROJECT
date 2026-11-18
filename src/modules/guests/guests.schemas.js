import { COUNTRY_CODES } from '#src/core/countries.js';
import { z } from '#src/core/validation.js';
import {
  ageOn,
  isIsoDate,
  isValidCedula,
  isValidPassport,
  normalizeDocument,
  normalizePhone,
} from '#src/public/js/lib/validators.js';

/**
 * Validación de la entidad principal, el huésped (HU-41). Las mismas reglas están en el formulario
 * (atributos HTML + src/public/js/forms.js), pero aquí se aplican siempre.
 */

export const GUEST_MIN_AGE = 18;
export const GUEST_MAX_AGE = 120;
export const DOCUMENT_TYPES = Object.freeze({ cedula: 'Cédula', passport: 'Pasaporte' });
export const NOTES_MAX_LENGTH = 500;
export const PAGE_SIZES = Object.freeze([10, 25, 50]);

/** Letras de cualquier idioma, espacios, apóstrofos, puntos y guiones ("María-José O'Neil"). */
export const PERSON_NAME_PATTERN = "[\\p{L}][\\p{L}' .\\-]*";
const personNameRegex = new RegExp(`^${PERSON_NAME_PATTERN}$`, 'u');

const collapseSpaces = (value) => value.trim().replace(/\s+/g, ' ');

/** Formularios: un campo vacío equivale a "no enviado". */
const blankToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

function personName(label) {
  return z
    .string({ error: `Escribe ${label}.` })
    .transform(collapseSpaces)
    .pipe(
      z
        .string()
        .min(1, `Escribe ${label}.`)
        .min(2, `Escribe al menos 2 caracteres en ${label}.`)
        .max(60, `${label[0].toUpperCase()}${label.slice(1)} no pueden superar los 60 caracteres.`)
        .regex(personNameRegex, 'Usa solo letras, espacios, apóstrofos o guiones.'),
    );
}

/**
 * @param {{ today: string }} context Fecha de hoy (AAAA-MM-DD) en la zona horaria del hotel.
 */
export function guestSchema({ today }) {
  return z
    .object({
      documentType: z.enum(['cedula', 'passport'], { error: 'Elige el tipo de documento.' }),
      documentNumber: z
        .string({ error: 'Escribe el número de documento.' })
        .transform(normalizeDocument)
        .pipe(z.string().min(1, 'Escribe el número de documento.')),
      firstName: personName('los nombres'),
      lastName: personName('los apellidos'),
      email: z
        .string({ error: 'Escribe el correo del huésped.' })
        .trim()
        .toLowerCase()
        .min(1, 'Escribe el correo del huésped.')
        .max(254, 'El correo no puede superar los 254 caracteres.')
        .pipe(z.email('Escribe un correo válido, por ejemplo ana@correo.com.')),
      phone: z
        .string({ error: 'Escribe el teléfono.' })
        .trim()
        .min(1, 'Escribe el teléfono.')
        .max(25, 'El teléfono es demasiado largo.')
        .transform((value, ctx) => {
          const e164 = normalizePhone(value);
          if (!e164) {
            ctx.addIssue({
              code: 'custom',
              message: 'Escribe un teléfono válido, por ejemplo 0991234567 o +593 99 123 4567.',
            });
            return z.NEVER;
          }
          return e164;
        }),
      birthDate: z
        .string({ error: 'Escribe la fecha de nacimiento.' })
        .trim()
        .min(1, 'Escribe la fecha de nacimiento.')
        .refine(isIsoDate, 'Escribe una fecha válida.')
        .superRefine((value, ctx) => {
          if (!isIsoDate(value)) return;
          if (value > today) {
            ctx.addIssue({
              code: 'custom',
              message: 'La fecha de nacimiento no puede ser futura.',
            });
          } else if (ageOn(value, today) < GUEST_MIN_AGE) {
            ctx.addIssue({
              code: 'custom',
              message: `El huésped titular debe ser mayor de edad (${GUEST_MIN_AGE} años o más).`,
            });
          } else if (ageOn(value, today) > GUEST_MAX_AGE) {
            ctx.addIssue({ code: 'custom', message: 'Revisa el año de nacimiento.' });
          }
        }),
      nationality: z.enum(COUNTRY_CODES, { error: 'Elige la nacionalidad.' }),
      notes: z.preprocess(
        blankToUndefined,
        z
          .string()
          .trim()
          .max(NOTES_MAX_LENGTH, `Las notas no pueden superar los ${NOTES_MAX_LENGTH} caracteres.`)
          .optional()
          .transform((value) => value ?? null),
      ),
    })
    .superRefine(
      (data, ctx) => {
        // El formato del número depende del tipo de documento.
        const { documentType, documentNumber } = data;
        if (typeof documentNumber !== 'string' || documentNumber === '') return;
        const issue = (message) =>
          ctx.addIssue({ code: 'custom', path: ['documentNumber'], message });
        if (documentType === 'cedula') {
          if (!/^\d{10}$/.test(documentNumber)) issue('La cédula tiene 10 dígitos, sin guiones.');
          else if (!isValidCedula(documentNumber)) {
            issue('La cédula no es válida: revisa los dígitos.');
          }
        } else if (documentType === 'passport' && !isValidPassport(documentNumber)) {
          issue('El pasaporte debe tener de 5 a 20 letras o números.');
        }
      },
      // Se evalúa aunque otros campos tengan errores: así la persona ve TODOS los problemas de una
      // vez y no en dos intentos.
      { when: () => true },
    );
}

export const versionSchema = z.object({
  version: z.coerce.number({ error: 'Falta la versión del registro.' }).int().positive(),
});

/** Filtros del listado: GET /guests?q=…&nationality=EC&page=2&perPage=25 */
export const guestListQuerySchema = z.object({
  // Una búsqueda absurdamente larga se recorta: no tiene sentido rechazar la página por eso.
  q: z
    .preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .transform((value) => value.slice(0, 100))
        .optional(),
    )
    .catch(undefined),
  nationality: z.preprocess(blankToUndefined, z.enum(COUNTRY_CODES).optional()).catch(undefined),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  perPage: z.coerce
    .number()
    .int()
    .refine((value) => PAGE_SIZES.includes(value))
    .catch(PAGE_SIZES[0]),
});

export const guestIdSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
