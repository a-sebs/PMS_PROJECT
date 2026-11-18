import { defineStateMachine } from '#src/core/state-machine.js';

/**
 * Lógica pura del estado de una habitación (sin base de datos ni HTTP): fácil de probar.
 * Diseño: docs/03-diseno/maquinas-de-estado.md
 */

export const HOUSEKEEPING_STATUSES = Object.freeze(['dirty', 'cleaning', 'clean', 'inspected']);

/** Máquina de estados de limpieza: qué transiciones existen y qué roles pueden hacerlas. */
export const housekeepingMachine = defineStateMachine({
  name: 'room.housekeeping',
  states: {
    dirty: 'Sucia',
    cleaning: 'En limpieza',
    clean: 'Limpia',
    inspected: 'Inspeccionada',
  },
  transitions: [
    {
      from: 'dirty',
      to: 'cleaning',
      action: 'Iniciar limpieza',
      done: 'Limpieza iniciada',
      roles: ['housekeeping', 'admin'],
    },
    {
      from: 'cleaning',
      to: 'clean',
      action: 'Terminar limpieza',
      done: 'Limpieza terminada',
      roles: ['housekeeping', 'admin'],
    },
    {
      from: 'cleaning',
      to: 'dirty',
      action: 'Cancelar limpieza',
      done: 'Limpieza cancelada',
      roles: ['housekeeping', 'admin'],
    },
    {
      from: 'clean',
      to: 'inspected',
      action: 'Inspeccionar',
      done: 'Habitación inspeccionada',
      roles: ['admin'],
      // La inspección libera la habitación para la venta: solo tiene sentido si está vacante.
      guard: (room) =>
        room?.occupancyStatus === 'occupied'
          ? 'Solo se inspeccionan habitaciones vacantes, antes de asignarlas.'
          : null,
    },
    {
      from: 'clean',
      to: 'dirty',
      action: 'Marcar sucia',
      done: 'Marcada como sucia',
      roles: ['front_desk', 'admin'],
    },
    {
      from: 'inspected',
      to: 'dirty',
      action: 'Marcar sucia',
      done: 'Marcada como sucia',
      roles: ['front_desk', 'admin'],
    },
  ],
});

/**
 * Códigos de estado combinado usados en la industria hotelera.
 * - `tone`: familia visual (color + ícono) de la tarjeta.
 * - `groups`: filtros del tablero a los que pertenece (OD es "por limpiar" y "ocupada").
 */
export const STATUS_CODES = Object.freeze({
  OOO: { label: 'Fuera de servicio', tone: 'ooo', groups: ['ooo'], assignable: false },
  VI: { label: 'Vacante inspeccionada', tone: 'ready', groups: ['ready'], assignable: true },
  VC: { label: 'Vacante limpia', tone: 'ready', groups: ['ready'], assignable: true },
  VD: { label: 'Vacante sucia', tone: 'dirty', groups: ['dirty'], assignable: false },
  OC: { label: 'Ocupada limpia', tone: 'occupied', groups: ['occupied'], assignable: false },
  OD: { label: 'Ocupada sucia', tone: 'dirty', groups: ['dirty', 'occupied'], assignable: false },
});

/** Filtros del tablero, en el orden en que se muestran. */
export const STATUS_GROUPS = Object.freeze([
  { id: 'ready', label: 'Listas' },
  { id: 'dirty', label: 'Por limpiar' },
  { id: 'occupied', label: 'Ocupadas' },
  { id: 'ooo', label: 'Fuera de servicio' },
]);

/**
 * @param {{ occupancyStatus: 'vacant' | 'occupied', housekeepingStatus: string, isOutOfOrder: boolean }} room
 * @returns {keyof typeof STATUS_CODES}
 */
export function statusCode({ occupancyStatus, housekeepingStatus, isOutOfOrder }) {
  if (isOutOfOrder) return 'OOO';
  const isClean = housekeepingStatus === 'clean' || housekeepingStatus === 'inspected';
  if (occupancyStatus === 'occupied') return isClean ? 'OC' : 'OD';
  if (housekeepingStatus === 'inspected') return 'VI';
  return isClean ? 'VC' : 'VD';
}

/**
 * Resumen por filtro (con solapamiento: OD cuenta en "Por limpiar" y en "Ocupadas") y una
 * partición exacta para gráficos (cada habitación cae en una sola categoría).
 * @param {Array<Parameters<typeof statusCode>[0]>} rooms
 */
export function summarize(rooms) {
  const byGroup = Object.fromEntries(STATUS_GROUPS.map((g) => [g.id, 0]));
  const partition = { ready: 0, vacantDirty: 0, occupied: 0, ooo: 0 };
  let cleaningNow = 0;

  for (const room of rooms) {
    const code = statusCode(room);
    for (const group of STATUS_CODES[code].groups) byGroup[group] += 1;
    if (code === 'VI' || code === 'VC') partition.ready += 1;
    else if (code === 'VD') partition.vacantDirty += 1;
    else if (code === 'OC' || code === 'OD') partition.occupied += 1;
    else partition.ooo += 1;
    if (room.housekeepingStatus === 'cleaning') cleaningNow += 1;
  }

  const total = rooms.length;
  const sellable = total - partition.ooo;
  return {
    total,
    byGroup,
    partition,
    cleaningNow,
    occupancyRate: sellable > 0 ? partition.occupied / sellable : 0,
  };
}
