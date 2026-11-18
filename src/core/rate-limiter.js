/**
 * Límite de frecuencia en memoria con ventana deslizante: como mucho `max` acciones por clave
 * cada `windowMs`. Sirve para una sola instancia de Node (suficiente para un hotel); con varias
 * instancias habría que guardar los contadores en PostgreSQL o Redis.
 *
 * @param {{ max: number, windowMs: number, now?: () => number }} options
 */
export function createRateLimiter({ max, windowMs, now = Date.now }) {
  /** @type {Map<string | number, number[]>} */
  const hits = new Map();

  return {
    /** Registra un intento. Devuelve false si la clave superó el límite (y no lo registra). */
    consume(key) {
      const time = now();
      const recent = (hits.get(key) ?? []).filter((at) => time - at < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(time);
      hits.set(key, recent);
      return true;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
