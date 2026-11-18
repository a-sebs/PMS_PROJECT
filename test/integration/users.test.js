import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createTestApp, loginAs, USERS } from '../helpers/context.js';

describe('HU-03 · administración de usuarios', () => {
  let ctx;
  let admin;
  const idOf = async (email) =>
    (await ctx.db.query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;

  before(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx.app, USERS.admin);
  });
  after(() => ctx.close());

  it('solo administración ve la lista del personal', async () => {
    assert.equal((await admin.agent.get('/users')).status, 200);
    const frontDesk = await loginAs(ctx.app, USERS.frontDesk);
    assert.equal((await frontDesk.agent.get('/users')).status, 403);
  });

  it('cambiar el rol cambia los permisos en la siguiente petición', async () => {
    const frontDesk = await loginAs(ctx.app, USERS.frontDesk);
    assert.equal((await frontDesk.agent.get('/guests')).status, 200);

    const id = await idOf(USERS.frontDesk);
    const response = await admin.agent
      .post(`/users/${id}`)
      .type('form')
      .send({ _csrf: admin.csrf, role: 'housekeeping', isActive: 'on' });
    assert.equal(response.status, 303);
    assert.equal((await frontDesk.agent.get('/guests')).status, 403);

    const audit = await ctx.db.query(
      `SELECT summary FROM audit_events WHERE action = 'user.access_changed' ORDER BY id DESC LIMIT 1`,
    );
    assert.match(audit.rows[0].summary, /rol: Recepción → Limpieza/);

    await admin.agent
      .post(`/users/${id}`)
      .type('form')
      .send({ _csrf: admin.csrf, role: 'front_desk', isActive: 'on' });
  });

  it('desactivar una cuenta la expulsa (checkbox sin marcar = inactiva)', async () => {
    const maintenance = await loginAs(ctx.app, USERS.maintenance);
    const id = await idOf(USERS.maintenance);
    await admin.agent
      .post(`/users/${id}`)
      .type('form')
      .send({ _csrf: admin.csrf, role: 'maintenance' });
    assert.equal((await maintenance.agent.get('/dashboard')).status, 303);
    await admin.agent
      .post(`/users/${id}`)
      .type('form')
      .send({ _csrf: admin.csrf, role: 'maintenance', isActive: 'on' });
  });

  it('nadie puede cambiar su propio rol ni desactivarse', async () => {
    const id = await idOf(USERS.admin);
    const response = await admin.agent
      .post(`/users/${id}`)
      .type('form')
      .set('X-Requested-With', 'fetch')
      .send({ _csrf: admin.csrf, role: 'front_desk', isActive: 'on' });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'SELF_CHANGE');
  });

  it('rechaza un rol inexistente', async () => {
    const id = await idOf(USERS.housekeeping);
    const response = await admin.agent
      .post(`/users/${id}`)
      .type('form')
      .set('X-Requested-With', 'fetch')
      .send({ _csrf: admin.csrf, role: 'superadmin', isActive: 'on' });
    assert.equal(response.status, 422);
  });
});
