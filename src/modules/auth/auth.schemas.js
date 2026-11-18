import { z } from '#src/core/validation.js';
import { passwordProblem, PASSWORD_RULES } from '#src/public/js/lib/validators.js';

/**
 * Esquemas de entrada del módulo de acceso. Las mismas reglas se aplican en el navegador
 * (atributos HTML + src/public/js/forms.js); aquí se vuelven a verificar SIEMPRE.
 */

// En el login no se valida el formato del correo: uno mal escrito simplemente no coincide con
// ningún usuario y recibe el mismo mensaje genérico (no damos pistas sobre qué falló).
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo.').max(254),
  password: z.string().min(1, 'Escribe tu contraseña.').max(200),
});

const emailSchema = z
  .string({ error: 'Escribe tu correo.' })
  .trim()
  .toLowerCase()
  .min(1, 'Escribe tu correo.')
  .max(254, 'El correo no puede superar los 254 caracteres.')
  .pipe(z.email('Escribe un correo válido, por ejemplo ana@hotel.com.'));

const passwordSchema = z
  .string({ error: 'Escribe una contraseña.' })
  .max(
    PASSWORD_RULES.maxLength,
    `La contraseña no puede superar los ${PASSWORD_RULES.maxLength} caracteres.`,
  )
  .superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

export const FULL_NAME_PATTERN = "^[\\p{L}][\\p{L}' .\\-]*$";

const fullNameSchema = z
  .string({ error: 'Escribe tu nombre y apellido.' })
  .trim()
  .transform((value) => value.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(5, 'Escribe tu nombre y apellido (al menos 5 caracteres).')
      .max(120, 'El nombre no puede superar los 120 caracteres.')
      .regex(new RegExp(FULL_NAME_PATTERN, 'u'), 'Usa solo letras, espacios, apóstrofos o guiones.')
      .refine((value) => value.split(' ').length >= 2, 'Escribe tu nombre y tu apellido.'),
  );

/** La confirmación debe coincidir; se revisa aunque haya otros errores (todos de una vez). */
const passwordsMatch = (data) =>
  typeof data.passwordConfirm !== 'string' ||
  data.passwordConfirm === '' ||
  data.password === data.passwordConfirm;
const PASSWORDS_MATCH_OPTIONS = {
  path: ['passwordConfirm'],
  message: 'Las contraseñas no coinciden.',
  when: () => true,
};

/** HU-39 · Registro. */
export const signupSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string({ error: 'Repite la contraseña.' }).min(1, 'Repite la contraseña.'),
  })
  .refine(passwordsMatch, PASSWORDS_MATCH_OPTIONS);

/** HU-40 · Pedir el enlace de recuperación. */
export const forgotPasswordSchema = z.object({ email: emailSchema });

/** HU-40 · Elegir la nueva contraseña. */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string({ error: 'Repite la contraseña.' }).min(1, 'Repite la contraseña.'),
  })
  .refine(passwordsMatch, PASSWORDS_MATCH_OPTIONS);

/** Token del enlace de recuperación: 32 bytes en base64url (43 caracteres). */
export const resetTokenSchema = z.string().regex(/^[\w-]{43}$/);
