import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineStateMachine } from '#src/core/state-machine.js';

const door = defineStateMachine({
  name: 'door',
  states: { closed: 'Cerrada', open: 'Abierta', locked: 'Con llave' },
  transitions: [
    { from: 'closed', to: 'open', action: 'Abrir', done: 'Abierta', roles: ['guest', 'staff'] },
    { from: 'open', to: 'closed', action: 'Cerrar', done: 'Cerrada', roles: ['guest', 'staff'] },
    { from: 'closed', to: 'locked', action: 'Echar llave', done: 'Con llave', roles: ['staff'] },
  ],
});

describe('defineStateMachine', () => {
  it('rechaza transiciones hacia estados no declarados', () => {
    assert.throws(
      () =>
        defineStateMachine({
          name: 'mala',
          states: { a: 'A' },
          transitions: [{ from: 'a', to: 'b', action: '', done: '', roles: [] }],
        }),
      /estado no declarado/,
    );
  });

  it('acepta una transición declarada para un rol permitido', () => {
    const result = door.check('closed', 'locked', 'staff');
    assert.equal(result.ok, true);
    assert.equal(result.transition.action, 'Echar llave');
  });

  it('distingue entre transición inexistente y rol no permitido', () => {
    assert.deepEqual(door.check('locked', 'open', 'staff'), {
      ok: false,
      reason: 'invalid_transition',
    });
    assert.deepEqual(door.check('closed', 'locked', 'guest'), {
      ok: false,
      reason: 'role_not_allowed',
    });
  });

  it('lista las transiciones disponibles según el rol, en el orden declarado', () => {
    assert.deepEqual(
      door.availableTransitions('closed', 'staff').map((t) => t.to),
      ['open', 'locked'],
    );
    assert.deepEqual(
      door.availableTransitions('closed', 'guest').map((t) => t.to),
      ['open'],
    );
  });

  it('aplica condiciones (guards) sobre la entidad y explica el motivo', () => {
    const vault = defineStateMachine({
      name: 'vault',
      states: { closed: 'Cerrada', open: 'Abierta' },
      transitions: [
        {
          from: 'closed',
          to: 'open',
          action: 'Abrir',
          done: 'Abierta',
          roles: ['staff'],
          guard: (ctx) => (ctx?.alarm ? 'La alarma está activa' : null),
        },
      ],
    });
    assert.equal(vault.check('closed', 'open', 'staff', { alarm: false }).ok, true);
    assert.deepEqual(vault.check('closed', 'open', 'staff', { alarm: true }), {
      ok: false,
      reason: 'guard_failed',
      message: 'La alarma está activa',
    });
    assert.deepEqual(vault.availableTransitions('closed', 'staff', { alarm: true }), []);
  });

  it('expone las etiquetas legibles de los estados', () => {
    assert.equal(door.label('locked'), 'Con llave');
    assert.equal(door.label('desconocido'), 'desconocido');
  });
});
