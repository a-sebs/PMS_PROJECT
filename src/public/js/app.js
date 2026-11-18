/**
 * JavaScript común a todas las páginas internas (módulo ES, sin dependencias).
 *
 * - `request()`: fetch con CSRF y respuesta JSON uniforme.
 * - `toast()` y `announce()`: mensajes visibles y para lectores de pantalla.
 * - `live`: conexión Socket.IO con indicador de estado, canales y resincronización.
 * - Formularios `[data-enhance]`: se envían con fetch y reemplazan su fragmento `[data-fragment]`.
 *
 * Contrato de tiempo real: docs/03-diseno/tiempo-real.md
 */

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
const main = document.querySelector('main');

// ---------------------------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------------------------

const toastRegion = document.querySelector('[data-toasts]');
const announcer = document.querySelector('[data-announcer]');

/** Muestra un aviso breve (respuesta a una acción del propio usuario). */
export function toast(message, tone = 'info') {
  if (!toastRegion || !message) return;
  const element = document.createElement('p');
  element.className = `toast toast--${tone}`;
  element.textContent = message;
  toastRegion.append(element);
  setTimeout(() => element.remove(), tone === 'error' ? 8000 : 4500);
}

/** Anuncia un cambio a lectores de pantalla sin moverles el foco (WCAG 4.1.3). */
export function announce(message) {
  if (!announcer) return;
  announcer.textContent = '';
  // Vaciar y volver a escribir en otro frame fuerza el anuncio aunque el texto se repita.
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

/**
 * Suma uno a una insignia numérica (`[data-count]` con un hijo `[data-count-value]`).
 * @param {Element | null} badge
 */
export function bumpCounter(badge) {
  if (!badge) return;
  const count = (Number(badge.getAttribute('data-count')) || 0) + 1;
  badge.setAttribute('data-count', String(count));
  const value = badge.querySelector('[data-count-value]');
  if (value) value.textContent = count > 99 ? '99+' : String(count);
  badge.hidden = false;
}

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

/**
 * @param {string} url
 * @param {{ method?: string, body?: URLSearchParams | FormData | object }} [options]
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
export async function request(url, { method = 'GET', body } = {}) {
  const headers = {
    Accept: 'application/json',
    'X-Requested-With': 'fetch',
    'X-CSRF-Token': csrfToken,
  };
  let payload;
  if (body instanceof FormData) payload = new URLSearchParams(body);
  else if (body instanceof URLSearchParams) payload = body;
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    return { ok: false, status: 0, data: { error: { message: 'Sin conexión con el servidor.' } } };
  }

  if (response.status === 401) {
    window.location.assign('/login');
    return { ok: false, status: 401, data: null };
  }
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

/** Pide HTML (un fragmento o el contenido de <main>). Devuelve null si falla. */
export async function fetchHtml(url, headers = {}) {
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html', ...headers } });
    if (response.status === 401) window.location.assign('/login');
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Fragmentos HTML (ADR-0006)
// ---------------------------------------------------------------------------------------------

function parseFragment(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/** Selector que identifica al control enfocado para recuperar el foco tras reemplazar el HTML. */
function describeFocus(container) {
  const active = document.activeElement;
  if (!active || !container.contains(active)) return null;
  if (active.name && active.value)
    return `[name="${CSS.escape(active.name)}"][value="${CSS.escape(active.value)}"]`;
  if (active.id) return `#${CSS.escape(active.id)}`;
  return '';
}

/**
 * Reemplaza `oldElement` por el HTML recibido, conserva el foco del teclado y marca el cambio.
 * @returns {Element | null} El elemento nuevo.
 */
export function swapFragment(oldElement, html, { highlight = true } = {}) {
  const next = html ? parseFragment(html) : null;
  if (!oldElement || !next) return null;

  const focusSelector = describeFocus(oldElement);
  oldElement.replaceWith(next);

  if (focusSelector !== null) {
    const target = (focusSelector && next.querySelector(focusSelector)) || next;
    if (target === next) next.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  if (highlight) {
    next.classList.add('is-updated');
    setTimeout(() => next.classList.remove('is-updated'), 1600);
  }
  document.dispatchEvent(new CustomEvent('fragment:swapped', { detail: { element: next } }));
  return next;
}

/** Vuelve a pedir el contenido de <main> y lo reemplaza (cuando pudimos perdernos eventos). */
export async function resyncMain() {
  if (!main) return;
  const html = await fetchHtml(window.location.pathname + window.location.search, {
    'X-Partial': 'main',
  });
  if (html === null) return;
  main.innerHTML = html;
  document.dispatchEvent(new CustomEvent('live:resynced'));
}

// ---------------------------------------------------------------------------------------------
// Formularios mejorados: con JS se envían por fetch; sin JS funcionan como siempre (PRG).
// Delegación en document: el HTML que llega después no necesita volver a enlazarse.
// ---------------------------------------------------------------------------------------------

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-enhance')) return;
  event.preventDefault();

  // Evita el doble envío sin usar `disabled`: deshabilitar el botón enfocado haría que el teclado
  // y los lectores de pantalla perdieran su posición.
  if (form.dataset.pending === 'true') return;
  form.dataset.pending = 'true';

  const submitter = event.submitter;
  const fragment = form.closest('[data-fragment]');
  const body = new FormData(form, submitter);
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach((button) => button.setAttribute('aria-busy', 'true'));

  // getAttribute y no form.action: un campo llamado "action" dentro del formulario "tapa" la
  // propiedad (DOM clobbering) y form.action devolvería ese <input>, no la URL.
  const url = form.getAttribute('action') || window.location.href;
  const { ok, data } = await request(url, { method: 'POST', body });

  buttons.forEach((button) => button.removeAttribute('aria-busy'));
  delete form.dataset.pending;

  if (data?.html && fragment) swapFragment(fragment, data.html);
  if (ok) toast(data?.message, 'success');
  else toast(data?.error?.message ?? 'No se pudo completar la acción.', 'error');
});

// ---------------------------------------------------------------------------------------------
// Tiempo real
// ---------------------------------------------------------------------------------------------

const indicator = document.querySelector('[data-live-indicator]');
const STATE_TEXT = {
  connecting: 'Conectando…',
  connected: 'En vivo',
  reconnecting: 'Reconectando…',
  offline: 'Sin conexión',
};

function setLiveState(state) {
  if (!indicator) return;
  indicator.hidden = false;
  indicator.dataset.state = state;
  indicator.querySelector('.live__text').textContent = STATE_TEXT[state];
}

function endSession(message) {
  toast(message, 'error');
  setTimeout(() => window.location.assign('/login'), 1500);
}

function createLiveConnection() {
  const channels = (main?.dataset.liveChannels ?? '').split(' ').filter(Boolean);
  const socket = typeof io === 'function' ? io() : null;
  if (!socket) {
    setLiveState('offline');
    return { socket: null, on() {} };
  }

  let connectedBefore = false;

  async function joinChannels() {
    for (const channel of channels) {
      const reply = await socket.emitWithAck('channel:join', channel).catch(() => null);
      if (!reply?.ok) console.warn(`No se pudo unir al canal "${channel}"`, reply);
    }
  }

  socket.on('connect', async () => {
    setLiveState('connected');
    if (socket.recovered) return; // Socket.IO reenvió lo perdido y restauró los canales.
    await joinChannels();
    // Pudimos perdernos eventos: pedir la vista actual. Las páginas con `data-live-manual`
    // (como el chat) se ponen al día por su cuenta y no deben perder su estado.
    if (connectedBefore && !main?.hasAttribute('data-live-manual')) await resyncMain();
    connectedBefore = true;
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      setLiveState('offline');
      return;
    }
    setLiveState('reconnecting');
  });

  socket.io.on('reconnect_attempt', () => setLiveState('reconnecting'));

  socket.on('connect_error', (error) => {
    if (error.message === 'unauthorized') {
      setLiveState('offline');
      endSession('Tu sesión terminó. Vuelve a iniciar sesión.');
      return;
    }
    setLiveState(socket.active ? 'reconnecting' : 'offline');
  });

  socket.on('session:ended', ({ reason } = {}) =>
    endSession(
      reason === 'password_reset'
        ? 'Se cambió la clave de tu cuenta. Vuelve a iniciar sesión.'
        : 'Se cerró tu sesión.',
    ),
  );

  // Cambiaron tus permisos (por ejemplo, un administrador te asignó otro rol): recargar.
  socket.on('session:changed', () => {
    toast('Tus permisos cambiaron. Actualizando la página…', 'info');
    setTimeout(() => window.location.reload(), 1500);
  });

  // Avisos dirigidos (por ejemplo, a los administradores cuando alguien crea su cuenta).
  socket.on('notify', ({ message, tone = 'info' } = {}) => {
    toast(message, tone);
    announce(message);
  });

  // Mensaje nuevo en una sala del chat que no tienes abierta: insignia en el menú y aviso.
  socket.on('chat:unread', ({ roomName, authorName, preview } = {}) => {
    bumpCounter(document.querySelector('[data-chat-badge]'));
    toast(`${authorName} en #${roomName}: ${preview}`, 'info');
  });

  // Páginas con datos derivados (como el panel): ante cualquier evento, resincronizar todo.
  if (main?.hasAttribute('data-live-refresh')) {
    let timer;
    socket.onAny(() => {
      clearTimeout(timer);
      timer = setTimeout(resyncMain, 400);
    });
  }

  return {
    socket,
    /** Suscribe un manejador a un evento del servidor. */
    on: (event, handler) => socket.on(event, handler),
  };
}

export const live = createLiveConnection();
