import { z } from '#src/core/validation.js';
import { HOUSEKEEPING_STATUSES } from './room-status.js';

const version = z.coerce
  .number({ error: 'Falta la versión de la habitación; recarga la página.' })
  .int()
  .min(1);

export const roomIdSchema = z.coerce.number().int().positive();

export const housekeepingCommandSchema = z.object({
  status: z.enum(HOUSEKEEPING_STATUSES, { error: 'Estado de limpieza desconocido.' }),
  version,
});

export const outOfOrderCommandSchema = z.discriminatedUnion(
  'action',
  [
    z.object({
      action: z.literal('block'),
      reason: z
        .string({ error: 'Escribe el motivo del bloqueo.' })
        .trim()
        .min(3, 'Escribe el motivo del bloqueo (mínimo 3 caracteres).')
        .max(200, 'El motivo no puede superar los 200 caracteres.'),
      version,
    }),
    z.object({ action: z.literal('release'), version }),
  ],
  { error: 'Acción desconocida: usa "block" o "release".' },
);
