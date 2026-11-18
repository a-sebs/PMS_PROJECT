/**
 * Control de acceso basado en PERMISOS (no en roles sueltos).
 *
 * Las rutas y canales preguntan "¿puede ver habitaciones?" (`rooms.view`), no "¿es recepcionista?".
 * Así, cambiar qué puede hacer un rol es editar esta tabla, no buscar `if (role === …)` por todo
 * el código.
 */

export const ROLES = Object.freeze(['admin', 'front_desk', 'housekeeping', 'maintenance']);

export const ROLE_LABELS = Object.freeze({
  admin: 'Administración',
  front_desk: 'Recepción',
  housekeeping: 'Limpieza',
  maintenance: 'Mantenimiento',
});

const ALL_STAFF = ROLES;

/** @type {Readonly<Record<string, readonly string[]>>} */
export const PERMISSIONS = Object.freeze({
  'dashboard.view': ALL_STAFF,
  'rooms.view': ALL_STAFF,
  'rooms.manage': ['admin'],
  'rooms.out_of_order': ['admin', 'maintenance'],
  'activity.view': ['admin', 'front_desk'],
  // Datos personales de huéspedes: solo quienes atienden la recepción.
  'guests.view': ['admin', 'front_desk'],
  'guests.manage': ['admin', 'front_desk'],
  'users.manage': ['admin'],
  // Qué salas del chat ve cada rol se define en src/modules/chat/chat-rooms.js.
  'chat.use': ALL_STAFF,
});

/** Rol que recibe quien crea su propia cuenta (HU-39). Un administrador puede cambiarlo. */
export const SIGNUP_ROLE = 'front_desk';

/**
 * @param {{ role: string } | null | undefined} user
 * @param {string} permission
 */
export function can(user, permission) {
  if (!user) return false;
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Permiso desconocido: ${permission}`);
  return allowed.includes(user.role);
}
