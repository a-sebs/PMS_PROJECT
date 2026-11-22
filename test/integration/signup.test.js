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
    assert.match(page.text, /cuando administración apruebe tu cuenta/);
  });

  it('crea la cuenta como Recepción INACTIVA, sin sesión, y deja rastro en la bitácora', async () => {
    const { agent, csrf } = await signupPage(ctx.app);
    const response = await agent.post('/signup').type('form').send({
      _csrf: csrf,
      fullName: '  Ana   Torres ',
      email: 'Ana.Torres@Aurora.TEST',
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.location, '/login');

    const login = await agent.get('/login');
    assert.match(login.text, /Gracias, Ana\. Tu cuenta de Recepción quedó pendiente/);
    const guests = await agent.get('/guests');
    assert.equal(guests.status, 303, 'sin aprobación no hay sesión ni acceso a huéspedes');
    assert.equal(guests.headers.location, '/login');

    const { rows } = await ctx.db.query(
      `SELECT full_name, email, role, is_active, password_hash FROM users WHERE email = 'ana.torres@aurora.test'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].full_name, 'Ana Torres');
    assert.equal(rows[0].role, 'front_desk');
    assert.equal(rows[0].is_active, false, 'la cuenta nace pendiente de aprobación');
    assert.match(rows[0].password_hash, /^scrypt\$/);
    assert.ok(!rows[0].password_hash.includes(NEW_PASSWORD), 'nunca en texto plano');

    const audit = await ctx.db.query(
      `SELECT summary FROM audit_events WHERE action = 'user.registered' ORDER BY id DESC LIMIT 1`,
    );
    assert.match(
      audit.rows[0].summary,
      /Ana Torres creó su cuenta \(Recepción, pendiente de aprobación\)/,
    );
  });

  it('una cuenta pendiente no puede iniciar sesión hasta que administración la activa', async () => {
    const email = 'marta.vera@aurora.test';
    const { agent, csrf } = await signupPage(ctx.app);
    await agent.post('/signup').type('form').send({
      _csrf: csrf,
      fullName: 'Marta Vera',
      email,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });

    const tryLogin = async () => {
      const visitor = request.agent(ctx.app);
      const page = await visitor.get('/login');
      const response = await visitor
        .post('/login')
        .type('form')
        .send({ _csrf: csrfFrom(page.text), email, password: NEW_PASSWORD });
      return { visitor, response };
    };

    const pending = await tryLogin();
    assert.equal(pending.response.status, 401);
    assert.match(pending.response.text, /Correo o contraseña incorrectos/);

    const admin = await loginAs(ctx.app, USERS.admin);
    const { rows } = await ctx.db.query('SELECT id FROM users WHERE email = $1', [email]);
    const activation = await admin.agent
      .post(`/users/${rows[0].id}`)
      .type('form')
      .send({ _csrf: admin.csrf, role: 'front_desk', isActive: 'on' });
    assert.equal(activation.status, 303);

    const approved = await tryLogin();
    assert.equal(approved.response.status, 303);
    assert.equal((await approved.visitor.get('/guests')).status, 200, 'ya accede al CRUD');
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
