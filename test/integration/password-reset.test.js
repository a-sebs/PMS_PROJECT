import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createTestApp, csrfFrom, loginAs, TEST_PASSWORD, USERS } from '../helpers/context.js';

const NEW_PASSWORD = 'NuevaClave2026';
const GENERIC = /Si el correo pertenece a una cuenta activa/;

describe('HU-40 · recuperación de clave con token de un solo uso', () => {
  let ctx;
  before(async () => {
    ctx = await createTestApp();
  });
  after(() => ctx.close());
  beforeEach(async () => {
    await ctx.db.query('TRUNCATE email_outbox, password_reset_tokens');
  });

  async function requestReset(email) {
    const agent = request.agent(ctx.app);
    const page = await agent.get('/forgot-password');
    const response = await agent
      .post('/forgot-password')
      .type('form')
      .send({ _csrf: csrfFrom(page.text), email });
    return response;
  }

  /** Último enlace "enviado" a un correo (bandeja simulada) y su token. */
  async function lastLink(email) {
    const { rows } = await ctx.db.query(
      `SELECT link_url, body_text FROM email_outbox WHERE to_address = $1 ORDER BY id DESC LIMIT 1`,
      [email],
    );
    if (!rows[0]) return null;
    const url = new URL(rows[0].link_url);
    return {
      url,
      path: url.pathname,
      token: url.pathname.split('/').pop(),
      body: rows[0].body_text,
    };
  }

  async function submitNewPassword(path, password = NEW_PASSWORD, confirm = password) {
    const agent = request.agent(ctx.app);
    const page = await agent.get(path);
    if (page.status !== 200) return page;
    return agent
      .post(path)
      .type('form')
      .send({ _csrf: csrfFrom(page.text), password, passwordConfirm: confirm });
  }

  async function canLogin(email, password) {
    const agent = request.agent(ctx.app);
    const page = await agent.get('/login');
    const response = await agent
      .post('/login')
      .type('form')
      .send({ _csrf: csrfFrom(page.text), email, password });
    return response.status === 303;
  }

  it('responde lo mismo exista o no la cuenta (no revela correos registrados)', async () => {
    const known = await requestReset(USERS.housekeeping2);
    const unknown = await requestReset('nadie@aurora.test');
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.match(known.text, GENERIC);
    assert.match(unknown.text, GENERIC);
    assert.ok(await lastLink(USERS.housekeeping2), 'a la cuenta real le llega el correo');
    assert.equal(await lastLink('nadie@aurora.test'), null);
  });

  it('el enlace usa APP_URL y la base de datos guarda solo el hash del token', async () => {
    await requestReset(USERS.housekeeping2);
    const link = await lastLink(USERS.housekeeping2);
    assert.equal(link.url.origin, ctx.container.config.appUrl);
    assert.match(link.token, /^[\w-]{43}$/);
    assert.match(link.body, /caduca en 30 minutos/);

    const { rows } = await ctx.db.query(
      `SELECT encode(token_hash, 'hex') AS hash, expires_at - created_at AS ttl
         FROM password_reset_tokens`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hash.length, 64, 'SHA-256');
    assert.ok(!rows[0].hash.includes(link.token));
    assert.equal(rows[0].ttl.minutes, 30);
  });

  it('cambia la clave, cierra las sesiones abiertas y el enlace no sirve dos veces', async () => {
    const { agent: openSession } = await loginAs(ctx.app, USERS.housekeeping2);
    await requestReset(USERS.housekeeping2);
    const { path } = await lastLink(USERS.housekeeping2);

    const response = await submitNewPassword(path);
    assert.equal(response.status, 303);
    assert.equal(response.headers.location, '/login');

    assert.equal(await canLogin(USERS.housekeeping2, NEW_PASSWORD), true);
    assert.equal(await canLogin(USERS.housekeeping2, TEST_PASSWORD), false);

    const kickedOut = await openSession.get('/dashboard');
    assert.equal(kickedOut.status, 303, 'la sesión abierta antes del cambio se cerró');

    const reused = await request(ctx.app).get(path);
    assert.equal(reused.status, 410);
    assert.match(reused.text, /Este enlace ya no sirve/);

    // Dejar la clave como estaba para las demás pruebas.
    await ctx.db.query(
      `UPDATE users SET password_hash = (SELECT password_hash FROM users WHERE email = $1) WHERE email = $2`,
      [USERS.housekeeping, USERS.housekeeping2],
    );
  });

  it('rechaza un enlace caducado', async () => {
    await requestReset(USERS.maintenance);
    const { path } = await lastLink(USERS.maintenance);
    await ctx.db.query(
      `UPDATE password_reset_tokens SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'`,
    );
    const response = await request(ctx.app).get(path);
    assert.equal(response.status, 410);
  });

  it('pedir un enlace nuevo anula el anterior', async () => {
    await requestReset(USERS.maintenance);
    const first = await lastLink(USERS.maintenance);
    await requestReset(USERS.maintenance);
    const second = await lastLink(USERS.maintenance);
    assert.notEqual(first.token, second.token);
    assert.equal((await request(ctx.app).get(first.path)).status, 410);
    assert.equal((await request(ctx.app).get(second.path)).status, 200);
  });

  it('valida la nueva clave sin gastar el enlace', async () => {
    await requestReset(USERS.maintenance);
    const { path } = await lastLink(USERS.maintenance);
    const weak = await submitNewPassword(path, 'corta');
    assert.equal(weak.status, 422);
    assert.match(weak.text, /al menos 10 caracteres/);
    const mismatch = await submitNewPassword(path, NEW_PASSWORD, 'Distinta2026x');
    assert.match(mismatch.text, /Las contraseñas no coinciden/);
    assert.equal((await request(ctx.app).get(path)).status, 200, 'el enlace sigue vigente');
  });

  it('trata un token inventado o mal formado como inválido', async () => {
    const invented = 'A'.repeat(43);
    assert.equal((await request(ctx.app).get(`/reset-password/${invented}`)).status, 410);
    assert.equal((await request(ctx.app).get('/reset-password/abc')).status, 410);
    const post = await submitNewPassword(`/reset-password/${invented}`);
    assert.equal(post.status, 410);
  });
});
