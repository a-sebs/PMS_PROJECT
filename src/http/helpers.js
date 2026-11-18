/**
 * Utilidades HTTP compartidas por controladores y middlewares.
 */

/**
 * ¿La petición viene de nuestro JavaScript (fetch) y espera JSON en lugar de una página?
 * El cliente envía `X-Requested-With: fetch` en todas sus llamadas (src/public/js/app.js).
 * @param {import('express').Request} req
 */
export function wantsJson(req) {
  return req.get('X-Requested-With') === 'fetch' || req.accepts(['html', 'json']) === 'json';
}

/**
 * Devuelve `candidate` solo si es una ruta interna segura ("/rooms?floor=2"); evita redirecciones
 * abiertas hacia otros sitios ("//evil.com", "https://…").
 * @param {unknown} candidate
 * @param {string} [fallback]
 */
export function safeLocalPath(candidate, fallback = '/dashboard') {
  if (typeof candidate !== 'string') return fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback;
  }
  return candidate;
}

/**
 * Ruta a la que volver después de un POST sin JavaScript: la página de origen si es de este sitio.
 * @param {import('express').Request} req
 * @param {string} [fallback]
 */
export function backPath(req, fallback = '/dashboard') {
  const referer = req.get('Referer');
  if (!referer) return fallback;
  try {
    const url = new URL(referer);
    if (url.host !== req.get('Host')) return fallback;
    return safeLocalPath(url.pathname + url.search, fallback);
  } catch {
    return fallback;
  }
}

/** Versiones con promesas de los métodos de express-session basados en callbacks. */
export const sessionOps = {
  regenerate: (req) =>
    new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    ),
  save: (req) =>
    new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve()))),
  destroy: (req) =>
    new Promise((resolve, reject) => req.session.destroy((err) => (err ? reject(err) : resolve()))),
};
