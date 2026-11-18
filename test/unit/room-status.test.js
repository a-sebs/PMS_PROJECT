import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROLES } from '#src/core/permissions.js';
import {
  HOUSEKEEPING_STATUSES,
  housekeepingMachine,
  statusCode,
  summarize,
} from '#src/modules/rooms/room-status.js';

const room = (occupancyStatus, housekeepingStatus, isOutOfOrder = false) => ({
  occupancyStatus,
  housekeepingStatus,
  isOutOfOrder,
});

describe('statusCode (estado combinado de la industria)', () => {
  const cases = [
    [room('vacant', 'inspected'), 'VI'],
    [room('vacant', 'clean'), 'VC'],
    [room('vacant', 'dirty'), 'VD'],
    [room('vacant', 'cleaning'), 'VD'],
    [room('occupied', 'clean'), 'OC'],
    [room('occupied', 'inspected'), 'OC'],
    [room('occupied', 'dirty'), 'OD'],
    [room('occupied', 'cleaning'), 'OD'],
    [room('vacant', 'clean', true), 'OOO'],
    [room('vacant', 'dirty', true), 'OOO'],
  ];

  for (const [input, expected] of cases) {
    it(`${input.occupancyStatus} + ${input.housekeepingStatus}${input.isOutOfOrder ? ' + OOO' : ''} → ${expected}`, () => {
      assert.equal(statusCode(input), expected);
    });
  }
});

describe('máquina de estados de limpieza (docs/03-diseno/maquinas-de-estado.md § 1.1)', () => {
  // La tabla del documento de diseño, tal cual. Si alguien cambia la máquina, esta prueba obliga a
  // actualizar también la documentación.
  const ALLOWED = {
    'dirty→cleaning': ['housekeeping', 'admin'],
    'cleaning→clean': ['housekeeping', 'admin'],
    'cleaning→dirty': ['housekeeping', 'admin'],
    'clean→inspected': ['admin'],
    'clean→dirty': ['front_desk', 'admin'],
    'inspected→dirty': ['front_desk', 'admin'],
  };

  it('permite exactamente las transiciones documentadas, para exactamente los roles documentados', () => {
    for (const from of HOUSEKEEPING_STATUSES) {
      for (const to of HOUSEKEEPING_STATUSES) {
        for (const role of ROLES) {
          const allowedRoles = ALLOWED[`${from}→${to}`] ?? [];
          const { ok } = housekeepingMachine.check(from, to, role);
          assert.equal(ok, allowedRoles.includes(role), `${role}: ${from} → ${to}`);
        }
      }
    }
  });

  it('solo se inspeccionan habitaciones vacantes (guard)', () => {
    const occupied = room('occupied', 'clean');
    const vacant = room('vacant', 'clean');
    assert.equal(housekeepingMachine.check('clean', 'inspected', 'admin', vacant).ok, true);
    const blocked = housekeepingMachine.check('clean', 'inspected', 'admin', occupied);
    assert.equal(blocked.reason, 'guard_failed');
    assert.match(blocked.message, /vacantes/);
    assert.deepEqual(
      housekeepingMachine.availableTransitions('clean', 'admin', occupied).map((t) => t.to),
      ['dirty'],
    );
  });

  it('mantenimiento no tiene ninguna transición de limpieza', () => {
    for (const from of HOUSEKEEPING_STATUSES) {
      assert.deepEqual(housekeepingMachine.availableTransitions(from, 'maintenance'), []);
    }
  });
});

describe('summarize', () => {
  const rooms = [
    room('vacant', 'inspected'), // VI → ready
    room('vacant', 'clean'), // VC → ready
    room('vacant', 'dirty'), // VD → dirty
    room('vacant', 'cleaning'), // VD → dirty, en limpieza
    room('occupied', 'clean'), // OC → occupied
    room('occupied', 'dirty'), // OD → dirty + occupied
    room('vacant', 'clean', true), // OOO
  ];

  it('cuenta por filtro, con OD en "por limpiar" y en "ocupadas"', () => {
    const { byGroup, total } = summarize(rooms);
    assert.equal(total, 7);
    assert.deepEqual(byGroup, { ready: 2, dirty: 3, occupied: 2, ooo: 1 });
  });

  it('la partición suma el total y la ocupación excluye las habitaciones fuera de servicio', () => {
    const { partition, total, occupancyRate, cleaningNow } = summarize(rooms);
    assert.deepEqual(partition, { ready: 2, vacantDirty: 2, occupied: 2, ooo: 1 });
    assert.equal(
      Object.values(partition).reduce((a, b) => a + b, 0),
      total,
    );
    assert.equal(occupancyRate, 2 / 6);
    assert.equal(cleaningNow, 1);
  });

  it('un hotel vacío no divide por cero', () => {
    assert.equal(summarize([]).occupancyRate, 0);
  });
});
