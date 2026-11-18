import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withCedulaCheckDigit } from '#src/db/seed-data.js';
import {
  ageOn,
  isIsoDate,
  isValidCedula,
  isValidPassport,
  normalizeDocument,
  normalizePhone,
  passwordProblem,
  shiftYears,
} from '#src/public/js/lib/validators.js';

describe('validadores compartidos (navegador y servidor)', () => {
  it('acepta cédulas con dígito verificador correcto', () => {
    for (const cedula of ['1710034065', '0926687856', '1713175071', '3050000003']) {
      assert.equal(isValidCedula(cedula), true, cedula);
    }
  });

  it('rechaza cédulas con dígito, provincia, tercer dígito o longitud incorrectos', () => {
    assert.equal(isValidCedula('1710034066'), false, 'dígito verificador');
    assert.equal(isValidCedula('2510034065'), false, 'provincia 25 no existe');
    assert.equal(isValidCedula('1770034065'), false, 'tercer dígito 7: no es persona natural');
    assert.equal(isValidCedula('171003406'), false, '9 dígitos');
    assert.equal(isValidCedula('17100340AB'), false, 'letras');
  });

  it('el generador de datos de demostración produce cédulas válidas', () => {
    for (const base of ['010100000', '241523456', '095512345']) {
      assert.equal(isValidCedula(withCedulaCheckDigit(base)), true, base);
    }
  });

  it('valida pasaportes y normaliza documentos', () => {
    assert.equal(normalizeDocument(' ab-123 456 '), 'AB123456');
    assert.equal(isValidPassport('AB123456'), true);
    assert.equal(isValidPassport('AB1'), false);
    assert.equal(isValidPassport('AB 123456'), false);
  });

  it('normaliza teléfonos al formato E.164', () => {
    assert.equal(normalizePhone('099 123 4567'), '+593991234567');
    assert.equal(normalizePhone('(02) 234-5678'), '+59322345678');
    assert.equal(normalizePhone('+57 300 123 4567'), '+573001234567');
    assert.equal(normalizePhone('0057 300 123 4567'), '+573001234567');
    assert.equal(normalizePhone('12'), null);
    assert.equal(normalizePhone('+0 123 456 789'), null);
    assert.equal(normalizePhone('teléfono'), null);
  });

  it('calcula la edad cumplida y valida fechas de calendario', () => {
    assert.equal(ageOn('2008-11-17', '2026-11-17'), 18);
    assert.equal(ageOn('2008-11-18', '2026-11-17'), 17);
    assert.equal(isIsoDate('2026-02-28'), true);
    assert.equal(isIsoDate('2026-02-30'), false);
    assert.equal(isIsoDate('17/11/2026'), false);
    assert.equal(shiftYears('2026-11-17', -18), '2008-11-17');
    assert.equal(shiftYears('2024-02-29', -1), '2023-02-28');
  });

  it('aplica la política de contraseñas con mensajes claros', () => {
    assert.match(passwordProblem('corta1'), /al menos 10 caracteres/);
    assert.match(passwordProblem('solamenteletras'), /al menos un número/);
    assert.match(passwordProblem('1234567890123'), /al menos una letra/);
    assert.equal(passwordProblem('Aurora2026!'), null);
  });
});
