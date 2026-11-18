import { randomUUID } from 'node:crypto';

/**
 * @typedef {object} DomainEvent
 * @property {string} id           Identificador único del evento.
 * @property {string} type         Nombre en pasado con punto: "room.status_changed".
 * @property {string} occurredAt   Instante ISO 8601.
 * @property {Record<string, unknown>} payload
 */

/**
 * Bus de eventos de dominio en memoria.
 *
 * - Los servicios publican DESPUÉS de confirmar la transacción.
 * - Cada suscriptor se ejecuta de forma asíncrona y aislada: si uno falla, se registra el error y
 *   los demás (y quien publicó) siguen funcionando.
 * - `subscribe('*', fn)` recibe todos los eventos (útil para depurar o auditar).
 *
 * @param {{ logger?: import('pino').Logger }} [deps]
 */
export function createEventBus({ logger } = {}) {
  /** @type {Map<string, Set<(event: DomainEvent) => unknown>>} */
  const handlers = new Map();

  function handlersFor(type) {
    return [...(handlers.get(type) ?? []), ...(handlers.get('*') ?? [])];
  }

  return {
    /**
     * @param {string} type
     * @param {Record<string, unknown>} payload
     * @returns {DomainEvent}
     */
    publish(type, payload) {
      const event = Object.freeze({
        id: randomUUID(),
        type,
        occurredAt: new Date().toISOString(),
        payload,
      });
      for (const handler of handlersFor(type)) {
        setImmediate(async () => {
          try {
            await handler(event);
          } catch (err) {
            logger?.error({ err, eventType: type }, 'Falló un suscriptor de eventos de dominio');
          }
        });
      }
      return event;
    },

    /**
     * @param {string} type Tipo de evento o "*" para todos.
     * @param {(event: DomainEvent) => unknown} handler
     * @returns {() => void} Función para cancelar la suscripción.
     */
    subscribe(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
  };
}
