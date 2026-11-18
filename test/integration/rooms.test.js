import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { seedRooms } from '#src/db/seed.js';
import { createTestApp, loginAs, USERS } from '../helpers/context.js';

/** Habitaciones de los datos de demostración (src/db/seed-data.js) usadas en estas pruebas. */
const ROOM = {
  vacantDirty: { number: '104' },
  vacantClean: { number: '102' },
  occupiedClean: { number: '103' },
  outOfOrder: { number: '108' },
};

describe('HU-07/08/09 · tablero y comandos de habitaciones', () => {
  let ctx;
  const sessions = {};

  async function room(number) {
    const { rows } = await ctx.db.query(
      `SELECT id, housekeeping_status, occupancy_status, is_out_of_order, out_of_order_reason, version
         FROM rooms WHERE number = $1`,
      [number],
    );
    return rows[0];
  }

  /** Envía un comando como el JS del navegador (fetch + JSON). */
  function command(session, path, fields) {
    return session.agent
      .post(path)
      .set('X-Requested-With', 'fetch')
      .set('X-CSRF-Token', session.csrf)
      .type('form')
      .send(fields);
  }

  before(async () => {
    ctx = await createTestApp();
    for (const [key, email] of Object.entries(USERS)) sessions[key] = await loginAs(ctx.app, email);
  });

  // Cada prueba parte de las habitaciones de demostración intactas y sin bitácora.
  beforeEach(async () => {
    await ctx.db.query('TRUNCATE audit_events, rooms RESTART IDENTITY CASCADE');
    await ctx.db.transaction((client) => seedRooms(client));
  });

  after(() => ctx.close());

  describe('tablero (GET /rooms)', () => {
    it('muestra las 22 habitaciones agrupadas por piso para cualquier rol', async () => {
      for (const key of ['admin', 'frontDesk', 'housekeeping', 'maintenance']) {
        const response = await sessions[key].agent.get('/rooms');
        assert.equal(response.status, 200, key);
        assert.equal(response.text.match(/class="key-tag /g).length, 22, key);
        assert.match(response.text, /Piso 1[\s\S]*Piso 2[\s\S]*Piso 3/);
      }
    });

    it('cada rol ve solo los botones que puede usar (HU-02)', async () => {
      const housekeeping = (await sessions.housekeeping.agent.get('/rooms')).text;
      assert.match(housekeeping, /Iniciar limpieza/);
      assert.doesNotMatch(housekeeping, /Bloquear habitación|Inspeccionar|Marcar sucia/);

      const frontDesk = (await sessions.frontDesk.agent.get('/rooms')).text;
      assert.match(frontDesk, /Marcar sucia/);
      assert.doesNotMatch(frontDesk, /Iniciar limpieza|Bloquear habitación/);

      const maintenance = (await sessions.maintenance.agent.get('/rooms')).text;
      assert.match(maintenance, /Bloquear habitación/);
      assert.match(maintenance, /Liberar habitación/);
      assert.doesNotMatch(maintenance, /Iniciar limpieza|Marcar sucia/);
    });

    it('la bitácora solo aparece para quien tiene permiso (activity.view)', async () => {
      assert.match((await sessions.admin.agent.get('/rooms')).text, /Actividad reciente/);
      assert.match((await sessions.frontDesk.agent.get('/rooms')).text, /Actividad reciente/);
      assert.doesNotMatch(
        (await sessions.housekeeping.agent.get('/rooms')).text,
        /Actividad reciente/,
      );
    });

    it('con X-Partial: main devuelve solo el contenido, sin layout (resincronización)', async () => {
      const response = await sessions.frontDesk.agent.get('/rooms').set('X-Partial', 'main');
      assert.equal(response.status, 200);
      assert.doesNotMatch(response.text, /<html|<header class="topbar"/);
      assert.match(response.text, /class="board"/);
    });

    it('GET /rooms/:id/card devuelve solo la tarjeta', async () => {
      const { id } = await room(ROOM.vacantDirty.number);
      const response = await sessions.housekeeping.agent.get(`/rooms/${id}/card`);
      assert.equal(response.status, 200);
      assert.match(response.text, /^<article class="key-tag/);
      assert.match(response.text, /data-version="1"/);
    });

    it('un id inválido o inexistente es 404', async () => {
      assert.equal((await sessions.admin.agent.get('/rooms/abc/card')).status, 404);
      assert.equal((await sessions.admin.agent.get('/rooms/99999/card')).status, 404);
    });
  });

  describe('HU-08 · cambiar estado de limpieza', () => {
    it('limpieza: sucia → en limpieza → limpia, con versión y bitácora', async () => {
      const { id } = await room(ROOM.vacantDirty.number);

      const start = await command(sessions.housekeeping, `/rooms/${id}/housekeeping`, {
        status: 'cleaning',
        version: 1,
      });
      assert.equal(start.status, 200);
      assert.equal(start.body.ok, true);
      assert.equal(start.body.version, 2);
      assert.match(start.body.message, /Limpieza iniciada en la 104/);
      assert.match(start.body.html, /data-version="2"/);
      assert.match(start.body.html, /Terminar limpieza/);

      const finish = await command(sessions.housekeeping, `/rooms/${id}/housekeeping`, {
        status: 'clean',
        version: 2,
      });
      assert.equal(finish.status, 200);
      assert.match(finish.body.html, /data-code="VC"/);

      const { rows } = await ctx.db.query(
        `SELECT action, summary, actor_id, data FROM audit_events ORDER BY id`,
      );
      assert.deepEqual(
        rows.map((r) => r.summary),
        ['Habitación 104: Sucia → En limpieza', 'Habitación 104: En limpieza → Limpia'],
      );
      assert.deepEqual(rows[1].data, { from: 'cleaning', to: 'clean', version: 3 });
    });

    it('recepción no puede iniciar una limpieza: 403 y nada cambia', async () => {
      const { id } = await room(ROOM.vacantDirty.number);
      const response = await command(sessions.frontDesk, `/rooms/${id}/housekeeping`, {
        status: 'cleaning',
        version: 1,
      });
      assert.equal(response.status, 403);
      assert.equal((await room(ROOM.vacantDirty.number)).housekeeping_status, 'dirty');
    });

    it('una versión obsoleta da 409 con la tarjeta vigente (ADR-0008)', async () => {
      const { id } = await room(ROOM.vacantDirty.number);
      await command(sessions.housekeeping, `/rooms/${id}/housekeeping`, {
        status: 'cleaning',
        version: 1,
      });

      const stale = await command(sessions.housekeeping2, `/rooms/${id}/housekeeping`, {
        status: 'cleaning',
        version: 1,
      });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.error.code, 'VERSION_CONFLICT');
      assert.match(stale.body.html, /data-version="2"/);
    });

    it('una transición que no existe desde el estado actual es 409 INVALID_TRANSITION', async () => {
      const { id, version } = await room(ROOM.vacantClean.number);
      const response = await command(sessions.housekeeping, `/rooms/${id}/housekeeping`, {
        status: 'cleaning',
        version,
      });
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, 'INVALID_TRANSITION');
    });

    it('no se inspecciona una habitación ocupada: ni botón ni comando', async () => {
      const page = await sessions.admin.agent.get('/rooms');
      const card = page.text.slice(
        page.text.indexOf('id="room-3"'),
        page.text.indexOf('id="room-4"'),
      );
      assert.doesNotMatch(card, /Inspeccionar/);

      const { id, version } = await room(ROOM.occupiedClean.number);
      const response = await command(sessions.admin, `/rooms/${id}/housekeeping`, {
        status: 'inspected',
        version,
      });
      assert.equal(response.status, 409);
      assert.match(response.body.error.message, /Solo se inspeccionan habitaciones vacantes/);
    });

    it('valida la entrada: estado desconocido o sin versión → 422', async () => {
      const { id } = await room(ROOM.vacantDirty.number);
      const response = await command(sessions.housekeeping, `/rooms/${id}/housekeeping`, {
        status: 'brillante',
      });
      assert.equal(response.status, 422);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
      assert.ok(response.body.error.details.fieldErrors.version);
    });

    it('sin JavaScript: formulario normal → 303 de vuelta y mensaje flash', async () => {
      const { id } = await room(ROOM.vacantDirty.number);
      const response = await sessions.housekeeping.agent
        .post(`/rooms/${id}/housekeeping`)
        .type('form')
        .send({ status: 'cleaning', version: 1, _csrf: sessions.housekeeping.csrf });
      assert.equal(response.status, 303);
      assert.equal(response.headers.location, '/rooms');

      const page = await sessions.housekeeping.agent.get('/rooms');
      assert.match(page.text, /Limpieza iniciada en la 104/);
    });

    it('concurrencia: dos peticiones simultáneas con la misma versión → exactamente una gana', async () => {
      const { id } = await room(ROOM.vacantDirty.number);
      const responses = await Promise.all(
        [sessions.housekeeping, sessions.housekeeping2, sessions.admin].map((session) =>
          command(session, `/rooms/${id}/housekeeping`, { status: 'cleaning', version: 1 }),
        ),
      );
      const statuses = responses.map((r) => r.status).sort();
      assert.deepEqual(statuses, [200, 409, 409]);
      const { version } = await room(ROOM.vacantDirty.number);
      assert.equal(version, 2);
    });
  });

  describe('HU-09 · fuera de servicio', () => {
    it('mantenimiento bloquea una habitación vacante con motivo', async () => {
      const { id, version } = await room(ROOM.vacantClean.number);
      const response = await command(sessions.maintenance, `/rooms/${id}/out-of-order`, {
        action: 'block',
        reason: 'Cortocircuito en el velador',
        version,
      });
      assert.equal(response.status, 200);
      assert.match(response.body.html, /data-code="OOO"/);
      assert.match(response.body.html, /Cortocircuito en el velador/);

      const updated = await room(ROOM.vacantClean.number);
      assert.equal(updated.is_out_of_order, true);
      assert.equal(updated.housekeeping_status, 'clean', 'bloquear no toca el estado de limpieza');
    });

    it('el motivo es obligatorio (mínimo 3 caracteres)', async () => {
      const { id, version } = await room(ROOM.vacantClean.number);
      const response = await command(sessions.maintenance, `/rooms/${id}/out-of-order`, {
        action: 'block',
        reason: ' a ',
        version,
      });
      assert.equal(response.status, 422);
      assert.match(response.body.error.message, /motivo/);
    });

    it('RN-10: no se puede bloquear una habitación ocupada', async () => {
      const { id, version } = await room(ROOM.occupiedClean.number);
      const response = await command(sessions.maintenance, `/rooms/${id}/out-of-order`, {
        action: 'block',
        reason: 'Fuga de agua',
        version,
      });
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, 'ROOM_OCCUPIED');
    });

    it('liberar devuelve la habitación a su estado de limpieza anterior', async () => {
      const { id, version, housekeeping_status: before } = await room(ROOM.outOfOrder.number);
      const response = await command(sessions.maintenance, `/rooms/${id}/out-of-order`, {
        action: 'release',
        version,
      });
      assert.equal(response.status, 200);
      const updated = await room(ROOM.outOfOrder.number);
      assert.equal(updated.is_out_of_order, false);
      assert.equal(updated.out_of_order_reason, null);
      assert.equal(updated.housekeeping_status, before);
    });

    it('limpieza y recepción no pueden bloquear (403)', async () => {
      const { id, version } = await room(ROOM.vacantClean.number);
      for (const key of ['housekeeping', 'frontDesk']) {
        const response = await command(sessions[key], `/rooms/${id}/out-of-order`, {
          action: 'block',
          reason: 'Prueba',
          version,
        });
        assert.equal(response.status, 403, key);
      }
    });
  });

  describe('integridad en la base de datos', () => {
    it('la bitácora es de solo inserción', async () => {
      const { id } = await room(ROOM.vacantDirty.number);
      await command(sessions.housekeeping, `/rooms/${id}/housekeeping`, {
        status: 'cleaning',
        version: 1,
      });
      await assert.rejects(
        ctx.db.query(`UPDATE audit_events SET summary = 'alterado'`),
        /solo inserción/,
      );
      await assert.rejects(ctx.db.query(`DELETE FROM audit_events`), /solo inserción/);
    });

    it('RN-10 también lo garantiza la base de datos', async () => {
      await assert.rejects(
        ctx.db.query(
          `UPDATE rooms SET is_out_of_order = true, out_of_order_reason = 'x', out_of_order_since = now()
            WHERE number = $1`,
          [ROOM.occupiedClean.number],
        ),
        /rooms_occupied_cannot_be_out_of_order/,
      );
    });
  });
});
