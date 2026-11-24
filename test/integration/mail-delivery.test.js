import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createLogger } from '#src/core/logger.js';
import { createMailService } from '#src/modules/mail/mail.service.js';
import { createOutboxTransport } from '#src/modules/mail/transports/outbox.js';
import { createTestApp } from '../helpers/context.js';

const logger = createLogger({ level: 'silent' });
const email = {
  to: 'huesped@ejemplo.com',
  subject: 'Restablece tu clave de Aurora PMS',
  body: 'Hola:\n\nAbre este enlace: https://aurora.test/reset-password/abc',
  linkUrl: 'https://aurora.test/reset-password/abc',
};

/** Transporte de mentira que puede fallar a voluntad. */
const fakeTransport = (outcome = {}) => ({
  name: 'fake',
  calls: 0,
  async deliver() {
    this.calls += 1;
    if (outcome.error) throw new Error(outcome.error);
    return { status: 'sent', providerId: '<id@proveedor.test>' };
  },
});

describe('entrega de correos', () => {
  let ctx;

  before(async () => {
    ctx = await createTestApp();
  });

  after(async () => {
    await ctx.close();
  });

  const rowOf = async (id) => {
    const { rows } = await ctx.db.query('SELECT * FROM email_outbox WHERE id = $1', [id]);
    return rows[0];
  };

  it('el transporte simulado deja el correo en la bandeja, sin fecha de envío', async () => {
    const mail = createMailService({ db: ctx.db, logger, transport: createOutboxTransport() });

    const saved = await mail.send(email);
    const row = await rowOf(saved.id);

    assert.equal(row.status, 'simulated');
    assert.equal(row.sent_at, null);
    assert.equal(row.provider_id, null);
    assert.equal(row.link_url, email.linkUrl);
  });

  it('con un proveedor real anota el identificador y la fecha de envío', async () => {
    const transport = fakeTransport();
    const mail = createMailService({ db: ctx.db, logger, transport });

    const saved = await mail.send(email);
    const row = await rowOf(saved.id);

    assert.equal(transport.calls, 1);
    assert.equal(row.status, 'sent');
    assert.equal(row.provider_id, '<id@proveedor.test>');
    assert.ok(row.sent_at instanceof Date);
  });

  it('si el proveedor falla, el correo queda como fallido y no se lanza el error', async () => {
    const mail = createMailService({
      db: ctx.db,
      logger,
      transport: fakeTransport({ error: 'Invalid login: 535-5.7.8' }),
    });

    const saved = await mail.queue(email);
    assert.equal((await rowOf(saved.id)).status, 'queued');

    const result = await mail.deliver(saved);
    const row = await rowOf(saved.id);

    assert.deepEqual(result, { ok: false, status: 'failed' });
    assert.equal(row.status, 'failed');
    assert.match(row.error, /535-5\.7\.8/);
    assert.equal(row.sent_at, null);
  });

  it('encolar no entrega: el estado queda en cola hasta que se llama a deliver', async () => {
    const transport = fakeTransport();
    const mail = createMailService({ db: ctx.db, logger, transport });

    const saved = await mail.queue(email);
    assert.equal(transport.calls, 0);
    assert.equal((await rowOf(saved.id)).status, 'queued');
  });
});
