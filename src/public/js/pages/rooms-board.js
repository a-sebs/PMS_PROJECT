/**
 * Tablero de habitaciones en vivo (HU-07, HU-30, HU-34).
 *
 * - `room:updated` → si la versión es más nueva que la de la tarjeta, se pide el fragmento y se
 *   reemplaza (ADR-0006). Las respuestas desordenadas se descartan comparando `data-version`.
 * - `activity:created` → se agrega un ítem a la bitácora clonando un <template> (solo textContent).
 * - Los contadores se recalculan a partir del DOM; el filtrado lo hace CSS con :target + :has().
 */
import { announce, fetchHtml, live, swapFragment } from '../app.js';

const currentUserId = Number(document.body.dataset.userId);
const timeFormat = new Intl.DateTimeFormat('es', {
  timeZone: document.body.dataset.timezone || undefined,
  timeStyle: 'short',
});

const MAX_ACTIVITY_ITEMS = 30;
const cardFor = (roomId) => document.getElementById(`room-${roomId}`);

// ---------- Contadores y filtros ----------

function updateCounts() {
  const cards = [...document.querySelectorAll('.key-tag')];
  for (const badge of document.querySelectorAll('[data-count]')) {
    const group = badge.dataset.count;
    const count =
      group === 'all'
        ? cards.length
        : cards.filter((card) => card.dataset.groups.split(' ').includes(group)).length;
    badge.textContent = String(count);
  }
}

/** Marca el filtro activo para tecnologías de asistencia (el estilo ya lo resuelve CSS). */
function markActiveFilter() {
  const active = window.location.hash.replace('#filtro-', '') || 'all';
  for (const chip of document.querySelectorAll('[data-filter]')) {
    if (chip.dataset.filter === active) chip.setAttribute('aria-current', 'true');
    else chip.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', markActiveFilter);
document.addEventListener('live:resynced', markActiveFilter);
markActiveFilter();

// ---------- Tarjetas en vivo ----------

/** Pide la tarjeta vigente y la reemplaza solo si es más nueva que la que se muestra. */
async function refreshCard(roomId, minVersion) {
  const card = cardFor(roomId);
  if (!card || Number(card.dataset.version) >= minVersion) return false;

  // No arrancar el formulario a alguien que está escribiendo (p. ej., el motivo de un bloqueo):
  // se actualiza al salir del campo. Si envía antes, el servidor responde 409 con la versión vigente.
  const active = document.activeElement;
  if (card.contains(active) && active.matches('input, textarea')) {
    card.addEventListener('focusout', () => refreshCard(roomId, minVersion), { once: true });
    return false;
  }

  const html = await fetchHtml(`/rooms/${roomId}/card`);
  const latest = cardFor(roomId);
  if (!html || !latest) return false;
  const incoming = /data-version="(\d+)"/.exec(html);
  if (incoming && Number(incoming[1]) <= Number(latest.dataset.version)) return false;

  swapFragment(latest, html);
  return true;
}

// Cualquier tarjeta reemplazada (por un evento en vivo o por una acción propia) puede cambiar
// los contadores.
document.addEventListener('fragment:swapped', updateCounts);

live.on('room:updated', async (event) => {
  const changed = await refreshCard(event.roomId, event.version);
  if (changed && event.actor?.id !== currentUserId) {
    announce(`Habitación ${event.number}: ${event.statusLabel}. Cambio de ${event.actor.name}.`);
  }
});

// ---------- Bitácora ----------

live.on('activity:created', (item) => {
  const list = document.querySelector('[data-activity-list]');
  const template = document.querySelector('[data-activity-template]');
  if (!list || !template) return;

  const node = template.content.firstElementChild.cloneNode(true);
  const time = node.querySelector('.activity__time');
  time.dateTime = item.occurredAt;
  time.textContent = timeFormat.format(new Date(item.occurredAt));
  node.querySelector('.activity__summary').textContent = item.summary;
  node.querySelector('.activity__actor').textContent = item.actorName;
  node.classList.add('is-new');

  list.prepend(node);
  document.querySelector('[data-activity-empty]')?.remove();
  while (list.children.length > MAX_ACTIVITY_ITEMS) list.lastElementChild.remove();
});
