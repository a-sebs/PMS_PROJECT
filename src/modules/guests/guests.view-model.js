import { countryName } from '#src/core/countries.js';
import { ageOn } from '#src/public/js/lib/validators.js';
import { DOCUMENT_TYPES } from './guests.schemas.js';

/**
 * Teléfono E.164 en un formato fácil de leer:
 * +593991234567 → "+593 99 123 4567" · +59322345678 → "+593 2 234 5678" · otros, sin cambios.
 * @param {string} e164
 */
export function formatPhone(e164) {
  const mobile = /^\+593(9\d)(\d{3})(\d{4})$/.exec(e164);
  if (mobile) return `+593 ${mobile[1]} ${mobile[2]} ${mobile[3]}`;
  const landline = /^\+593([2-7])(\d{3})(\d{4})$/.exec(e164);
  if (landline) return `+593 ${landline[1]} ${landline[2]} ${landline[3]}`;
  return e164;
}

/**
 * Datos ya calculados para las vistas (las vistas no contienen reglas de negocio).
 * @param {import('./guests.repository.js').Guest} guest
 * @param {string} today AAAA-MM-DD en la zona horaria del hotel.
 */
export function toGuestView(guest, today) {
  return {
    ...guest,
    fullName: `${guest.firstName} ${guest.lastName}`,
    documentLabel: DOCUMENT_TYPES[guest.documentType],
    phoneDisplay: formatPhone(guest.phone),
    nationalityName: countryName(guest.nationality),
    age: ageOn(guest.birthDate, today),
  };
}

/** Valores del formulario de edición a partir de un huésped guardado. */
export function toFormValues(guest) {
  return {
    documentType: guest.documentType,
    documentNumber: guest.documentNumber,
    firstName: guest.firstName,
    lastName: guest.lastName,
    email: guest.email,
    phone: formatPhone(guest.phone),
    birthDate: guest.birthDate,
    nationality: guest.nationality,
    notes: guest.notes ?? '',
    version: guest.version,
  };
}

export const EMPTY_FORM = Object.freeze({
  documentType: 'cedula',
  documentNumber: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  birthDate: '',
  nationality: 'EC',
  notes: '',
});

/** Números de página a mostrar: 1 … 4 5 [6] 7 8 … 20 (null = puntos suspensivos). */
export function pageWindow(page, totalPages, radius = 2) {
  const pages = [];
  for (let n = 1; n <= totalPages; n += 1) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= radius) pages.push(n);
    else if (pages.at(-1) !== null) pages.push(null);
  }
  return pages;
}
