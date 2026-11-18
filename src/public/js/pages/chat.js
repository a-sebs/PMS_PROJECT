/**
 * Chat del personal en vivo (HU-42). Contrato de eventos: docs/03-diseno/tiempo-real.md
 *
 * - Al conectar (y al reconectar) se une a la sala con `chat:join` y pide los mensajes que se
 *   perdió (`afterId`): nunca se pierde un mensaje por un corte de red.
 * - Envía con `chat:send` y espera la confirmación del servidor (acknowledgement).
 * - Pinta los mensajes con `textContent`: el texto de otra persona nunca se interpreta como HTML.
 * - Sin conexión en vivo, el formulario se envía por HTTP como cualquier formulario.
 */
import { bumpCounter, live, toast } from '../app.js';

const root = document.querySelector('[data-chat]');
const socket = live.socket;

if (root && socket) {
  const room = root.dataset.room;
  const isHistoryPage = root.dataset.history === 'true';
  const log = root.querySelector('[data-chat-log]');
  const list = root.querySelector('[data-chat-messages]');
  const liveRegion = root.querySelector('[data-chat-live]');
  const empty = root.querySelector('[data-chat-empty]');
  const form = root.querySelector('[data-chat-form]');
  const input = form.elements.namedItem('body');
  const errorOutput = form.querySelector('[data-field-error]');
  const messageTemplate = document.getElementById('chat-message-template');
  const onlineTemplate = document.getElementById('online-user-template');

  const myId = Number(document.body.dataset.userId);
  const timeZone = document.body.dataset.timezone;
  const timeFormat = new Intl.DateTimeFormat('es', { timeZone, timeStyle: 'short' });
  const dateTimeFormat = new Intl.DateTimeFormat('es', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone });

  const seen = new Set(
    [...list.querySelectorAll('[data-message-id]')].map((item) => Number(item.dataset.messageId)),
  );
  let lastId = Number(root.dataset.lastId) || 0;

  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 96;
  const scrollToBottom = () => {
    log.scrollTop = log.scrollHeight;
  };

  function when(iso) {
    const date = new Date(iso);
    const isToday = dayFormat.format(date) === dayFormat.format(new Date());
    return (isToday ? timeFormat : dateTimeFormat).format(date);
  }

  function buildMessage(message) {
    const item = messageTemplate.content.firstElementChild.cloneNode(true);
    const mine = message.author.id === myId;
    item.id = `mensaje-${message.id}`;
    item.dataset.messageId = String(message.id);
    item.classList.toggle('chat-message--mine', mine);
    item.querySelector('.chat-message__author').textContent = mine ? 'Tú' : message.author.name;
    item.querySelector('.chat-message__role').textContent = message.author.roleLabel;
    const time = item.querySelector('time');
    time.dateTime = message.createdAt;
    time.textContent = when(message.createdAt);
    item.querySelector('.chat-message__body').textContent = message.body;
    return item;
  }

  /** Agrega un mensaje al final si no estaba (llega por el ack y por el broadcast). */
  function append(message, { forceScroll = false } = {}) {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    const stick = forceScroll || nearBottom();
    list.append(buildMessage(message));
    lastId = Math.max(lastId, message.id);
    empty.hidden = true;
    if (stick) scrollToBottom();
    return true;
  }

  function showError(message) {
    errorOutput.textContent = message;
    errorOutput.hidden = !message;
    input.closest('.field')?.classList.toggle('field--invalid', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  // Marca como leído lo que está a la vista (agrupa varias llegadas seguidas en un solo aviso).
  let readTimer;
  function markRead() {
    if (document.visibilityState !== 'visible' || lastId === 0) return;
    clearTimeout(readTimer);
    readTimer = setTimeout(() => socket.emit('chat:read', { room, messageId: lastId }), 400);
  }

  function renderOnline(online) {
    const items = online.map((person) => {
      const item = onlineTemplate.content.firstElementChild.cloneNode(true);
      item.querySelector('.chat-online__name').textContent =
        person.id === myId ? `${person.name} (tú)` : person.name;
      item.querySelector('.chat-online__role').textContent = person.roleLabel;
      return item;
    });
    root.querySelector('[data-online-list]').replaceChildren(...items);
    root.querySelector('[data-online-count]').textContent = `(${online.length})`;
    root.querySelector('[data-online-empty]').hidden = online.length > 0;
  }

  async function join() {
    const reply = await socket
      .timeout(5000)
      .emitWithAck('chat:join', { room, afterId: lastId })
      .catch(() => null);
    if (!reply?.ok) {
      toast(reply?.error?.message ?? 'No se pudo entrar a la sala del chat.', 'error');
      return;
    }
    for (const message of reply.messages) append(message);
    renderOnline(reply.online);
    markRead();
  }

  // En una página de mensajes antiguos (?before=) no se agregan mensajes nuevos al final.
  if (!isHistoryPage) {
    scrollToBottom();
    socket.on('connect', join);
    if (socket.connected) join();

    socket.on('chat:message', (message) => {
      if (message.room !== room) return;
      if (append(message) && message.author.id !== myId) markRead();
    });
    document.addEventListener('visibilitychange', markRead);
  }

  socket.on('presence:update', ({ online }) => renderOnline(online));

  socket.on('chat:unread', ({ room: otherRoom }) => {
    bumpCounter(root.querySelector(`[data-room-unread="${CSS.escape(otherRoom)}"]`));
  });

  // ── Enviar ────────────────────────────────────────────────────────────────────────────────
  // forms.js valida primero (campo obligatorio, longitud); si hay errores, esto no se ejecuta.
  form.addEventListener('submit', async (event) => {
    if (!socket.connected) return; // Sin conexión en vivo: envío HTTP normal (respaldo).
    event.preventDefault();
    if (form.dataset.pending === 'true') return;
    form.dataset.pending = 'true';

    const reply = await socket
      .timeout(5000)
      .emitWithAck('chat:send', { room, body: input.value })
      .catch(() => null);
    delete form.dataset.pending;

    if (reply?.ok) {
      input.value = '';
      showError('');
      append(reply.message, { forceScroll: true });
      return;
    }
    showError(reply?.error?.message ?? 'No se pudo enviar el mensaje. Revisa tu conexión.');
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  // ── Mensajes anteriores ───────────────────────────────────────────────────────────────────
  root.addEventListener('click', async (event) => {
    const link = event.target instanceof Element ? event.target.closest('[data-load-older]') : null;
    if (!link || !socket.connected) return;
    event.preventDefault();
    const firstId = Number(list.querySelector('[data-message-id]')?.dataset.messageId);
    if (!firstId) return;

    const reply = await socket
      .timeout(5000)
      .emitWithAck('chat:history', { room, beforeId: firstId })
      .catch(() => null);
    if (!reply?.ok) {
      toast(reply?.error?.message ?? 'No se pudieron cargar los mensajes anteriores.', 'error');
      return;
    }

    // Los mensajes viejos no se anuncian como si fueran nuevos.
    liveRegion.setAttribute('aria-live', 'off');
    const previousHeight = log.scrollHeight;
    const fragment = document.createDocumentFragment();
    for (const message of reply.messages) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      fragment.append(buildMessage(message));
    }
    list.prepend(fragment);
    log.scrollTop += log.scrollHeight - previousHeight;
    requestAnimationFrame(() => liveRegion.setAttribute('aria-live', 'polite'));

    if (reply.hasOlder && reply.messages.length > 0) {
      link.href = `/chat/${encodeURIComponent(room)}?before=${reply.messages[0].id}`;
    } else {
      link.closest('.chat__older')?.remove();
    }
  });
}
