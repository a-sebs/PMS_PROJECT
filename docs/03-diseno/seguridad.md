# Seguridad

## 1. Modelo de amenazas (resumen)

| Activo | Amenaza | Control principal |
| --- | --- | --- |
| Cuentas del personal | Fuerza bruta, robo de sesión | Limitación de intentos, scrypt, cookie `HttpOnly` + `SameSite`, regeneración de sesión |
| Datos de huéspedes | Acceso por roles no autorizados | Permisos verificados en el servidor en cada ruta, acción y canal |
| Inventario y reservas | Doble venta, cambios perdidos | Restricción de exclusión, transacciones, concurrencia optimista |
| Bitácora | Manipulación para ocultar acciones | Trigger que impide `UPDATE`/`DELETE` |
| Sesión del navegador | CSRF, XSS, secuestro de WebSocket | Token CSRF, escape de EJS + CSP, verificación de `Origin` en Socket.IO |

## 2. Controles según OWASP Top 10:2025

| Riesgo OWASP 2025 | Cómo lo mitigamos | Dónde |
| --- | --- | --- |
| **A01 Broken Access Control** | Permisos (no roles sueltos) verificados en cada ruta y canal; la vista solo muestra acciones permitidas, pero el servidor vuelve a verificar | `src/core/permissions.js`, `requirePermission()`, `src/realtime/channels.js` |
| **A02 Security Misconfiguration** | Variables de entorno validadas al arrancar; Helmet con CSP estricta; `x-powered-by` desactivado; errores sin *stack* en producción | `src/config/env.js`, `src/app.js` |
| **A03 Software Supply Chain Failures** | `package-lock.json` versionado, `npm ci` en CI, `npm audit` y Dependabot | `.github/` |
| **A04 Cryptographic Failures** | Contraseñas con `scrypt` + sal aleatoria; comparación en tiempo constante; tokens de recuperación aleatorios (32 bytes) guardados como SHA-256; HTTPS y cookie `Secure` en producción | `src/modules/auth/password.js`, `auth.service.js` |
| **A05 Injection** | SQL siempre parametrizado (`$1`, `$2`) y comodines de `LIKE` escapados en la búsqueda; EJS escapa con `<%= %>`; en el cliente se usa `textContent` | Repositorios, vistas, `public/js` |
| **A06 Insecure Design** | Máquinas de estado explícitas, reglas críticas en la base de datos, comandos solo por HTTP | [Máquinas de estado](maquinas-de-estado.md), [modelo de datos](modelo-de-datos.md) |
| **A07 Authentication Failures** | Mensaje de error genérico, 10 intentos / 15 min por IP, sesión regenerada al iniciar, expiración por inactividad, cierre de sesión que desconecta sockets; política de contraseñas; recuperación con enlace de un solo uso que caduca y cierra las demás sesiones | `src/modules/auth` |
| **A08 Software or Data Integrity Failures** | CI obligatorio para integrar; migraciones versionadas e inmutables; bitácora de solo inserción | `.github/workflows/ci.yml`, `migrations/` |
| **A09 Security Logging & Alerting Failures** | Bitácora de acciones de negocio + logs estructurados con id de petición | `audit_events`, `pino-http` |
| **A10 Mishandling of Exceptional Conditions** | Manejador de errores central; errores de negocio tipados; transacciones con `ROLLBACK`; apagado ordenado | `src/http/middlewares/error-handler.js`, `src/db/database.js`, `src/main.js` |

## 3. Detalles de implementación

### Sesiones

- `express-session` con almacén en PostgreSQL (`user_sessions`): las sesiones sobreviven a reinicios
  y no hay estado en memoria.
- Cookie `pms.sid`: `HttpOnly`, `SameSite=Lax`, `Secure` en producción, expiración deslizante de 8 h.
- Al iniciar sesión se llama a `req.session.regenerate()` para evitar fijación de sesión.
- En cada petición se recarga el usuario: si fue desactivado, la sesión se destruye al instante.

### CSRF

Patrón *synchronizer token*: un token aleatorio por sesión, incluido en cada formulario
(`_csrf`) y en la etiqueta `<meta name="csrf-token">` para `fetch` (cabecera `X-CSRF-Token`). Toda
petición que no sea `GET`/`HEAD`/`OPTIONS` sin token válido recibe 403.

### Content Security Policy

