import { can } from '#src/core/permissions.js';
import { summarize } from '../rooms/room-status.js';

/**
 * Lo más útil para cada rol al empezar el turno. El panel muestra primero esto y después el
 * resumen general del hotel.
 */
function focusFor(role, summary) {
  const { partition, byGroup, cleaningNow } = summary;
  switch (role) {
    case 'housekeeping':
      return {
        value: byGroup.dirty,
        text: byGroup.dirty === 1 ? 'habitación por limpiar' : 'habitaciones por limpiar',
        hint: cleaningNow > 0 ? `${cleaningNow} en limpieza ahora mismo.` : null,
        link: { href: '/rooms#filtro-dirty', label: 'Ver habitaciones por limpiar' },
      };
    case 'maintenance':
      return {
        value: partition.ooo,
        text:
          partition.ooo === 1 ? 'habitación fuera de servicio' : 'habitaciones fuera de servicio',
        hint: null,
        link: { href: '/rooms#filtro-ooo', label: 'Ver habitaciones bloqueadas' },
      };
    default:
      return {
        value: partition.ready,
        text:
          partition.ready === 1
            ? 'habitación lista para asignar'
            : 'habitaciones listas para asignar',
        hint: `Ocupación actual: ${Math.round(summary.occupancyRate * 100)} %.`,
        link: { href: '/rooms#filtro-ready', label: 'Ver habitaciones listas' },
      };
  }
}

/**
 * Accesos de la pantalla principal (la guía pide que dé acceso al CRUD y al chat). Solo aparecen
 * los que el rol puede usar.
 */
function shortcutsFor(user, { chatUnread, onlineCount }) {
  return [
    can(user, 'guests.view') && {
      href: '/guests',
      icon: 'guests',
      title: 'Huéspedes',
      text: 'Buscar, registrar y actualizar huéspedes.',
    },
    can(user, 'chat.use') && {
      href: '/chat',
      icon: 'chat',
      title: 'Chat del personal',
      text:
        chatUnread > 0
          ? `${chatUnread} ${chatUnread === 1 ? 'mensaje sin leer' : 'mensajes sin leer'} · ${onlineCount} en línea`
          : `${onlineCount} ${onlineCount === 1 ? 'persona en línea' : 'personas en línea'}`,
    },
    can(user, 'rooms.view') && {
      href: '/rooms',
      icon: 'key',
      title: 'Habitaciones',
      text: 'Tablero en vivo del estado de cada habitación.',
    },
    can(user, 'users.manage') && {
      href: '/users',
      icon: 'guests',
      title: 'Usuarios',
      text: 'Roles y acceso del personal.',
    },
  ].filter(Boolean);
}

/**
 * @param {{ roomsService: ReturnType<import('../rooms/rooms.service.js').createRoomsService>,
 *           presence: ReturnType<import('#src/realtime/presence.js').createPresence> }} deps
 */
export function createDashboardController({ roomsService, presence }) {
  return {
    async show(req, res) {
      const summary = summarize(await roomsService.listRooms());
      const { partition, total } = summary;

      // Segmentos de la barra de composición del hotel (se dibuja con SVG: sin estilos en línea).
      let offset = 0;
      const segments = [
        { id: 'ready', label: 'Listas', value: partition.ready },
        { id: 'dirty', label: 'Vacantes sucias', value: partition.vacantDirty },
        { id: 'occupied', label: 'Ocupadas', value: partition.occupied },
        { id: 'ooo', label: 'Fuera de servicio', value: partition.ooo },
      ].map((segment) => {
        const width = total > 0 ? (segment.value / total) * 100 : 0;
        const result = { ...segment, x: offset, width };
        offset += width;
        return result;
      });

      res.renderPage('dashboard/index', {
        title: 'Panel',
        firstName: req.user.fullName.split(' ')[0],
        focus: focusFor(req.user.role, summary),
        segments,
        compositionLabel: segments.map((s) => `${s.label}: ${s.value}`).join(', '),
        total,
        occupancyRate: summary.occupancyRate,
        shortcuts: shortcutsFor(req.user, {
          chatUnread: res.locals.chatUnread ?? 0,
          // Quien mira el panel está en línea aunque su socket aún no termine de conectarse.
          onlineCount: new Set([...presence.list().map((person) => person.id), req.user.id]).size,
        }),
        liveChannels: ['rooms'],
        liveRefresh: true,
      });
    },
  };
}
