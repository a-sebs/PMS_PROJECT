/**
 * Datos de demostración: un hotel boutique pequeño de 3 pisos. Los usa `npm run db:seed`, las
 * pruebas y el panel de usuarios de demostración del login (solo en desarrollo).
 * Los correos usan el dominio reservado .test (RFC 2606): nunca llegarán a nadie real.
 */

export const DEMO_USERS = Object.freeze([
  { email: 'admin@aurora.test', fullName: 'Valeria Ortiz', role: 'admin' },
  { email: 'recepcion@aurora.test', fullName: 'Mateo Salazar', role: 'front_desk' },
  { email: 'limpieza@aurora.test', fullName: 'Lucía Andrade', role: 'housekeeping' },
  { email: 'limpieza2@aurora.test', fullName: 'Jorge Paredes', role: 'housekeeping' },
  { email: 'mantenimiento@aurora.test', fullName: 'Diego Cárdenas', role: 'maintenance' },
]);

export const ROOM_TYPES = Object.freeze([
  { code: 'SGL', name: 'Individual', baseRateCents: 5500, maxOccupancy: 1 },
  { code: 'DBL', name: 'Doble', baseRateCents: 8000, maxOccupancy: 2 },
  { code: 'TWN', name: 'Twin', baseRateCents: 8500, maxOccupancy: 2 },
  { code: 'SUI', name: 'Suite', baseRateCents: 14000, maxOccupancy: 4 },
]);

/**
 * Estados iniciales variados para que el tablero tenga de todo desde el primer arranque.
 * [número, piso, tipo, ocupación, limpieza, motivo de bloqueo]
 */
const ROWS = [
  ['101', 1, 'SGL', 'vacant', 'inspected'],
  ['102', 1, 'SGL', 'vacant', 'clean'],
  ['103', 1, 'DBL', 'occupied', 'clean'],
  ['104', 1, 'DBL', 'vacant', 'dirty'],
  ['105', 1, 'TWN', 'occupied', 'dirty'],
  ['106', 1, 'TWN', 'vacant', 'clean'],
  ['107', 1, 'DBL', 'vacant', 'dirty'],
  ['108', 1, 'DBL', 'vacant', 'clean', 'Fuga en el lavabo'],
  ['201', 2, 'DBL', 'occupied', 'clean'],
  ['202', 2, 'DBL', 'vacant', 'dirty'],
  ['203', 2, 'TWN', 'vacant', 'inspected'],
  ['204', 2, 'TWN', 'vacant', 'dirty'],
  ['205', 2, 'DBL', 'occupied', 'dirty'],
  ['206', 2, 'DBL', 'vacant', 'clean'],
  ['207', 2, 'SGL', 'occupied', 'clean'],
  ['208', 2, 'SGL', 'vacant', 'dirty'],
  ['301', 3, 'SUI', 'occupied', 'clean'],
  ['302', 3, 'SUI', 'vacant', 'inspected'],
  ['303', 3, 'DBL', 'vacant', 'dirty'],
  ['304', 3, 'DBL', 'occupied', 'dirty'],
  ['305', 3, 'TWN', 'vacant', 'clean'],
  ['306', 3, 'SUI', 'vacant', 'dirty', 'Aire acondicionado sin enfriar'],
];

export const ROOMS = Object.freeze(
  ROWS.map(([number, floor, typeCode, occupancyStatus, housekeepingStatus, outOfOrderReason]) => ({
    number,
    floor,
    typeCode,
    occupancyStatus,
    housekeepingStatus,
    outOfOrderReason: outOfOrderReason ?? null,
  })),
);

// ---------------------------------------------------------------------------------------------
// Huéspedes de demostración (HU-41): suficientes para ver la paginación y probar la búsqueda.
// Las cédulas se generan con dígito verificador válido; los correos usan el dominio reservado .test.
// ---------------------------------------------------------------------------------------------

/** Completa 9 dígitos con el dígito verificador módulo 10 de la cédula ecuatoriana. */
export function withCedulaCheckDigit(nineDigits) {
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let product = Number(nineDigits[i]) * (i % 2 === 0 ? 2 : 1);
    if (product > 9) product -= 9;
    sum += product;
  }
  return `${nineDigits}${(10 - (sum % 10)) % 10}`;
}

