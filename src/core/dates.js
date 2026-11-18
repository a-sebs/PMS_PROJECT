/**
 * Fechas de calendario en la zona horaria del hotel. "Hoy" en Guayaquil puede ser "mañana" en UTC
 * después de las 19:00, así que nunca se usa `new Date().toISOString().slice(0, 10)`.
 */

/**
 * @param {string} timezone Zona IANA, por ejemplo "America/Guayaquil".
 * @param {Date} [now]
 * @returns {string} AAAA-MM-DD
 */
export function todayIn(timezone, now = new Date()) {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
