import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { createEventBus } from '#src/core/events.js';

const nextTick = () => new Promise((resolve) => setImmediate(resolve));

describe('bus de eventos de dominio', () => {
  it('entrega el evento con id, tipo, fecha y payload', async () => {
    const bus = createEventBus();
    const received = [];
    bus.subscribe('room.status_changed', (event) => received.push(event));

    const published = bus.publish('room.status_changed', { roomId: 7 });
    await nextTick();

    assert.equal(received.length, 1);
    assert.equal(received[0], published);
    assert.equal(received[0].type, 'room.status_changed');
    assert.deepEqual(received[0].payload, { roomId: 7 });
    assert.match(received[0].id, /^[0-9a-f-]{36}$/);
    assert.ok(!Number.isNaN(Date.parse(received[0].occurredAt)));
  });

  it('no bloquea a quien publica: los suscriptores corren después', () => {
    const bus = createEventBus();
    const handler = mock.fn();
    bus.subscribe('x.happened', handler);
    bus.publish('x.happened', {});
    assert.equal(handler.mock.callCount(), 0);
  });

  it('"*" recibe todos los eventos', async () => {
    const bus = createEventBus();
    const types = [];
    bus.subscribe('*', (event) => types.push(event.type));
    bus.publish('a.one', {});
    bus.publish('b.two', {});
    await nextTick();
    assert.deepEqual(types, ['a.one', 'b.two']);
  });

  it('un suscriptor que falla no afecta a los demás y queda registrado', async () => {
    const logger = { error: mock.fn() };
    const bus = createEventBus({ logger });
    const healthy = mock.fn();
    bus.subscribe('x.happened', () => {
      throw new Error('boom');
    });
    bus.subscribe('x.happened', healthy);

    bus.publish('x.happened', {});
    await nextTick();

    assert.equal(healthy.mock.callCount(), 1);
    assert.equal(logger.error.mock.callCount(), 1);
  });

  it('permite cancelar la suscripción', async () => {
    const bus = createEventBus();
    const handler = mock.fn();
    const unsubscribe = bus.subscribe('x.happened', handler);
    unsubscribe();
    bus.publish('x.happened', {});
    await nextTick();
    assert.equal(handler.mock.callCount(), 0);
  });
});
