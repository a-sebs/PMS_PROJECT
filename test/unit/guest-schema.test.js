import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { guestListQuerySchema, guestSchema } from '#src/modules/guests/guests.schemas.js';

const TODAY = '2026-11-17';
const valid = {
  documentType: 'cedula',
  documentNumber: '1710034065',
  firstName: '  María   José ',
  lastName: 'Pazmiño',
  email: ' Maria.Pazmino@Correo.TEST ',
  phone: '099 123 4567',
  birthDate: '1990-05-04',
  nationality: 'EC',
  notes: '',
};

const errorsOf = (input) => {
  const result = guestSchema({ today: TODAY }).safeParse(input);
  assert.equal(result.success, false, 'debería fallar');
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
};

describe('esquema del huésped (HU-41)', () => {
  it('normaliza los datos válidos antes de guardarlos', () => {
    const guest = guestSchema({ today: TODAY }).parse(valid);
    assert.equal(guest.firstName, 'María José');
    assert.equal(guest.email, 'maria.pazmino@correo.test');
    assert.equal(guest.phone, '+593991234567');
    assert.equal(guest.notes, null);
  });

  it('valida el número según el tipo de documento', () => {
    assert.match(
      errorsOf({ ...valid, documentNumber: '1710034066' }).documentNumber,
      /no es válida/,
    );
    assert.match(errorsOf({ ...valid, documentNumber: '17100' }).documentNumber, /10 dígitos/);
    const passport = guestSchema({ today: TODAY }).parse({
      ...valid,
      documentType: 'passport',
      documentNumber: 'ab 1234567',
    });
    assert.equal(passport.documentNumber, 'AB1234567');
  });

  it('exige que el huésped titular sea mayor de edad y que la fecha sea real', () => {
    assert.match(errorsOf({ ...valid, birthDate: '2008-11-18' }).birthDate, /mayor de edad/);
    assert.match(errorsOf({ ...valid, birthDate: '2027-01-01' }).birthDate, /futura/);
    assert.match(errorsOf({ ...valid, birthDate: '1990-02-30' }).birthDate, /fecha válida/);
    assert.equal(
      guestSchema({ today: TODAY }).safeParse({ ...valid, birthDate: '2008-11-17' }).success,
      true,
    );
  });

  it('rechaza formatos y longitudes inválidos con mensajes en español', () => {
    const errors = errorsOf({
      ...valid,
      firstName: 'J',
      lastName: 'P3rez',
      email: 'ana@',
      phone: '12',
      nationality: 'XX',
      notes: 'x'.repeat(501),
    });
    assert.match(errors.firstName, /al menos 2 caracteres/);
    assert.match(errors.lastName, /solo letras/);
    assert.match(errors.email, /correo válido/);
    assert.match(errors.phone, /teléfono válido/);
    assert.match(errors.nationality, /nacionalidad/);
    assert.match(errors.notes, /500 caracteres/);
  });

  it('los filtros del listado nunca rompen la página', () => {
    const parsed = guestListQuerySchema.parse({ page: 'abc', perPage: '7', nationality: 'ZZ' });
    assert.equal(parsed.q, undefined);
    assert.equal(parsed.nationality, undefined);
    assert.equal(parsed.page, 1);
    assert.equal(parsed.perPage, 10);
    assert.equal(guestListQuerySchema.parse({ q: 'x'.repeat(300) }).q.length, 100);
  });
});
