import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, afterEach, before, describe, it } from 'node:test';
import { io as connect } from 'socket.io-client';
import { createTestServer, csrfFrom, loginWithFetch, USERS } from '../helpers/context.js';

/** Espera un evento o falla con un mensaje claro si no llega a tiempo. */
function nextEvent(socket, event, { timeoutMs = 2000, where = () => true } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`no llegó "${event}" en ${timeoutMs} ms`));
    }, timeoutMs);
    function handler(payload) {
      if (!where(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

async function assertNoEvent(socket, event, windowMs = 300) {
  let received = null;
  const handler = (payload) => {
    received = payload;
  };
  socket.on(event, handler);
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  socket.off(event, handler);
  assert.equal(received, null, `no debería haber llegado "${event}"`);
}

const cookieFrom = (response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

describe('HU-42 · chat del personal en tiempo real (Socket.IO)', () => {
  let server;
  const sockets = [];

  async function connectAs(email) {
    const session = await loginWithFetch(server.baseUrl, email);
    const socket = connect(server.baseUrl, {
      transports: ['websocket'],
      extraHeaders: { cookie: session.cookie },
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    await once(socket, 'connect');
    return { socket, session };
  }

  const join = (socket, room, extra = {}) => socket.emitWithAck('chat:join', { room, ...extra });
  const send = (socket, room, body) => socket.emitWithAck('chat:send', { room, body });

  before(async () => {
    server = await createTestServer();
  });
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });
  after(() => server.close());

  it('entrega en vivo un mensaje entre dos usuarios y lo guarda en la base de datos', async () => {
    const frontDesk = await connectAs(USERS.frontDesk);
    const housekeeping = await connectAs(USERS.housekeeping);
    assert.equal((await join(frontDesk.socket, 'general')).ok, true);
    assert.equal((await join(housekeeping.socket, 'general')).ok, true);

    const delivered = nextEvent(housekeeping.socket, 'chat:message');
    const reply = await send(frontDesk.socket, 'general', '  ¿La 204 ya está lista?  ');
    assert.equal(reply.ok, true);
    assert.equal(reply.message.body, '¿La 204 ya está lista?');
    assert.equal(reply.message.author.name, 'Mateo Salazar');
    assert.equal(reply.message.author.roleLabel, 'Recepción');

    const received = await delivered;
    assert.deepEqual(received, reply.message);

    const { rows } = await server.db.query('SELECT room, body FROM chat_messages WHERE id = $1', [
      reply.message.id,
    ]);
    assert.deepEqual(rows[0], { room: 'general', body: '¿La 204 ya está lista?' });
  });

  it('quien entra después recibe el historial y, al reconectarse, solo lo que se perdió', async () => {
    const admin = await connectAs(USERS.admin);
    const joined = await join(admin.socket, 'general');
    assert.ok(joined.messages.some((m) => m.body === '¿La 204 ya está lista?'));
    const lastId = joined.messages.at(-1).id;

    const frontDesk = await connectAs(USERS.frontDesk);
    await join(frontDesk.socket, 'general');
    await send(frontDesk.socket, 'general', 'Mensaje mientras el admin estaba desconectado');

    const reconnected = await connectAs(USERS.admin);
    const catchUp = await join(reconnected.socket, 'general', { afterId: lastId });
    assert.deepEqual(
      catchUp.messages.map((m) => m.body),
      ['Mensaje mientras el admin estaba desconectado'],
    );
  });

  it('valida y sanea lo que llega por el socket', async () => {
    const { socket } = await connectAs(USERS.frontDesk);
    await join(socket, 'general');

    const empty = await send(socket, 'general', '   ');
    assert.deepEqual(empty, {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Escribe un mensaje.' },
    });
    const tooLong = await send(socket, 'general', 'x'.repeat(1001));
    assert.match(tooLong.error.message, /1000 caracteres/);
    const unknownRoom = await send(socket, 'secreta', 'hola');
    assert.equal(unknownRoom.error.message, 'La sala no existe.');
    const notAnObject = await socket.emitWithAck('chat:send', 'hola');
    assert.equal(notAnObject.ok, false);

    const zeroWidth = String.fromCharCode(0x200b);
    const html = await send(socket, 'general', `<img src=x onerror=alert(1)>${zeroWidth}`);
    assert.equal(html.ok, true);
    assert.equal(html.message.body, '<img src=x onerror=alert(1)>', 'se guarda como texto');
  });

  it('respeta los permisos de cada sala', async () => {
    const { socket } = await connectAs(USERS.housekeeping);
    const joinReply = await join(socket, 'mantenimiento');
    assert.equal(joinReply.ok, false);
    assert.equal(joinReply.error.code, 'CHAT_ROOM_FORBIDDEN');
    const sendReply = await send(socket, 'mantenimiento', 'no debería guardarse');
    assert.equal(sendReply.error.code, 'CHAT_ROOM_FORBIDDEN');
    const { rows } = await server.db.query(
      `SELECT count(*)::int AS n FROM chat_messages WHERE body = 'no debería guardarse'`,
    );
    assert.equal(rows[0].n, 0);
  });

  it('limita la frecuencia de envío por persona', async () => {
    const { socket } = await connectAs(USERS.maintenance);
    await join(socket, 'mantenimiento');
    for (let i = 1; i <= 8; i += 1) {
      assert.equal((await send(socket, 'mantenimiento', `Aviso ${i}`)).ok, true);
    }
    const blocked = await send(socket, 'mantenimiento', 'Aviso 9');
    assert.equal(blocked.error.code, 'RATE_LIMITED');
  });

  it('avisa del mensaje nuevo a quien no tiene la sala abierta, pero no al autor', async () => {
    const admin = await connectAs(USERS.admin); // conectado, pero mirando otra página
    const frontDesk = await connectAs(USERS.frontDesk);
    const frontDeskElsewhere = await connectAs(USERS.frontDesk); // otra pestaña del autor
    await join(frontDesk.socket, 'limpieza');

    const unread = nextEvent(admin.socket, 'chat:unread');
    const reply = await send(frontDesk.socket, 'limpieza', 'Hay check-in a las 14:00');
    assert.deepEqual(await unread, {
      room: 'limpieza',
      roomName: 'Limpieza',
      messageId: reply.message.id,
      authorName: 'Mateo Salazar',
      preview: 'Hay check-in a las 14:00',
    });
    await assertNoEvent(frontDeskElsewhere.socket, 'chat:unread');
  });

  it('muestra quién está conectado y quién se fue', async () => {
    const admin = await connectAs(USERS.admin);
    const arrival = nextEvent(admin.socket, 'presence:update', {
      where: ({ online }) => online.some((u) => u.name === 'Jorge Paredes'),
    });
    const housekeeping2 = await connectAs(USERS.housekeeping2);
    const { online } = await arrival;
    assert.ok(online.some((u) => u.name === 'Valeria Ortiz' && u.roleLabel === 'Administración'));

    const departure = nextEvent(admin.socket, 'presence:update', {
      where: ({ online: list }) => !list.some((u) => u.name === 'Jorge Paredes'),
    });
    housekeeping2.socket.disconnect();
    await departure;
  });

  it('funciona sin JavaScript: envío por HTTP y página renderizada en el servidor', async () => {
    const session = await loginWithFetch(server.baseUrl, USERS.frontDesk);
    const response = await fetch(`${server.baseUrl}/chat/general/messages`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: session.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: session.csrf, body: 'Enviado <sin> JavaScript' }),
    });
    assert.equal(response.status, 303);
    assert.match(response.headers.get('location'), /^\/chat\/general#mensaje-\d+$/);

    const page = await fetch(`${server.baseUrl}/chat/general`, {
      headers: { cookie: session.cookie },
    });
    const html = await page.text();
    assert.match(html, /Enviado &lt;sin&gt; JavaScript/);
    assert.match(html, /role="log" aria-live="polite"/);
  });

  it('cuenta los mensajes sin leer y la sala queda leída al abrirla', async () => {
    const session = await loginWithFetch(server.baseUrl, USERS.housekeeping2);
    const badge = async () => {
      const html = await (
        await fetch(`${server.baseUrl}/dashboard`, { headers: { cookie: session.cookie } })
      ).text();
      return Number(/data-chat-badge data-count="(\d+)"/.exec(html)[1]);
    };
    const { rows } = await server.db.query(
      `SELECT count(*)::int AS n FROM chat_messages WHERE room IN ('general', 'limpieza')`,
    );
    assert.equal(await badge(), rows[0].n);

    await fetch(`${server.baseUrl}/chat/general`, { headers: { cookie: session.cookie } });
    await fetch(`${server.baseUrl}/chat/limpieza`, { headers: { cookie: session.cookie } });
    assert.equal(await badge(), 0);
  });

  it('avisa en vivo a administración cuando alguien crea su cuenta (HU-39)', async () => {
    const admin = await connectAs(USERS.admin);
    const notified = nextEvent(admin.socket, 'notify');

    const page = await fetch(`${server.baseUrl}/signup`);
    const response = await fetch(`${server.baseUrl}/signup`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: cookieFrom(page), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        _csrf: csrfFrom(await page.text()),
        fullName: 'Rosa Quishpe',
        email: 'rosa.quishpe@aurora.test',
        password: 'Recepcion2026',
        passwordConfirm: 'Recepcion2026',
      }),
    });
    assert.equal(response.status, 303);
    const { message } = await notified;
    assert.match(message, /Rosa Quishpe creó una cuenta de Recepción/);
  });

  it('cambiar el rol de alguien recarga sus pestañas abiertas', async () => {
    const maintenance = await connectAs(USERS.maintenance);
    const changed = nextEvent(maintenance.socket, 'session:changed');
    const admin = await loginWithFetch(server.baseUrl, USERS.admin);
    const { rows } = await server.db.query('SELECT id FROM users WHERE email = $1', [
      USERS.maintenance,
    ]);
    const post = (role) =>
      fetch(`${server.baseUrl}/users/${rows[0].id}`, {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie: admin.cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ _csrf: admin.csrf, role, isActive: 'on' }),
      });
    assert.equal((await post('housekeeping')).status, 303);
    assert.deepEqual(await changed, { reason: 'role_changed' });
    await post('maintenance');
  });
});
