import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CURRENT_PARAMS,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '#src/modules/auth/password.js';

describe('hash de contraseñas con scrypt', () => {
  it('usa un formato autodescriptivo con los parámetros actuales', async () => {
    const hash = await hashPassword('correcta-123');
    const [algorithm, N, r, p, salt, key] = hash.split('$');
    assert.equal(algorithm, 'scrypt');
    assert.deepEqual(
      [Number(N), Number(r), Number(p)],
      [CURRENT_PARAMS.N, CURRENT_PARAMS.r, CURRENT_PARAMS.p],
    );
    assert.ok(salt.length > 0 && key.length > 0);
  });

  it('genera una sal distinta en cada hash', async () => {
    assert.notEqual(await hashPassword('igual'), await hashPassword('igual'));
  });

  it('verifica la contraseña correcta y rechaza una incorrecta', async () => {
    const hash = await hashPassword('correcta-123');
    assert.equal(await verifyPassword('correcta-123', hash), true);
    assert.equal(await verifyPassword('Correcta-123', hash), false);
  });

  it('normaliza Unicode: "é" compuesta y descompuesta son la misma contraseña', async () => {
    const hash = await hashPassword('café');
    assert.equal(await verifyPassword('café', hash), true);
  });

  it('devuelve false (sin lanzar) ante un hash mal formado', async () => {
    assert.equal(await verifyPassword('x', 'texto-cualquiera'), false);
    assert.equal(await verifyPassword('x', 'scrypt$a$b$c$d$e'), false);
  });

  it('pide recalcular el hash si los parámetros cambiaron', async () => {
    assert.equal(needsRehash(await hashPassword('x')), false);
    assert.equal(needsRehash('scrypt$16384$8$1$c2Fs$aGFzaA'), true);
  });
});
