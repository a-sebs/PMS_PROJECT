import nodemailer from 'nodemailer';

/**
 * Transporte real por SMTP (nodemailer).
 *
 * `transporter` se puede inyectar para probar sin red: las pruebas le pasan un objeto con
 * `sendMail()` y así el transporte se ejercita entero sin abrir un socket.
 *
 * @param {{
 *   host?: string,
 *   port?: number,
 *   user?: string,
 *   pass?: string,
 *   from: string,
 *   transporter?: { sendMail: (message: object) => Promise<{ messageId?: string }> },
 * }} options
 */
export function createSmtpTransport({ host, port = 587, user, pass, from, transporter }) {
  if (!from) throw new Error('El transporte SMTP necesita MAIL_FROM');

  const client =
    transporter ??
    nodemailer.createTransport({
      host,
      port,
      // 465 es TLS desde el primer byte; 587 empieza en claro y sube con STARTTLS.
      secure: port === 465,
      // En 587 se exige STARTTLS: si el servidor no lo ofrece, preferimos fallar a viajar en claro.
      requireTLS: port !== 465,
      // Google muestra las contraseñas de aplicación en grupos de cuatro ("abcd efgh ...") y se
      // copian tal cual. Los espacios no forman parte de la clave, así que se descartan.
      auth: { user, pass: typeof pass === 'string' ? pass.replace(/\s+/g, '') : pass },
    });

  return {
    name: 'smtp',

    async deliver({ to, subject, body }) {
      const info = await client.sendMail({ from, to, subject, text: body });
      return { status: 'sent', providerId: info?.messageId ?? null };
    },
  };
}
