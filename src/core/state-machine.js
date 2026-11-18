/**
 * @typedef {object} Transition
 * @property {string} from
 * @property {string} to
 * @property {string} action   Verbo para el botón ("Iniciar limpieza").
 * @property {string} done     Confirmación con el mismo verbo ("Limpieza iniciada").
 * @property {readonly string[]} roles  Roles que pueden ejecutarla.
 * @property {(context: any) => string | null} [guard]  Condición extra sobre la entidad: devuelve
 *   el motivo por el que NO se permite, o null si se permite ("solo habitaciones vacantes").
 */

/**
 * @typedef {{ ok: true, transition: Transition }
 *   | { ok: false, reason: 'invalid_transition' | 'role_not_allowed' }
 *   | { ok: false, reason: 'guard_failed', message: string }} CheckResult
 */

/**
 * Define una máquina de estados finitos declarativa. La misma definición se usa para validar en
 * el servicio, para decidir qué botones dibujar y para las pruebas.
 *
 * @param {{ name: string, states: Record<string, string>, transitions: Transition[] }} definition
 *   `states` asocia cada estado con su etiqueta legible.
 */
export function defineStateMachine({ name, states, transitions }) {
  for (const t of transitions) {
    if (!(t.from in states) || !(t.to in states)) {
      throw new Error(`${name}: la transición ${t.from} → ${t.to} usa un estado no declarado`);
    }
  }

  const find = (from, to) => transitions.find((t) => t.from === from && t.to === to);
  const guardMessage = (transition, context) => transition.guard?.(context) ?? null;

  return Object.freeze({
    name,
    states: Object.freeze({ ...states }),

    /** @param {string} state */
    label(state) {
      return states[state] ?? state;
    },

    /** ¿Existe la transición, sin importar el rol ni las condiciones? */
    canTransition(from, to) {
      return Boolean(find(from, to));
    },

    /**
     * Transiciones disponibles desde `from` para un rol (y una entidad concreta, si se pasa
     * `context`), en el orden en que se declararon.
     * @param {string} from
     * @param {string} role
     * @param {unknown} [context]
     */
    availableTransitions(from, role, context) {
      return transitions.filter(
        (t) => t.from === from && t.roles.includes(role) && guardMessage(t, context) === null,
      );
    },

    /**
     * Valida una transición para un rol y, si la transición tiene condición, para la entidad.
     * @param {string} from
     * @param {string} to
     * @param {string} role
     * @param {unknown} [context]
     * @returns {CheckResult}
     */
    check(from, to, role, context) {
      const transition = find(from, to);
      if (!transition) return { ok: false, reason: 'invalid_transition' };
      if (!transition.roles.includes(role)) return { ok: false, reason: 'role_not_allowed' };
      const message = guardMessage(transition, context);
      if (message !== null) return { ok: false, reason: 'guard_failed', message };
      return { ok: true, transition };
    },
  });
}
