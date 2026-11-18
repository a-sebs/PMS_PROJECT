import { ROLE_LABELS } from '#src/core/permissions.js';

/**
 * Quién está conectado ahora (HU-33, requisito "usuarios conectados" de la guía).
 *
 * Una persona puede tener varias pestañas (varios sockets): está en línea mientras le quede al
 * menos uno. Como la aplicación es multipágina, cada clic en el menú cierra el socket y abre otro;
 * por eso la desconexión se confirma tras un margen (`graceMs`) y así la lista no parpadea.
 *
 * @param {{ graceMs?: number, onChange?: (online: OnlineUser[]) => void }} [options]
 */
export function createPresence({ graceMs = 4000, onChange = () => {} } = {}) {
  /** @type {Map<number, { user: OnlineUser, sockets: Set<string>, timer: NodeJS.Timeout | null }>} */
  const entries = new Map();

  const list = () =>
    [...entries.values()]
      .map((entry) => entry.user)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const notify = () => onChange(list());

  return {
    list,

    isOnline: (userId) => entries.has(userId),

    /** @param {{ id: number, name: string, role: string }} user */
    connect(user, socketId) {
      const current = {
        id: user.id,
        name: user.name,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role],
      };
      const existing = entries.get(user.id);
      if (existing) {
        if (existing.timer) clearTimeout(existing.timer);
        existing.timer = null;
        existing.sockets.add(socketId);
        // Si le cambiaron el rol, se reconecta con el rol nuevo: la lista debe reflejarlo.
        const changed = existing.user.role !== current.role || existing.user.name !== current.name;
        existing.user = current;
        if (changed) notify();
        return;
      }
      entries.set(user.id, { user: current, sockets: new Set([socketId]), timer: null });
      notify();
    },

    disconnect(userId, socketId) {
      const entry = entries.get(userId);
      if (!entry) return;
      entry.sockets.delete(socketId);
      if (entry.sockets.size > 0 || entry.timer) return;
      entry.timer = setTimeout(() => {
        if (entry.sockets.size > 0) {
          entry.timer = null;
          return;
        }
        entries.delete(userId);
        notify();
      }, graceMs);
      entry.timer.unref?.();
    },

    /** Para el apagado ordenado: cancela los temporizadores pendientes. */
    clear() {
      for (const entry of entries.values()) if (entry.timer) clearTimeout(entry.timer);
      entries.clear();
    },
  };
}

/** @typedef {{ id: number, name: string, role: string, roleLabel: string }} OnlineUser */
