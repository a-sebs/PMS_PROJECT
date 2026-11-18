import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Hash de contraseñas con scrypt nativo. Ver docs/03-diseno/adr/0010-scrypt-para-contrasenas.md
 *
 * Formato: scrypt$N$r$p$<sal base64url>$<hash base64url>
 */

const scrypt = promisify(scryptCallback);

// Configuración equivalente recomendada por OWASP: N=2^15, r=8, p=3 (~32 MiB por cálculo).
export const CURRENT_PARAMS = Object.freeze({ N: 2 ** 15, r: 8, p: 3 });
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

/** Normaliza para que "é" escrito de dos formas Unicode distintas produzca el mismo hash. */
const normalize = (password) => String(password).normalize('NFKC');

/** @param {string} password */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const { N, r, p } = CURRENT_PARAMS;
  const key = await scrypt(normalize(password), salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

function parse(stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, N, r, p, salt, key] = parts;
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (!Object.values(params).every(Number.isSafeInteger)) return null;
  return { params, salt: Buffer.from(salt, 'base64url'), key: Buffer.from(key, 'base64url') };
}

/**
 * Compara en tiempo constante. Devuelve false (nunca lanza) si el hash guardado está mal formado.
 * @param {string} password
 * @param {string} stored
 */
export async function verifyPassword(password, stored) {
  const parsed = parse(stored);
  if (!parsed || parsed.key.length === 0) return false;
  const actual = await scrypt(normalize(password), parsed.salt, parsed.key.length, {
    ...parsed.params,
    maxmem: MAX_MEMORY,
  });
  return timingSafeEqual(parsed.key, actual);
}

/** ¿El hash se creó con parámetros distintos a los actuales? Entonces conviene recalcularlo. */
export function needsRehash(stored) {
  const parsed = parse(stored);
  if (!parsed) return true;
  const { N, r, p } = parsed.params;
  return N !== CURRENT_PARAMS.N || r !== CURRENT_PARAMS.r || p !== CURRENT_PARAMS.p;
}
