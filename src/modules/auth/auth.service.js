import { createHash, randomBytes } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '#src/core/errors.js';
import { ROLE_LABELS, ROLES, SIGNUP_ROLE } from '#src/core/permissions.js';
import { hashPassword, needsRehash, verifyPassword } from './password.js';
import * as resets from './password-reset.repository.js';
import * as users from './users.repository.js';

/** Minutos que vale un enlace de recuperación de clave (HU-40). */
export const RESET_TOKEN_TTL_MINUTES = 30;

const sha256 = (value) => createHash('sha256').update(value).digest();
const firstName = (fullName) => fullName.split(' ')[0];

/**
 * Cuentas del personal: inicio de sesión, registro, recuperación de clave y administración.
 *
 * @param {{
 *   db: ReturnType<import('#src/db/database.js').createDatabase>,
 *   events?: ReturnType<import('#src/core/events.js').createEventBus>,
 *   auditService?: ReturnType<import('../audit/audit.service.js').createAuditService>,
 *   mailService?: ReturnType<import('../mail/mail.service.js').createMailService>,
 *   appUrl?: string,
 * }} deps
 */
export function createAuthService({ db, events, auditService, mailService, appUrl = '' }) {
  // Hash "señuelo": si el correo no existe igual se calcula un scrypt, para que el tiempo de
  // respuesta no revele qué correos están registrados.
  let decoyHash;
  const getDecoyHash = async () =>
    (decoyHash ??= await hashPassword('señuelo-para-tiempo-constante'));

  /** Publica eventos de dominio después del COMMIT (nunca antes). */
  function publish(type, payload, item) {
    events?.publish(type, payload);
    if (item) events?.publish('activity.recorded', { item });
  }

  return {
    /**
     * @param {string} email
     * @param {string} password
     * @returns {Promise<import('./users.repository.js').User | null>} null si las credenciales no
     *   son válidas o el usuario está inactivo (sin distinguir cuál, a propósito).
     */
    async authenticate(email, password) {
      const user = await users.findByEmailWithHash(db.pool, email.trim());
      if (!user) {
        await verifyPassword(password, await getDecoyHash());
        return null;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid || !user.isActive) return null;

      const rehash = needsRehash(user.passwordHash) ? await hashPassword(password) : null;
      await users.recordLogin(db.pool, user.id, rehash);

      const { passwordHash: _passwordHash, ...publicUser } = user;
      return publicUser;
    },

    /** Usuario activo por id, o null si no existe o fue desactivado. */
    getActiveUser(id) {
      return users.findActiveById(db.pool, id);
    },

    /**
     * HU-39 · Crea una cuenta con el rol de recepción, INACTIVA hasta que administración la
     * apruebe: así nadie ajeno al hotel ve datos de huéspedes solo por registrarse. Los datos ya
     * vienen validados por el esquema; aquí se aplican las reglas que dependen de la base de datos.
     * @param {{ fullName: string, email: string, password: string }} input
     * @throws {ConflictError} EMAIL_TAKEN si el correo ya tiene cuenta.
     */
    async register({ fullName, email, password }) {
      const emailTaken = () =>
        new ConflictError('Ya existe una cuenta con este correo.', { code: 'EMAIL_TAKEN' });

      // Revisar antes de calcular el hash ahorra un scrypt (~50 ms) en el caso repetido.
      if (await users.findByEmailWithHash(db.pool, email)) throw emailTaken();
      const passwordHash = await hashPassword(password);

      let result;
      try {
        result = await db.transaction(async (client) => {
          const user = await users.insertUser(client, {
            email,
            fullName,
            role: SIGNUP_ROLE,
            passwordHash,
            isActive: false,
          });
          const item = await auditService?.record(client, {
            actorId: user.id,
            action: 'user.registered',
            entityType: 'user',
            entityId: user.id,
            summary: `${user.fullName} creó su cuenta (${ROLE_LABELS[user.role]}, pendiente de aprobación)`,
            data: { role: user.role },
          });
          return { user, item };
        });
      } catch (err) {
        // Dos registros simultáneos con el mismo correo: gana uno, el otro choca con el índice.
        if (err.code === '23505') throw emailTaken();
        throw err;
      }

      publish('user.registered', { user: result.user }, result.item);
      return result.user;
    },

    /**
     * HU-40 · Si el correo pertenece a una cuenta activa, genera un enlace de un solo uso y lo
     * envía por el transporte configurado. Quien llama responde lo mismo exista o no la cuenta.
     * @param {string} email
     * @returns {Promise<{ sent: boolean }>} `sent` es solo para pruebas y registros internos.
     */
    async requestPasswordReset(email) {
      const user = await users.findByEmailWithHash(db.pool, email);
      if (!user || !user.isActive) return { sent: false };

      const token = randomBytes(32).toString('base64url');
      const link = `${appUrl}/reset-password/${token}`;

      let queued = null;
      await db.transaction(async (client) => {
        await resets.invalidatePending(client, user.id);
        await resets.insert(client, {
          userId: user.id,
          tokenHash: sha256(token),
          ttlMinutes: RESET_TOKEN_TTL_MINUTES,
        });
        // Dentro de la transacción solo se ENCOLA el correo. La entrega va después del COMMIT:
        // así un fallo del proveedor no revierte el token que el usuario ya tiene en su enlace.
        queued =
          (await mailService?.queue(
            {
              to: user.email,
              subject: 'Restablece tu clave de Aurora PMS',
              body: [
                `Hola, ${firstName(user.fullName)}:`,
                '',
                'Recibimos una solicitud para restablecer la clave de tu cuenta de Aurora PMS.',
                'Abre este enlace para elegir una nueva:',
                '',
                link,
                '',
                `El enlace caduca en ${RESET_TOKEN_TTL_MINUTES} minutos y solo se puede usar una vez.`,
                'Si no pediste este cambio, ignora este correo: tu clave actual sigue funcionando.',
              ].join('\n'),
              linkUrl: link,
            },
            client,
          )) ?? null;
      });
      if (queued) await mailService.deliver(queued);
      return { sent: true };
    },

    /**
     * HU-40 · Token vigente del enlace, o null si no existe, caducó o ya se usó.
     * @param {string} token
     */
    findResetToken(token) {
      return resets.findValid(db.pool, sha256(token));
    },

    /**
     * HU-40 · Cambia la clave con un token vigente, lo marca como usado y cierra todas las
     * sesiones abiertas de esa cuenta.
     * @param {string} token
     * @param {string} newPassword
     * @returns {Promise<{ userId: number } | null>} null si el token ya no sirve.
     */
    async resetPassword(token, newPassword) {
      const tokenHash = sha256(token);
      // Verificar primero (consulta barata) evita calcular un scrypt por cada token inventado.
      if (!(await resets.findValid(db.pool, tokenHash))) return null;
      const passwordHash = await hashPassword(newPassword);

      const result = await db.transaction(async (client) => {
        const valid = await resets.findValidForUpdate(client, tokenHash);
        if (!valid) return null;
        await resets.markUsed(client, valid.id);
        await resets.invalidatePending(client, valid.userId);
        await users.updatePasswordHash(client, valid.userId, passwordHash);
        await users.deleteSessionsOfUser(client, valid.userId);
        const item = await auditService?.record(client, {
          actorId: valid.userId,
          action: 'user.password_reset',
          entityType: 'user',
          entityId: valid.userId,
          summary: `${valid.fullName} restableció su clave`,
        });
        return { userId: valid.userId, item };
      });

      if (!result) return null;
      publish('user.password_reset', { userId: result.userId }, result.item);
      return { userId: result.userId };
    },

    /** HU-03 · Lista del personal para la administración. */
    listUsers() {
      return users.listUsers(db.pool);
    },

    /**
     * HU-03 · Cambia el rol o activa/desactiva una cuenta.
     * Reglas: nadie cambia su propia cuenta y siempre queda al menos un administrador activo.
     * @param {{ userId: number, role: string, isActive: boolean,
     *           actor: { id: number, fullName: string } }} input
     */
    async updateUserAccess({ userId, role, isActive, actor }) {
      if (!ROLES.includes(role)) throw new NotFoundError('El rol no existe.');
      if (userId === actor.id) {
        throw new ForbiddenError(
          'No puedes cambiar tu propio rol ni desactivar tu propia cuenta.',
          'SELF_CHANGE',
        );
      }

      const result = await db.transaction(async (client) => {
        const before = await users.lockById(client, userId);
        if (!before) throw new NotFoundError('La cuenta no existe.');
        if (before.role === role && before.isActive === isActive) return { before, after: before };

        const after = await users.updateAccess(client, userId, { role, isActive });
        if ((await users.countActiveAdmins(client)) === 0) {
          throw new ConflictError('Debe quedar al menos un administrador activo.', {
            code: 'LAST_ADMIN',
          });
        }

        const changes = [];
        if (before.role !== after.role) {
          changes.push(`rol: ${ROLE_LABELS[before.role]} → ${ROLE_LABELS[after.role]}`);
        }
        if (before.isActive !== after.isActive) {
          changes.push(after.isActive ? 'reactivada' : 'desactivada');
        }
        const item = await auditService?.record(client, {
          actorId: actor.id,
          action: 'user.access_changed',
          entityType: 'user',
          entityId: userId,
          summary: `${actor.fullName} actualizó la cuenta de ${after.fullName} (${changes.join(', ')})`,
          data: {
            before: { role: before.role, isActive: before.isActive },
            after: { role, isActive },
          },
        });
        return { before, after, item };
      });

      if (result.item) {
        publish('user.access_changed', { before: result.before, after: result.after }, result.item);
      }
      return result.after;
    },
  };
}
