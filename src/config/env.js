import { existsSync } from 'node:fs';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const optionalBoolean = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true' || value === '1'));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria (ver .env.example)'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET debe tener al menos 32 caracteres'),
    APP_TIMEZONE: z.string().default('America/Guayaquil'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    TRUST_PROXY: booleanFromString,
    // Dirección pública de la aplicación. Los enlaces de los correos se arman con ella y NUNCA con
    // la cabecera Host de la petición (evita el envenenamiento de enlaces de recuperación).
    APP_URL: z
      .url({ protocol: /^https?$/, message: 'APP_URL debe ser una URL http(s)' })
      .optional(),
    // Muestra la bandeja de correos simulados en /dev/correos. Por defecto, solo en desarrollo.
    SHOW_MAIL_OUTBOX: optionalBoolean,
    // Entrega de correos. 'outbox' los deja en la bandeja de pruebas; 'smtp' los envía de verdad.
    MAIL_TRANSPORT: z.enum(['outbox', 'smtp']).default('outbox'),
    MAIL_FROM: z.email('MAIL_FROM debe ser un correo válido').optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.SESSION_SECRET.startsWith('cambia-esto')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'En producción, SESSION_SECRET no puede ser el valor de ejemplo',
      });
    }
    if (env.NODE_ENV === 'production' && !env.APP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message: 'En producción, APP_URL es obligatoria (por ejemplo https://aurora.midominio.com)',
      });
    }
    // Con envío real, la aplicación no arranca si falta cómo autenticarse: es mejor fallar al
    // inicio que descubrirlo cuando alguien pide recuperar su clave.
    if (env.MAIL_TRANSPORT === 'smtp') {
      for (const key of ['MAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} es obligatoria cuando MAIL_TRANSPORT=smtp`,
          });
        }
      }
    }
  });

/**
 * Lee las variables de entorno, las valida y devuelve una configuración tipada e inmutable.
 * Si algo falta o es inválido, la aplicación no arranca: es mejor fallar al inicio que a mitad
 * de un turno (OWASP A02: Security Misconfiguration).
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function loadConfig(env = process.env) {
  if (env === process.env && existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const parsed = envSchema.safeParse({ ...env, APP_URL: env.APP_URL ?? env.RENDER_EXTERNAL_URL });
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida:\n${details}`);
  }

  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const defaultLogLevel = { production: 'info', development: 'debug', test: 'silent' }[e.NODE_ENV];

  return Object.freeze({
    env: e.NODE_ENV,
    isProduction,
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET,
    timezone: e.APP_TIMEZONE,
    logLevel: e.LOG_LEVEL ?? defaultLogLevel,
    trustProxy: e.TRUST_PROXY,
    appUrl: (e.APP_URL ?? `http://localhost:${e.PORT || 3000}`).replace(/\/+$/, ''),
    // La bandeja de pruebas muestra enlaces de recuperación: en producción no se expone nunca.
    showMailOutbox: !isProduction && (e.SHOW_MAIL_OUTBOX ?? e.NODE_ENV === 'development'),
    mailTransport: e.MAIL_TRANSPORT,
    mailFrom: e.MAIL_FROM ?? null,
    smtpHost: e.SMTP_HOST ?? null,
    smtpPort: e.SMTP_PORT,
    smtpUser: e.SMTP_USER ?? null,
    smtpPass: e.SMTP_PASS ?? null,
  });
}