`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `object-src 'none'`,
`frame-ancestors 'none'`. Consecuencia práctica: **no se permite JavaScript ni CSS en línea**; los
datos que el JS necesita viajan en atributos `data-*`.

### Contraseñas

`scrypt` del módulo `node:crypto` (sin dependencias nativas), sal de 16 bytes, clave de 64 bytes y
formato autodescriptivo `scrypt$N$r$p$sal$hash` para poder subir el costo en el futuro sin romper
las contraseñas existentes.

### Registro (HU-39)

- Validación en el servidor de todos los campos (la del navegador solo orienta).
- La cuenta nueva recibe el rol Recepción, pero nace **inactiva**: no puede iniciar sesión hasta que
  administración la active en `/users`. Sin esta aprobación, cualquier persona de internet podría
  registrarse y ver datos personales de huéspedes. Nadie puede elegir su rol al registrarse.
  Administración recibe un aviso en vivo y puede activar la cuenta, cambiar su rol o rechazarla.
- Límite de 10 cuentas creadas por hora desde una misma IP.
- *Riesgo aceptado:* el registro dice "ya existe una cuenta con este correo" (enumeración de
  cuentas). Es la práctica habitual en un registro y se mitiga con el límite de frecuencia; el
  login y la recuperación de clave, en cambio, nunca revelan si un correo existe.

### Recuperación de clave (HU-40)

| Amenaza | Control |
| --- | --- |
| Robo de la base de datos | Se guarda el SHA-256 del token, nunca el token |
| Adivinar un token | 32 bytes aleatorios (256 bits) de `crypto.randomBytes` |
| Reutilizar un enlace | `used_at` se marca dentro de una transacción con `SELECT … FOR UPDATE` |
| Enlace viejo olvidado en un correo | Caduca a los 30 minutos y pedir otro anula los anteriores |
| Descubrir qué correos existen | Misma respuesta exista o no la cuenta |
| Envenenar el enlace con una cabecera `Host` falsa | El enlace se arma con `APP_URL`, nunca con la cabecera `Host` |
| Token filtrado en los logs | El serializador de `pino-http` oculta `/reset-password/<token>` |
| Sesión robada antes del cambio | Restablecer la clave borra todas las sesiones de la cuenta y desconecta sus sockets |
| Inundar a alguien de correos | 10 solicitudes / 15 min por IP |

El envío de correos es **simulado** (lo permite la guía): queda en la tabla `email_outbox` y en
desarrollo se lee en `/dev/correos`. Esa página nunca se monta en producción salvo que se active a
propósito con `SHOW_MAIL_OUTBOX=true` (solo para una demo controlada: expone los enlaces).

### Socket.IO

- Autenticación con la misma sesión de Express en el handshake; sin sesión válida, `connect_error`.
- Verificación del `Origin` en el handshake (otro sitio no puede abrir un socket con la cookie).
- Cada `channel:join` y `chat:join` verifica el permiso; cada `chat:send` lo vuelve a verificar.
- Los eventos que llegan del cliente se validan con zod y el texto se sanea: sin caracteres de
  control ni marcas invisibles de dirección (*Trojan Source*), máximo 1000 caracteres.
- Límite de 8 mensajes cada 10 s por persona y paquetes de máximo 16 KB (`maxHttpBufferSize`).
- Primero se guarda, luego se difunde: nunca se anuncia un mensaje que no quedó registrado.
- Los eventos difundidos no contienen datos que un miembro de la sala no pueda ver.
- En producción se sirve por HTTPS, así que el socket usa `wss://`.

### Logs

Las peticiones se registran con método, URL y código de estado, **sin cabeceras** (llevan la cookie
de sesión) y con los tokens de recuperación ocultos. Los correos simulados se registran sin el
enlace.

## 4. Lista de verificación por PR

- [ ] ¿Toda ruta nueva tiene `requirePermission(...)`?
- [ ] ¿Toda acción nueva valida la entrada con un esquema?
- [ ] ¿Todo SQL nuevo usa parámetros y no concatena texto?
- [ ] ¿Las vistas usan `<%= %>` para datos del usuario? (`<%-` solo para HTML confiable, como includes)
- [ ] ¿El JS del cliente usa `textContent` para datos dinámicos?
- [ ] ¿Los eventos nuevos de Socket.IO están en el [contrato](tiempo-real.md) con su canal y permiso?
- [ ] ¿Los secretos nuevos están en `.env.example` (sin valores reales) y no en el código?
- [ ] ¿Los formularios nuevos validan en el navegador **y** en el servidor con la misma regla?
- [ ] ¿Los enlaces que se envían por correo usan `APP_URL`?