const FIRST_NAMES = [
  'Ana',
  'Mateo',
  'Camila',
  'Santiago',
  'Valentina',
  'Sebastián',
  'Isabella',
  'Nicolás',
  'Daniela',
  'Andrés',
  'María José',
  'Gabriel',
  'Lucía',
  'Joaquín',
  'Paula',
  'Martín',
  'Emilia',
  'Tomás',
  'Renata',
  'Diego',
  'Sofía',
  'Esteban',
  'Fernanda',
  'Julián',
];
const LAST_NAMES = [
  'Salazar',
  'Andrade',
  'Paredes',
  'Cárdenas',
  'Mora',
  'Vásquez',
  'Guerrero',
  'Pazmiño',
  'Ortiz',
  'Benítez',
  'Zambrano',
  'Núñez',
  'Chávez',
  'Espinoza',
  'León',
  'Montalvo',
  'Cevallos',
  'Jaramillo',
  'Proaño',
  'Villacís',
];
const FOREIGN = [
  { nationality: 'CO', phonePrefix: '+57300', passport: 'AV' },
  { nationality: 'PE', phonePrefix: '+51987', passport: 'PE' },
  { nationality: 'US', phonePrefix: '+1305', passport: 'US' },
  { nationality: 'ES', phonePrefix: '+34612', passport: 'ES' },
  { nationality: 'AR', phonePrefix: '+54911', passport: 'AR' },
  { nationality: 'MX', phonePrefix: '+52155', passport: 'MX' },
  { nationality: 'DE', phonePrefix: '+49151', passport: 'DE' },
  { nationality: 'CA', phonePrefix: '+1604', passport: 'CA' },
];
const NOTES = [
  'Prefiere habitación en piso alto.',
  'Alergia a los frutos secos.',
  'Llega en vuelo nocturno; pide check-in tardío.',
  'Cliente frecuente. Prefiere almohada firme.',
  null,
  null,
];

const ascii = (text) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.');

export const DEMO_GUESTS = Object.freeze(
  Array.from({ length: 48 }, (_, i) => {
    // Pasos coprimos con el tamaño de cada lista: 48 combinaciones distintas de nombre y apellidos.
    const firstName = FIRST_NAMES[(i * 5) % FIRST_NAMES.length];
    const first = (i * 7 + 3) % LAST_NAMES.length;
    let second = (i * 11 + 8) % LAST_NAMES.length;
    if (second === first) second = (second + 1) % LAST_NAMES.length;
    const lastName = `${LAST_NAMES[first]} ${LAST_NAMES[second]}`;
    const year = 1952 + ((i * 13) % 52);
    const month = String((i % 12) + 1).padStart(2, '0');
    const day = String(((i * 5) % 28) + 1).padStart(2, '0');
    const isLocal = i % 3 !== 2;
    const foreign = FOREIGN[i % FOREIGN.length];
    const serial = String(100000 + i * 7919).slice(-6);
    const province = String((i % 24) + 1).padStart(2, '0');
    return {
      documentType: isLocal ? 'cedula' : 'passport',
      documentNumber: isLocal
        ? withCedulaCheckDigit(`${province}${i % 6}${serial}`)
        : `${foreign.passport}${String(4000000 + i * 3571)}`,
      firstName,
      lastName,
      email: `${ascii(firstName)}.${ascii(lastName.split(' ')[0])}${i}@correo.test`,
      phone: isLocal
        ? `+5939${String(80000000 + i * 104729).slice(-8)}`
        : `${foreign.phonePrefix}${String(1000000 + i * 7331).slice(-7)}`,
      birthDate: `${year}-${month}-${day}`,
      nationality: isLocal ? 'EC' : foreign.nationality,
      notes: NOTES[i % NOTES.length],
    };
  }),
);

/** Conversación de ejemplo para que el chat no arranque vacío en una demo. */
export const DEMO_CHAT = Object.freeze([
  {
    room: 'general',
    email: 'admin@aurora.test',
    body: '¡Buen día, equipo! Hoy esperamos 6 llegadas.',
  },
  {
    room: 'general',
    email: 'recepcion@aurora.test',
    body: 'Anotado. La 301 pidió cuna para bebé.',
  },
  {
    room: 'limpieza',
    email: 'recepcion@aurora.test',
    body: '¿Me avisan cuando la 204 esté lista? Hay check-in a las 14:00.',
  },
  { room: 'limpieza', email: 'limpieza@aurora.test', body: 'Voy para la 204 ahora mismo.' },
  {
    room: 'mantenimiento',
    email: 'mantenimiento@aurora.test',
    body: 'La 306 sigue sin enfriar; mañana llega el repuesto del aire.',
  },
]);
