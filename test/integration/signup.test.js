import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { createTestApp, csrfFrom, loginAs, USERS } from '../helpers/context.js';

const NEW_PASSWORD = 'Recepcion2026';

/** Agente anónimo con el token CSRF de la página de registro. */
async function signupPage(app) {
  const agent = request.agent(app);
  const page = await agent.get('/signup');
  return { agent, page, csrf: csrfFrom(page.text) };
}

describe('HU-39 · registro de usuarios (SignUp)', () => {
  let ctx;
  before(async () => {
    ctx = await createTestApp();
  });
  after(() => ctx.close());

  it('muestra el formulario con validación HTML y el rol que se asignará', async () => {
    const { page } = await signupPage(ctx.app);
    assert.equal(page.status, 200);
    assert.match(page.text, /name="fullName"[^>]*required/);
    assert.match(page.text, /name="password"[^>]*minlength="10"/);
    assert.match(page.text, /rol de <strong>Recepción<\/strong>/);
  });

  it('crea la cuenta como Recepción, inicia la sesión y deja rastro en la bitácora', async () => {
    const { agent, csrf } = await signupPage(ctx.app);
    const response = await agent.post('/signup').type('form').send({
      _csrf: csrf,
      fullName: '  Ana   Torres ',
      email: 'Ana.Torres@Aurora.TEST',
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.location, '/dashboard');

    const dashboard = await agent.get('/dashboard');
    assert.match(dashboard.text, /Te damos la bienvenida, Ana/);
    assert.equal((await agent.get('/guests')).status, 200, 'recepción accede al CRUD');
    assert.equal((await agent.get('/chat/general')).status, 200, 'y al chat');

    const { rows } = await ctx.db.query(
      `SELECT full_name, email, role, password_hash FROM users WHERE email = 'ana.torres@aurora.test'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].full_name, 'Ana Torres');
    assert.equal(rows[0].role, 'front_desk');
    assert.match(rows[0].password_hash, /^scrypt\$/);
    assert.ok(!rows[0].password_hash.includes(NEW_PASSWORD), 'nunca en texto plano');

    const audit = await ctx.db.query(
      `SELECT summary FROM audit_events WHERE action = 'user.registered' ORDER BY id DESC LIMIT 1`,
    );
    assert.match(audit.rows[0].summary, /Ana Torres creó su cuenta \(Recepción\)/);
  });

  it('rechaza un correo ya registrado sin importar mayúsculas (409)', async () => {
    const { agent, csrf } = await signupPage(ctx.app);
    const response = await agent.post('/signup').type('form').send({
      _csrf: csrf,
      fullName: 'Otra Persona',
      email: USERS.frontDesk.toUpperCase(),
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });
    assert.equal(response.status, 409);
    assert.match(response.text, /Ya existe una cuenta con este correo/);
  });

  it('valida en el servidor y explica cada error sin devolver la contraseña (422)', async () => {
    const { agent, csrf } = await signupPage(ctx.app);
    const response = await agent.post('/signup').type('form').send({
      _csrf: csrf,
      fullName: 'Ana',
      email: 'ana@',
      password: 'secreta-sin-numeros',
      passwordConfirm: 'otra-cosa',
    });
    assert.equal(response.status, 422);
    assert.match(response.text, /Escribe tu nombre y apellido/);
    assert.match(response.text, /Escribe un correo válido/);
    assert.match(response.text, /al menos un número/);
    assert.match(response.text, /Revisa los \d campos marcados/);
    assert.doesNotMatch(response.text, /secreta-sin-numeros/);
    assert.match(response.text, /value="ana@"/, 'conserva lo que sí se puede volver a mostrar');

    const { rows } = await ctx.db.query(
      `SELECT count(*)::int AS n FROM users WHERE email = 'ana@'`,
    );
    assert.equal(rows[0].n, 0);
  });

  it('exige que las contraseñas coincidan', async () => {
    const { agent, csrf } = await signupPage(ctx.app);
    const response = await agent
      .post('/signup')
      .type('form')
      .send({
        _csrf: csrf,
        fullName: 'Luis Pérez',
        email: 'luis.perez@aurora.test',
        password: NEW_PASSWORD,
        passwordConfirm: `${NEW_PASSWORD}x`,
      });
    assert.equal(response.status, 422);
    assert.match(response.text, /Las contraseñas no coinciden/);
  });

  it('protege el registro con CSRF y redirige a quien ya inició sesión', async () => {
    const anonymous = await request(ctx.app).post('/signup').type('form').send({
      fullName: 'Sin Token',
      email: 'sin.token@aurora.test',
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });
    assert.equal(anonymous.status, 303, 'sin token: rechazado y redirigido con aviso');

    const { agent } = await loginAs(ctx.app, USERS.admin);
    const page = await agent.get('/signup');
    assert.equal(page.status, 302);
    assert.equal(page.headers.location, '/dashboard');
  });
});
