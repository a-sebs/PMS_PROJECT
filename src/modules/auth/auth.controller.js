import { ConflictError, ValidationError } from '#src/core/errors.js';
import { ROLE_LABELS, SIGNUP_ROLE } from '#src/core/permissions.js';
import { parseInput } from '#src/core/validation.js';
import { fieldErrorsFrom, pickValues } from '#src/http/forms.js';
import { safeLocalPath, sessionOps } from '#src/http/helpers.js';
import { SESSION_COOKIE_NAME } from '#src/http/session.js';
import { PASSWORD_RULES } from '#src/public/js/lib/validators.js';
import { RESET_TOKEN_TTL_MINUTES } from './auth.service.js';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  resetTokenSchema,
  signupSchema,
} from './auth.schemas.js';

const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.';
const RESET_LINK_SENT =
  'Si el correo pertenece a una cuenta activa, te enviamos un enlace para restablecer la clave. Revisa tu bandeja de entrada.';

/**
 * @param {{
 *   authService: ReturnType<import('./auth.service.js').createAuthService>,
 *   realtime: import('#src/realtime/gateway.js').RealtimeGateway,
 *   demoUsers: Array<{ email: string, role: string }>,
 *   showMailOutbox?: boolean,
 * }} deps
 */
export function createAuthController({ authService, realtime, demoUsers, showMailOutbox = false }) {
  const authPage = (res, view, { status = 200, ...data }) =>
    res.status(status).renderPage(view, {
      layout: 'layouts/auth',
      scripts: ['/js/forms.js'],
      passwordRules: PASSWORD_RULES,
      showMailOutbox,
      ...data,
    });

  function renderLogin(res, { status = 200, email = '', error = null } = {}) {
    authPage(res, 'auth/login', { status, title: 'Iniciar sesión', email, error, demoUsers });
  }

  function renderSignup(res, { status = 200, values = {}, errors = {} } = {}) {
    authPage(res, 'auth/signup', {
      status,
      title: 'Crear cuenta',
      values: { fullName: '', email: '', ...values },
      errors,
      roleLabel: ROLE_LABELS[SIGNUP_ROLE],
    });
  }

  /** Inicia la sesión de `user` con un id de sesión nuevo (evita la fijación de sesión). */
  async function startSession(req, user) {
    await sessionOps.regenerate(req);
    req.session.userId = user.id;
  }

  /** Token del enlace si tiene el formato correcto (si no, se trata igual que uno caducado). */
  const tokenFrom = (req) => {
    const parsed = resetTokenSchema.safeParse(req.params.token);
    return parsed.success ? parsed.data : null;
  };

  return {
    showLogin(req, res) {
      if (req.user) return res.redirect('/dashboard');
      renderLogin(res);
    },

    async login(req, res) {
      let credentials;
      try {
        credentials = parseInput(loginSchema, req.body);
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        return renderLogin(res, { status: 422, email: req.body?.email ?? '', error: err.message });
      }

      const user = await authService.authenticate(credentials.email, credentials.password);
      if (!user) {
        return renderLogin(res, {
          status: 401,
          email: credentials.email,
          error: INVALID_CREDENTIALS,
        });
      }

      const returnTo = safeLocalPath(req.session.returnTo);
      await startSession(req, user);
      await sessionOps.save(req);
      req.log?.info({ userId: user.id }, 'inicio de sesión');
      res.redirect(303, returnTo);
    },

    async logout(req, res) {
      const sessionId = req.sessionID;
      const userId = req.session.userId;
      await sessionOps.destroy(req);
      res.clearCookie(SESSION_COOKIE_NAME);
      realtime.endSession(sessionId, 'logout');
      req.log?.info({ userId }, 'cierre de sesión');
      res.redirect(303, '/login');
    },

    /** Respuesta del limitador de intentos de login. */
    tooManyAttempts(req, res) {
      renderLogin(res, {
        status: 429,
        email: req.body?.email ?? '',
        error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.',
      });
    },

    // ── HU-39 · Registro ─────────────────────────────────────────────────────────────────────

    showSignup(req, res) {
      if (req.user) return res.redirect('/dashboard');
      renderSignup(res);
    },

    async signup(req, res) {
      const values = pickValues(req.body, ['fullName', 'email']);
      let input;
      try {
        input = parseInput(signupSchema, req.body);
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        return renderSignup(res, { status: 422, values, errors: fieldErrorsFrom(err) });
      }

      let user;
      try {
        user = await authService.register(input);
      } catch (err) {
        if (!(err instanceof ConflictError) || err.code !== 'EMAIL_TAKEN') throw err;
        return renderSignup(res, { status: 409, values, errors: { email: err.message } });
      }

      // La cuenta queda pendiente de aprobación: no se inicia sesión hasta que administración la
      // active en /users.
      req.flash(
        'success',
        `Gracias, ${user.fullName.split(' ')[0]}. Tu cuenta de ${ROLE_LABELS[user.role]} quedó pendiente: podrás iniciar sesión cuando administración la active.`,
      );
      await sessionOps.save(req);
      req.log?.info({ userId: user.id }, 'registro de usuario (pendiente de aprobación)');
      res.redirect(303, '/login');
    },

    signupLimited(req, res) {
      renderSignup(res, {
        status: 429,
        values: pickValues(req.body, ['fullName', 'email']),
        errors: { form: 'Se crearon demasiadas cuentas desde esta conexión. Inténtalo más tarde.' },
      });
    },

    // ── HU-40 · Recuperación de clave ────────────────────────────────────────────────────────

    showForgotPassword(req, res) {
      authPage(res, 'auth/forgot-password', {
        title: 'Recuperar clave',
        values: { email: '' },
        errors: {},
        sent: false,
      });
    },

    async forgotPassword(req, res) {
      const values = pickValues(req.body, ['email']);
      let input;
      try {
        input = parseInput(forgotPasswordSchema, req.body);
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        return authPage(res, 'auth/forgot-password', {
          status: 422,
          title: 'Recuperar clave',
          values,
          errors: fieldErrorsFrom(err),
          sent: false,
        });
      }

      const { sent } = await authService.requestPasswordReset(input.email);
      req.log?.info({ sent }, 'solicitud de recuperación de clave');
      // Misma respuesta exista o no la cuenta: no revelamos qué correos están registrados.
      authPage(res, 'auth/forgot-password', {
        title: 'Revisa tu correo',
        values: { email: '' },
        errors: {},
        sent: true,
        message: RESET_LINK_SENT,
        ttlMinutes: RESET_TOKEN_TTL_MINUTES,
      });
    },

    forgotPasswordLimited(req, res) {
      authPage(res, 'auth/forgot-password', {
        status: 429,
        title: 'Recuperar clave',
        values: pickValues(req.body, ['email']),
        errors: { form: 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.' },
        sent: false,
      });
    },

    resetPasswordLimited(req, res) {
      authPage(res, 'auth/reset-password', {
        status: 429,
        title: 'Elige una nueva clave',
        valid: true,
        email: '',
        token: tokenFrom(req),
        errors: { form: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
      });
    },

    async showResetPassword(req, res) {
      const token = tokenFrom(req);
      const valid = token ? await authService.findResetToken(token) : null;
      res.set('Cache-Control', 'no-store');
      authPage(res, 'auth/reset-password', {
        status: valid ? 200 : 410,
        title: valid ? 'Elige una nueva clave' : 'Enlace no válido',
        valid: Boolean(valid),
        email: valid?.email ?? '',
        token,
        errors: {},
      });
    },

    async resetPassword(req, res) {
      const token = tokenFrom(req);
      const valid = token ? await authService.findResetToken(token) : null;
      const renderReset = (status, errors) =>
        authPage(res, 'auth/reset-password', {
          status,
          title: valid ? 'Elige una nueva clave' : 'Enlace no válido',
          valid: Boolean(valid),
          email: valid?.email ?? '',
          token,
          errors,
        });

      if (!valid) return renderReset(410, {});

      let input;
      try {
        input = parseInput(resetPasswordSchema, req.body);
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        return renderReset(422, fieldErrorsFrom(err));
      }

      const result = await authService.resetPassword(token, input.password);
      if (!result) return renderReset(410, {});

      // Si quien restablece tenía una sesión abierta en este navegador, también se cierra.
      if (req.session.userId) await sessionOps.regenerate(req);
      req.flash('success', 'Tu clave se actualizó. Ya puedes iniciar sesión con la nueva.');
      res.redirect(303, '/login');
    },
  };
}
