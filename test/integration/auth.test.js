import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { createTestApp, csrfFrom, loginAs, TEST_PASSWORD, USERS } from '../helpers/context.js';

/** Valor de la cookie de sesión en una respuesta (o undefined). */
const sessionCookie = (response) =>
  (response.headers['set-cookie'] ?? []).find((c) => c.startsWith('pms.sid='))?.split(';')[0];

describe('HU-01 · iniciar y cerrar sesión', () => {
  let ctx;
  before(async () => {
    ctx = await createTestApp();
  });
  after(() => ctx.close());

  it('muestra el formulario con token CSRF y sin datos de demostración fuera de desarrollo', async () => {
    const response = await request(ctx.app).get('/login');
    assert.equal(response.status, 200);
    assert.match(response.text, /name="_csrf" value="[\w-]{20,}"/);
    assert.doesNotMatch(response.text, /Usuarios de demostración/);
  });

  it('redirige al login (303) a quien no tiene sesión y recuerda adónde iba', async () => {
    const agent = request.agent(ctx.app);
    const blocked = await agent.get('/rooms');
    assert.equal(blocked.status, 303);
    assert.equal(blocked.headers.location, '/login');

    const page = await agent.get('/login');
    const login = await agent
      .post('/login')
      .type('form')
      .send({ email: USERS.frontDesk, password: TEST_PASSWORD, _csrf: csrfFrom(page.text) });
    assert.equal(login.status, 303);
    assert.equal(login.headers.location, '/rooms');
  });

  it('regenera el id de sesión al iniciar sesión (evita fijación de sesión)', async () => {
    const agent = request.agent(ctx.app);
    const page = await agent.get('/login');
    const before = sessionCookie(page);
    const login = await agent
      .post('/login')
      .type('form')
      .send({ email: USERS.admin, password: TEST_PASSWORD, _csrf: csrfFrom(page.text) });
    const afterLogin = sessionCookie(login);
    assert.ok(before && afterLogin);
    assert.notEqual(afterLogin, before);
  });

  it('responde lo mismo a contraseña incorrecta y a correo inexistente (sin pistas)', async () => {
    const agent = request.agent(ctx.app);
    const csrf = csrfFrom((await agent.get('/login')).text);

    const wrongPassword = await agent
      .post('/login')
      .type('form')
      .send({ email: USERS.admin, password: 'incorrecta', _csrf: csrf });
    const unknownEmail = await agent
      .post('/login')
      .type('form')
      .send({ email: 'nadie@aurora.test', password: 'incorrecta', _csrf: csrf });

    for (const response of [wrongPassword, unknownEmail]) {
      assert.equal(response.status, 401);
      assert.match(response.text, /Correo o contraseña incorrectos/);
    }
  });

  it('no deja entrar a un usuario desactivado', async () => {
    await ctx.db.query(`UPDATE users SET is_active = false WHERE email = $1`, [
      USERS.housekeeping2,
    ]);
    const agent = request.agent(ctx.app);
    const csrf = csrfFrom((await agent.get('/login')).text);
    const response = await agent
      .post('/login')
      .type('form')
      .send({ email: USERS.housekeeping2, password: TEST_PASSWORD, _csrf: csrf });
    assert.equal(response.status, 401);
  });

  it('expulsa en el siguiente clic a quien desactivan con la sesión abierta', async () => {
    const { agent } = await loginAs(ctx.app, USERS.maintenance);
    assert.equal((await agent.get('/dashboard')).status, 200);

    await ctx.db.query(`UPDATE users SET is_active = false WHERE email = $1`, [USERS.maintenance]);
    const response = await agent.get('/dashboard');
    assert.equal(response.status, 303);
    assert.equal(response.headers.location, '/login');
    await ctx.db.query(`UPDATE users SET is_active = true WHERE email = $1`, [USERS.maintenance]);
  });

  it('rechaza un POST sin token CSRF y lo explica al volver al login', async () => {
    const agent = request.agent(ctx.app);
    await agent.get('/login');
    const response = await agent
      .post('/login')
      .type('form')
      .send({ email: USERS.admin, password: TEST_PASSWORD });
    assert.equal(response.status, 303);
    // El mensaje viaja como flash y aparece en la siguiente página completa.
    const page = await agent.get('/login');
    assert.match(page.text, /La página caducó por seguridad/);
    assert.doesNotMatch(page.text, /Hola,/, 'no debería haber iniciado sesión');
  });

  it('cerrar sesión invalida la sesión', async () => {
    const { agent, csrf } = await loginAs(ctx.app, USERS.frontDesk);
    const logout = await agent.post('/logout').type('form').send({ _csrf: csrf });
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, '/login');
    const after = await agent.get('/dashboard');
    assert.equal(after.status, 303);
  });

  it('responde 401 en JSON (no una redirección) a fetch sin sesión', async () => {
    const response = await request(ctx.app).get('/rooms/1/card').set('X-Requested-With', 'fetch');
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  });
});

describe('HU-01 · límite de intentos de inicio de sesión', () => {
  let ctx;
  before(async () => {
    ctx = await createTestApp();
  });
  after(() => ctx.close());

  it('bloquea con 429 tras 10 intentos fallidos', async () => {
    const agent = request.agent(ctx.app);
    const csrf = csrfFrom((await agent.get('/login')).text);
    const attempt = () =>
      agent.post('/login').type('form').send({ email: USERS.admin, password: 'mala', _csrf: csrf });

    for (let i = 0; i < 10; i += 1) assert.equal((await attempt()).status, 401);
    const blocked = await attempt();
    assert.equal(blocked.status, 429);
    assert.match(blocked.text, /Demasiados intentos fallidos/);
  });
});

describe('cabeceras de seguridad y health check', () => {
  let ctx;
  before(async () => {
    ctx = await createTestApp();
  });
  after(() => ctx.close());

  it('envía una CSP estricta y oculta la tecnología del servidor', async () => {
    const response = await request(ctx.app).get('/login');
    const csp = response.headers['content-security-policy'];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline/);
    assert.equal(response.headers['x-powered-by'], undefined);
    assert.ok(response.headers['x-request-id']);
  });

  it('GET /health confirma la conexión con la base de datos', async () => {
    const response = await request(ctx.app).get('/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
    assert.equal(response.body.database, 'ok');
  });

  it('muestra una página 404 propia', async () => {
    const response = await request(ctx.app).get('/no-existe');
    assert.equal(response.status, 404);
    assert.match(response.text, /Página no encontrada/);
  });
});
