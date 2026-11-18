import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRateLimiter } from '#src/core/rate-limiter.js';
import { sanitizeMessage, sendMessageSchema } from '#src/modules/chat/chat.schemas.js';
import { createPresence } from '#src/realtime/presence.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('saneamiento de mensajes del chat', () => {
  it('quita caracteres invisibles y de control, conserva los saltos de línea', () => {
    const zeroWidth = String.fromCharCode(0x200b);
    const rtlOverride = String.fromCharCode(0x202e);
    const bell = String.fromCharCode(0x07);
    const raw = `  Hola${zeroWidth}${rtlOverride}${bell}\r\n\r\n\r\n\r\nmundo\t!  `;
    assert.equal(sanitizeMessage(raw), 'Hola\n\nmundo !');
  });

  it('no altera el HTML: se guarda como texto y se muestra escapado', () => {
    assert.equal(sanitizeMessage('<b>hola</b>'), '<b>hola</b>');
  });

  it('valida sala y longitud', () => {
    assert.equal(sendMessageSchema.safeParse({ room: 'general', body: '   ' }).success, false);
    assert.equal(sendMessageSchema.safeParse({ room: 'secreta', body: 'hola' }).success, false);
    assert.equal(
      sendMessageSchema.safeParse({ room: 'general', body: 'x'.repeat(1001) }).success,
      false,
    );
    assert.equal(
      sendMessageSchema.safeParse({ room: 'general', body: 'x'.repeat(1000) }).success,
      true,
    );
  });
});

describe('límite de frecuencia con ventana deslizante', () => {
  it('permite `max` acciones por ventana y libera las viejas', () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => now });
    assert.equal(limiter.consume('ana'), true);
    assert.equal(limiter.consume('ana'), true);
    assert.equal(limiter.consume('ana'), false);
    assert.equal(limiter.consume('luis'), true, 'cada clave tiene su propio contador');
    now = 1001;
    assert.equal(limiter.consume('ana'), true);
  });
});

describe('presencia (usuarios conectados)', () => {
  it('una persona con varias pestañas cuenta una vez y no "parpadea" al navegar', async () => {
    const changes = [];
    const presence = createPresence({ graceMs: 30, onChange: (online) => changes.push(online) });
    const ana = { id: 1, name: 'Ana', role: 'front_desk' };

    presence.connect(ana, 's1');
    presence.connect(ana, 's2');
    assert.equal(changes.length, 1);
    assert.deepEqual(
      presence.list().map((u) => u.name),
      ['Ana'],
    );

    // Cambio de página: se cierra un socket y se abre otro dentro del margen.
    presence.disconnect(1, 's1');
    presence.disconnect(1, 's2');
    presence.connect(ana, 's3');
    await wait(50);
    assert.equal(changes.length, 1, 'no hubo cambio visible');

    // Le cambian el rol: al reconectarse, la lista muestra el rol nuevo.
    presence.disconnect(1, 's3');
    presence.connect({ ...ana, role: 'housekeeping' }, 's4');
    assert.equal(changes.length, 2);
    assert.equal(presence.list()[0].roleLabel, 'Limpieza');

    presence.disconnect(1, 's4');
    await wait(50);
    assert.equal(changes.length, 3);
    assert.deepEqual(changes.at(-1), []);
    presence.clear();
  });
});
