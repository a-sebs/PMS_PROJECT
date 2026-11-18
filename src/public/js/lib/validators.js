/**
 * Reglas de validación compartidas por el navegador y el servidor.
 *
 * Este archivo no usa nada exclusivo de Node ni del navegador: el servidor lo importa desde los
 * esquemas de zod (`#src/public/js/lib/validators.js`) y el navegador lo carga como módulo ES.
 * Así la regla es una sola. El servidor NUNCA confía en que el navegador ya validó: vuelve a
 * aplicar estas mismas funciones.
 */

/**
 * Cédula de identidad ecuatoriana (persona natural): 10 dígitos, provincia 01-24 (o 30 para
 * ecuatorianos registrados en el exterior), tercer dígito menor que 6 y dígito verificador con el
 * algoritmo módulo 10 del Registro Civil.
 * @param {string} value
 */
export function isValidCedula(value) {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return false;
  if (Number(value[2]) >= 6) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let product = Number(value[i]) * (i % 2 === 0 ? 2 : 1);
    if (product > 9) product -= 9;
    sum += product;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(value[9]);
}

/** Pasaporte: de 5 a 20 letras o números (se compara en mayúsculas y sin espacios). */
export function isValidPassport(value) {
  return /^[A-Z0-9]{5,20}$/.test(value);
}

/** Quita espacios y pasa a mayúsculas un número de documento. */
export function normalizeDocument(value) {
  return String(value ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

/**
 * Convierte un teléfono escrito por una persona al formato internacional E.164.
 * - "+593 99 123 4567" o "00593991234567" → "+593991234567"
 * - Números locales de Ecuador: "099 123 4567" → "+593991234567"; "02 234 5678" → "+59322345678"
 * @param {string} value
 * @returns {string | null} null si no se reconoce como teléfono.
 */
export function normalizePhone(value) {
  const compact = String(value ?? '').replace(/[\s().-]/g, '');
  let e164 = null;
  if (/^\+\d+$/.test(compact)) e164 = compact;
  else if (/^00\d+$/.test(compact)) e164 = `+${compact.slice(2)}`;
  else if (/^0\d{8,9}$/.test(compact)) e164 = `+593${compact.slice(1)}`;
  return e164 && /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}

/**
 * Edad cumplida en una fecha de referencia. Ambas fechas en formato AAAA-MM-DD.
 * @param {string} birthDate
 * @param {string} onDate
 */
export function ageOn(birthDate, onDate) {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** ¿Es una fecha de calendario real con formato AAAA-MM-DD? (rechaza 2026-02-30). */
export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Fecha AAAA-MM-DD restando años a otra (29 de febrero → 28 de febrero si hace falta). */
export function shiftYears(isoDate, years) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = y + years;
  const lastDay = new Date(Date.UTC(target, m, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  return `${target}-${pad(m)}-${pad(Math.min(d, lastDay))}`;
}

/** Política de contraseñas: longitud, al menos una letra y al menos un número. */
export const PASSWORD_RULES = Object.freeze({ minLength: 10, maxLength: 128 });

/**
 * @param {string} password
 * @returns {string | null} El problema, o null si cumple la política.
 */
export function passwordProblem(password) {
  const value = String(password ?? '');
  if (value.length < PASSWORD_RULES.minLength)
    return `La contraseña debe tener al menos ${PASSWORD_RULES.minLength} caracteres.`;
  if (value.length > PASSWORD_RULES.maxLength)
    return `La contraseña no puede superar los ${PASSWORD_RULES.maxLength} caracteres.`;
  if (!/\p{L}/u.test(value)) return 'La contraseña debe incluir al menos una letra.';
  if (!/\d/.test(value)) return 'La contraseña debe incluir al menos un número.';
  return null;
}
