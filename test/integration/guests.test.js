import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DEMO_GUESTS } from '#src/db/seed-data.js';
import { createTestApp, loginAs, USERS } from '../helpers/context.js';

const VALID_GUEST = {
  documentType: 'cedula',
  documentNumber: '1710034065',
  firstName: 'Juan Carlos',
  lastName: 'Pérez Ñaupari',
  email: 'Juan.Perez@Correo.TEST',
  phone: '099 123 4567',
  birthDate: '1988-03-14',
  nationality: 'EC',
  notes: '<script>alert("xss")</script> Prefiere piso alto',
};

describe('HU-41 · CRUD de huéspedes', () => {
  let ctx;
  let frontDesk;

  before(async () => {
    ctx = await createTestApp();
    frontDesk = await loginAs(ctx.app, USERS.frontDesk);
  });
  after(() => ctx.close());

  const create = (fields, session = frontDesk) =>
    session.agent
      .post('/guests')
      .type('form')
      .send({ _csrf: session.csrf, ...fields });

  describe('consultar', () => {
    it('lista paginada de 10 en 10 con el total', async () => {
      const first = await frontDesk.agent.get('/guests');
      assert.equal(first.status, 200);
      assert.match(
        first.text,
        new RegExp(`Mostrando <strong>1–10</strong> de <strong>${DEMO_GUESTS.length}</strong>`),
      );
      assert.equal((first.text.match(/<tr>\s*<th scope="row"/g) ?? []).length, 10);
      assert.match(
        first.text,
        /aria-current="page"><span class="visually-hidden">Página <\/span>1</,
      );

      const last = await frontDesk.agent.get('/guests?page=5');
      assert.match(last.text, /Mostrando <strong>41–48<\/strong>/);

      const bigger = await frontDesk.agent.get('/guests?perPage=25');
      assert.equal((bigger.text.match(/<tr>\s*<th scope="row"/g) ?? []).length, 25);
    });

    it('una página que no existe lleva a la última (conservando filtros)', async () => {
      const response = await frontDesk.agent.get('/guests?nationality=EC&page=99');
      assert.equal(response.status, 303);
      assert.match(response.headers.location, /^\/guests\?nationality=EC&page=\d+$/);
    });

    it('busca sin distinguir mayúsculas ni tildes, por nombre, documento o correo', async () => {
      const target = DEMO_GUESTS.find((g) => /[áéíóúñ]/i.test(g.lastName));
      const plain = target.lastName
        .split(' ')[0]
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toUpperCase();
      const byName = await frontDesk.agent.get(`/guests?q=${encodeURIComponent(plain)}`);
      assert.match(byName.text, new RegExp(target.lastName.split(' ')[0]));

      const byDocument = await frontDesk.agent.get(`/guests?q=${DEMO_GUESTS[1].documentNumber}`);
      assert.match(byDocument.text, /Mostrando <strong>1–1<\/strong> de <strong>1<\/strong>/);

      const byEmail = await frontDesk.agent.get(
        `/guests?q=${encodeURIComponent(DEMO_GUESTS[2].email)}`,
      );
      assert.match(byEmail.text, new RegExp(DEMO_GUESTS[2].firstName));
    });

    it('filtra por nacionalidad', async () => {
      const expected = DEMO_GUESTS.filter((g) => g.nationality === 'CO').length;
      const response = await frontDesk.agent.get('/guests?nationality=CO');
      assert.match(response.text, new RegExp(`de <strong>${expected}</strong>`));
    });

    it('trata la búsqueda como texto: ni comodines ni inyección SQL', async () => {
      for (const q of ["' OR 1=1 --", '%', '_']) {
        const response = await frontDesk.agent.get(`/guests?q=${encodeURIComponent(q)}`);
        assert.equal(response.status, 200, q);
        assert.match(response.text, /Ningún huésped coincide/, q);
      }
    });

    it('consulta por identificador y responde 404 si no existe', async () => {
      const { rows } = await ctx.db.query('SELECT id, first_name FROM guests ORDER BY id LIMIT 1');
      const detail = await frontDesk.agent.get(`/guests/${rows[0].id}`);
      assert.equal(detail.status, 200);
      assert.match(detail.text, new RegExp(rows[0].first_name));

      const lookup = await frontDesk.agent.get(`/guests/lookup?id=${rows[0].id}`);
      assert.equal(lookup.headers.location, `/guests/${rows[0].id}`);

      const missing = await frontDesk.agent.get('/guests/lookup?id=999999');
      assert.equal(missing.headers.location, '/guests');
      assert.match(
        (await frontDesk.agent.get('/guests')).text,
        /No existe un huésped con el identificador 999999/,
      );

      assert.equal((await frontDesk.agent.get('/guests/999999')).status, 404);
      assert.equal((await frontDesk.agent.get('/guests/abc')).status, 404);
    });
  });

  describe('crear', () => {
    it('guarda los datos normalizados y registra quién lo hizo', async () => {
      const response = await create(VALID_GUEST);
      assert.equal(response.status, 303);
      const id = Number(response.headers.location.split('/').pop());

      const { rows } = await ctx.db.query('SELECT * FROM guests WHERE id = $1', [id]);
      assert.equal(rows[0].email, 'juan.perez@correo.test');
      assert.equal(rows[0].phone, '+593991234567');
      assert.equal(rows[0].birth_date, '1988-03-14');

      const detail = await frontDesk.agent.get(`/guests/${id}`);
      assert.match(detail.text, /Se registró a Juan Carlos Pérez Ñaupari/);
      assert.match(detail.text, /\+593 99 123 4567/);
      assert.match(detail.text, /&lt;script&gt;alert/, 'el HTML de las notas se muestra escapado');
      assert.doesNotMatch(detail.text, /<script>alert/);

      const audit = await ctx.db.query(
        `SELECT summary FROM audit_events WHERE action = 'guest.created' ORDER BY id DESC LIMIT 1`,
      );
      assert.match(audit.rows[0].summary, /Mateo Salazar registró al huésped Juan Carlos/);
    });

    it('responde 422 con un mensaje por campo y no guarda nada', async () => {
      const before = (await ctx.db.query('SELECT count(*)::int AS n FROM guests')).rows[0].n;
      const response = await create({
        ...VALID_GUEST,
        documentNumber: '1710034066',
        firstName: 'J',
        email: 'juan@',
        phone: '12',
        birthDate: '2015-01-01',
      });
      assert.equal(response.status, 422);
      for (const message of [
        /La cédula no es válida/,
        /al menos 2 caracteres/,
        /correo válido/,
        /teléfono válido/,
        /mayor de edad/,
        /Revisa los 5 campos marcados/,
      ]) {
        assert.match(response.text, message);
      }
      assert.match(response.text, /value="juan@"/, 'conserva lo escrito');
      const after = (await ctx.db.query('SELECT count(*)::int AS n FROM guests')).rows[0].n;
      assert.equal(after, before);
    });

    it('no permite dos huéspedes con el mismo documento (409)', async () => {
      const existing = DEMO_GUESTS[0];
      const response = await create({
        ...VALID_GUEST,
        documentType: existing.documentType,
        documentNumber: existing.documentNumber,
      });
      assert.equal(response.status, 409);
      assert.match(response.text, /Ya hay un huésped registrado con ese documento/);
      assert.match(response.text, /ver la ficha del huésped que ya tiene ese documento/);
    });

    it('exige el token CSRF', async () => {
      const response = await frontDesk.agent.post('/guests').type('form').send(VALID_GUEST);
      assert.equal(response.status, 303);
      assert.match((await frontDesk.agent.get('/guests')).text, /La página caducó por seguridad/);
    });
  });

  describe('actualizar', () => {
    it('guarda los cambios y aumenta la versión', async () => {
      const { rows } = await ctx.db.query('SELECT * FROM guests ORDER BY id LIMIT 1 OFFSET 3');
      const guest = rows[0];
      const form = await frontDesk.agent.get(`/guests/${guest.id}/edit`);
      assert.match(form.text, new RegExp(`name="version" value="${guest.version}"`));

      const response = await frontDesk.agent.post(`/guests/${guest.id}`).type('form').send({
        _csrf: frontDesk.csrf,
        version: guest.version,
        documentType: guest.document_type,
        documentNumber: guest.document_number,
        firstName: guest.first_name,
        lastName: guest.last_name,
        email: 'nuevo.correo@correo.test',
        phone: '+57 300 123 4567',
        birthDate: guest.birth_date,
        nationality: guest.nationality,
        notes: '',
      });
      assert.equal(response.status, 303);
      const updated = (await ctx.db.query('SELECT * FROM guests WHERE id = $1', [guest.id]))
        .rows[0];
      assert.equal(updated.email, 'nuevo.correo@correo.test');
      assert.equal(updated.phone, '+573001234567');
      assert.equal(updated.version, guest.version + 1);
    });

    it('detecta que otra persona lo modificó antes (409) y muestra los datos actuales', async () => {
      const { rows } = await ctx.db.query('SELECT * FROM guests ORDER BY id LIMIT 1 OFFSET 4');
      const guest = rows[0];
      await ctx.db.query(
        `UPDATE guests SET notes = 'Cambio de otra persona', version = version + 1 WHERE id = $1`,
        [guest.id],
      );

      const response = await frontDesk.agent.post(`/guests/${guest.id}`).type('form').send({
        _csrf: frontDesk.csrf,
        version: guest.version,
        documentType: guest.document_type,
        documentNumber: guest.document_number,
        firstName: 'Sobrescribir',
        lastName: guest.last_name,
        email: guest.email,
        phone: guest.phone,
        birthDate: guest.birth_date,
        nationality: guest.nationality,
      });
      assert.equal(response.status, 409);
      assert.match(response.text, /Otra persona modificó este huésped/);
      assert.match(response.text, /Cambio de otra persona/);
      const current = (
        await ctx.db.query('SELECT first_name FROM guests WHERE id = $1', [guest.id])
      ).rows[0];
      assert.equal(current.first_name, guest.first_name, 'no se sobrescribió');
    });
  });

  describe('eliminar', () => {
    it('pide confirmación y luego elimina, dejando rastro en la bitácora', async () => {
      const { rows } = await ctx.db.query(
        'SELECT id, first_name, last_name FROM guests ORDER BY id DESC LIMIT 1',
      );
      const guest = rows[0];

      const confirm = await frontDesk.agent.get(`/guests/${guest.id}/delete`);
      assert.equal(confirm.status, 200);
      assert.match(confirm.text, new RegExp(`¿Eliminar a ${guest.first_name}`));
      assert.match(confirm.text, /no se puede deshacer/);

      const response = await frontDesk.agent
        .post(`/guests/${guest.id}/delete`)
        .type('form')
        .send({ _csrf: frontDesk.csrf });
      assert.equal(response.status, 303);
      assert.equal(response.headers.location, '/guests');
      assert.equal((await frontDesk.agent.get(`/guests/${guest.id}`)).status, 404);

      const audit = await ctx.db.query(
        `SELECT summary FROM audit_events WHERE action = 'guest.deleted' ORDER BY id DESC LIMIT 1`,
      );
      assert.match(audit.rows[0].summary, new RegExp(`eliminó al huésped ${guest.first_name}`));
    });
  });

  describe('permisos', () => {
    it('limpieza y mantenimiento no ven datos personales de huéspedes', async () => {
      const total = async () =>
        (await ctx.db.query('SELECT count(*)::int AS n FROM guests')).rows[0].n;
      const before = await total();
      for (const email of [USERS.housekeeping, USERS.maintenance]) {
        const session = await loginAs(ctx.app, email);
        assert.equal((await session.agent.get('/guests')).status, 403, email);
        assert.equal((await session.agent.get('/guests/1')).status, 403, email);
        const attempt = await create({ ...VALID_GUEST, documentNumber: '0926687856' }, session);
        assert.equal(attempt.status, 303, `${email}: POST rechazado con aviso`);
      }
      assert.equal(await total(), before, 'no se creó ningún huésped');
    });
  });
});
