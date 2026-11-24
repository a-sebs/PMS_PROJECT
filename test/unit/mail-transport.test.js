import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createMailTransport } from '#src/modules/mail/mail.service.js';
import { createSmtpTransport } from '#src/modules/mail/transports/smtp.js';

const email = {
  to: 'huesped@ejemplo.com',
  subject: 'Restablece tu clave de Aurora PMS',
  body: 'Hola:\n\nAbre este enlace:\nhttps://aurora.test/reset-password/abc',
  linkUrl: 'https://aurora.test/reset-password/abc',
};

/** Transporte de mentira: no abre ningún socket, solo recuerda lo que le pidieron. */
function fakeNodemailer({ fail = null } = {}) {
  const sent = [];
  return {
    sent,
    sendMail: async (message) => {
      if (fail) throw new Error(fail);
      sent.push(message);
      return { messageId: '<abc@aurora.test>' };
    },
  };
}

describe('transporte SMTP', () => {
  it('envía el asunto y el cuerpo en texto plano desde MAIL_FROM', async () => {
    const transporter = fakeNodemailer();
    const transport = createSmtpTransport({
      from: 'aurora@hotel.test',
      transporter,
    });

    const result = await transport.deliver(email);

    assert.equal(result.status, 'sent');
    assert.equal(result.providerId, '<abc@aurora.test>');
    assert.equal(transporter.sent.length, 1);
    assert.deepEqual(transporter.sent[0], {
      from: 'aurora@hotel.test',
      to: 'huesped@ejemplo.com',
      subject: 'Restablece tu clave de Aurora PMS',
      text: email.body,
    });
  });

  it('propaga el fallo del proveedor para que el servicio lo anote', async () => {
    const transport = createSmtpTransport({
      from: 'aurora@hotel.test',
      transporter: fakeNodemailer({ fail: 'Invalid login: 535-5.7.8' }),
    });

    await assert.rejects(() => transport.deliver(email), /535-5\.7\.8/);
  });

  it('no se construye sin remitente: un correo sin "De" es un correo que rebota', () => {
    assert.throws(() => createSmtpTransport({ transporter: fakeNodemailer() }), /MAIL_FROM/);
  });
});

describe('selector de transporte', () => {
  it('con mailTransport=outbox devuelve el transporte simulado', () => {
    assert.equal(createMailTransport({ mailTransport: 'outbox' }).name, 'outbox');
  });

  it('con mailTransport=smtp devuelve el transporte real', () => {
    const transport = createMailTransport({
      mailTransport: 'smtp',
      mailFrom: 'aurora@hotel.test',
      smtpHost: 'smtp.ejemplo.test',
      smtpPort: 587,
      smtpUser: 'aurora@hotel.test',
      smtpPass: 'secreto',
    });
    assert.equal(transport.name, 'smtp');
  });

  it('el transporte simulado no devuelve identificador de proveedor', async () => {
    const transport = createMailTransport({ mailTransport: 'outbox' });
    assert.deepEqual(await transport.deliver(email), { status: 'simulated', providerId: null });
  });
});
