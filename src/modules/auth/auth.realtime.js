import { ROLE_LABELS } from '#src/core/permissions.js';

/**
 * Reacciones en tiempo real a los cambios de cuentas (contrato en docs/03-diseno/tiempo-real.md).
 *
 * @param {{ events: ReturnType<import('#src/core/events.js').createEventBus>,
 *           realtime: import('#src/realtime/gateway.js').RealtimeGateway }} deps
 */
export function registerAuthRealtime({ events, realtime }) {
  // HU-39 · Aviso en vivo a los administradores: alguien nuevo tiene acceso a datos de huéspedes.
  events.subscribe('user.registered', ({ payload }) => {
    const { user } = payload;
    realtime.toRoles(['admin'], 'notify', {
      tone: 'info',
      message: `${user.fullName} creó una cuenta de ${ROLE_LABELS[user.role]}. Puedes cambiar su rol en Usuarios.`,
      href: '/users',
    });
  });

  // HU-03 · Desactivar expulsa al instante; cambiar el rol recarga las pestañas abiertas.
  events.subscribe('user.access_changed', ({ payload }) => {
    const { before, after } = payload;
    if (!after.isActive) realtime.endUserSessions(after.id, 'deactivated');
    else if (before.role !== after.role) realtime.refreshUser(after.id, 'role_changed');
  });

  // HU-40 · Tras restablecer la clave se cierran las sesiones abiertas en otros dispositivos.
  events.subscribe('user.password_reset', ({ payload }) => {
    realtime.endUserSessions(payload.userId, 'password_reset');
  });
}
