import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { can, PERMISSIONS, ROLES } from '#src/core/permissions.js';
import { safeLocalPath } from '#src/http/helpers.js';

describe('permisos', () => {
  it('sin usuario no hay permisos', () => {
    assert.equal(can(null, 'rooms.view'), false);
  });

  it('todo el personal ve el tablero; solo admin y mantenimiento bloquean habitaciones', () => {
    for (const role of ROLES) assert.equal(can({ role }, 'rooms.view'), true);
    assert.deepEqual(
      ROLES.filter((role) => can({ role }, 'rooms.out_of_order')),
      ['admin', 'maintenance'],
    );
  });

  it('un permiso mal escrito es un error de programación, no un "no"', () => {
    assert.throws(() => can({ role: 'admin' }, 'rooms.veiw'), /Permiso desconocido/);
  });

  it('cada permiso referencia solo roles existentes', () => {
    for (const [permission, roles] of Object.entries(PERMISSIONS)) {
      for (const role of roles) assert.ok(ROLES.includes(role), `${permission}: ${role}`);
    }
  });
});

describe('safeLocalPath (evita redirecciones abiertas)', () => {
  const cases = [
    ['/rooms?floor=2', '/rooms?floor=2'],
    ['/dashboard', '/dashboard'],
    ['//evil.example', '/dashboard'],
    ['https://evil.example', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    ['rooms', '/dashboard'],
    [undefined, '/dashboard'],
  ];
  for (const [input, expected] of cases) {
    it(`${String(input)} → ${expected}`, () => assert.equal(safeLocalPath(input), expected));
  }
});
