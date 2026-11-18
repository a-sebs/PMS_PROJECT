import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, afterEach, before, describe, it } from 'node:test';
import { io as connect } from 'socket.io-client';
import { createTestServer, loginWithFetch, postCommand, USERS } from '../helpers/context.js';

/** Espera un evento o falla con un mensaje claro si no llega a tiempo. */
function nextEvent(socket, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no llegó "${event}" en ${timeoutMs} ms`)),
      timeoutMs,
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Comprueba que un evento NO llega durante una ventana de tiempo. */
async function assertNoEvent(socket, event, windowMs = 400) {
  let received = false;
  const handler = () => {
    received = true;
  };
  socket.on(event, handler);
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  socket.off(event, handler);
  assert.equal(received, false, `no debería haber llegado "${event}"`);
}

describe('tiempo real (Socket.IO) · contrato de docs/03-diseno/tiempo-real.md', () => {
  let server;
  const sockets = [];

  function socketFor(cookie, extraHeaders = {}) {
    const socket = connect(server.baseUrl, {
      transports: ['websocket'],
      extraHeaders: { ...(cookie ? { cookie } : {}), ...extraHeaders },
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  async function connectedSocket(email, channels = []) {
    const session = await loginWithFetch(server.baseUrl, email);
    const socket = socketFor(session.cookie);
    await once(socket, 'connect');
    for (const channel of channels) {
      const reply = await socket.emitWithAck('channel:join', channel);
      assert.deepEqual(reply, { ok: true }, `${email} → ${channel}`);
    }
    return { socket, session };
  }

  async function roomId(number) {
    const { rows } = await server.db.query('SELECT id, version FROM rooms WHERE number = $1', [
      number,
    ]);
    return rows[0];
  }

  before(async () => {
    server = await createTestServer();
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  after(() => server.close());

  it('rechaza la conexión sin sesión', async () => {
    const socket = socketFor(null);
    const [error] = await once(socket, 'connect_error');
    assert.equal(error.message, 'unauthorized');
  });

  it('rechaza el handshake desde otro origen (Cross-Site WebSocket Hijacking)', async () => {
    const { cookie } = await loginWithFetch(server.baseUrl, USERS.frontDesk);

    // Control: la misma cookie desde el origen correcto sí conecta.
    const sameOrigin = socketFor(cookie, { origin: server.baseUrl });
    await once(sameOrigin, 'connect');

    const crossOrigin = socketFor(cookie, { origin: 'https://sitio-malicioso.test' });
    await once(crossOrigin, 'connect_error');
    assert.equal(crossOrigin.connected, false);
  });

  it('verifica el permiso de cada canal', async () => {
    const { socket } = await connectedSocket(USERS.housekeeping);
    assert.deepEqual(await socket.emitWithAck('channel:join', 'rooms'), { ok: true });
    assert.deepEqual(await socket.emitWithAck('channel:join', 'activity'), {
      ok: false,
      error: 'forbidden',
    });
    assert.deepEqual(await socket.emitWithAck('channel:join', 'inventado'), {
      ok: false,
      error: 'unknown_channel',
    });
  });

  it('HU-07 · un cambio de limpieza llega a recepción como room:updated', async () => {
    const frontDesk = await connectedSocket(USERS.frontDesk, ['rooms']);
    const housekeeping = await connectedSocket(USERS.housekeeping, ['rooms']);
    const room = await roomId('104');

    const eventPromise = nextEvent(frontDesk.socket, 'room:updated');
    const response = await postCommand(
      server.baseUrl,
      housekeeping.session,
      `/rooms/${room.id}/housekeeping`,
      {
        status: 'cleaning',
        version: String(room.version),
      },
    );
    assert.equal(response.status, 200);

    const event = await eventPromise;
    assert.equal(event.roomId, room.id);
    assert.equal(event.number, '104');
    assert.equal(event.version, room.version + 1);
    assert.equal(event.statusCode, 'VD');
    assert.equal(event.housekeepingStatus, 'cleaning');
    assert.equal(event.actor.name, 'Lucía Andrade');
    assert.ok(event.occurredAt);
  });

  it('HU-30 · la bitácora llega al canal activity con el resumen del cambio', async () => {
    const admin = await connectedSocket(USERS.admin, ['activity']);
    const maintenance = await connectedSocket(USERS.maintenance);
    const room = await roomId('102');

    const eventPromise = nextEvent(admin.socket, 'activity:created');
    await postCommand(server.baseUrl, maintenance.session, `/rooms/${room.id}/out-of-order`, {
      action: 'block',
      reason: 'Ventana rota',
      version: String(room.version),
    });

    const item = await eventPromise;
    assert.equal(item.summary, 'Habitación 102 bloqueada: Ventana rota');
    assert.equal(item.actorName, 'Diego Cárdenas');
    assert.equal(item.entityType, 'room');
  });

  it('quien no se unió al canal no recibe sus eventos', async () => {
    const outsider = await connectedSocket(USERS.frontDesk); // sin canales
    const housekeeping = await connectedSocket(USERS.housekeeping);
    const room = await roomId('202');

    const silence = assertNoEvent(outsider.socket, 'room:updated');
    await postCommand(server.baseUrl, housekeeping.session, `/rooms/${room.id}/housekeeping`, {
      status: 'cleaning',
      version: String(room.version),
    });
    await silence;
  });

  it('HU-01 · cerrar sesión avisa y desconecta los sockets de esa sesión', async () => {
    const { socket, session } = await connectedSocket(USERS.frontDesk);
    const ended = nextEvent(socket, 'session:ended');
    const disconnected = once(socket, 'disconnect');

    await fetch(`${server.baseUrl}/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        cookie: session.cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ _csrf: session.csrf }),
    });

    assert.deepEqual(await ended, { reason: 'logout' });
    const [reason] = await disconnected;
    assert.equal(reason, 'io server disconnect');
  });
});
