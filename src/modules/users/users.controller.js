import { NotFoundError } from '#src/core/errors.js';
import { ROLE_LABELS, ROLES } from '#src/core/permissions.js';
import { parseInput, z } from '#src/core/validation.js';

const userIdSchema = z.coerce.number().int().positive();

// Un checkbox sin marcar no se envía: su ausencia significa "inactiva".
const accessSchema = z.object({
  role: z.enum(ROLES, { error: 'Elige un rol válido.' }),
  isActive: z
    .literal('on')
    .optional()
    .transform((value) => value === 'on'),
});

/**
 * HU-03 · Administración del personal: rol y estado de cada cuenta.
 * @param {{ authService: ReturnType<import('../auth/auth.service.js').createAuthService> }} deps
 */
export function createUsersController({ authService }) {
  return {
    async index(req, res) {
      const users = await authService.listUsers();
      res.renderPage('users/index', {
        title: 'Usuarios',
        users,
        roles: ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
      });
    },

    async update(req, res) {
      const parsedId = userIdSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new NotFoundError('La cuenta no existe.');
      const input = parseInput(accessSchema, req.body);
      const user = await authService.updateUserAccess({
        userId: parsedId.data,
        role: input.role,
        isActive: input.isActive,
        actor: req.user,
      });
      req.flash('success', `Se guardaron los cambios de ${user.fullName}.`);
      res.redirect(303, '/users');
    },
  };
}
