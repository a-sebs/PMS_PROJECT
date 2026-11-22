# Matriz de cumplimiento de la guía del docente (primer bimestre)

Esta tabla relaciona cada requisito de la *Guía de Proyecto Web Avanzadas* con el lugar exacto
donde se cumple y la prueba automatizada que lo demuestra. Sirve para la revisión y para la defensa:
cada fila se puede mostrar en vivo.

**Caso de estudio:** hotel boutique (PYME de hospitalidad) que gestiona habitaciones, huéspedes y la
coordinación de su personal. **Entidad principal:** el huésped.

## 1. ¿Es una aplicación monolítica? (sección 3.2)

| Criterio de la guía | Cómo se cumple | Evidencia |
| --- | --- | --- |
| Las vistas HTML se renderizan en el servidor | Todas las pantallas son plantillas EJS (`src/views/`). Incluso las actualizaciones en vivo piden HTML ya renderizado al servidor ([ADR-0006](../03-diseno/adr/0006-html-over-the-wire.md)) | La aplicación funciona con JavaScript desactivado (formularios + redirección 303) |
| El enrutamiento se resuelve en el servidor | Rutas de Express en cada módulo (`*.routes.js`); no hay enrutador en el navegador | [Mapa de rutas](../03-diseno/rutas.md) |
| Lógica, persistencia y presentación en un solo proyecto desplegable | Un `package.json`, un proceso (`npm start`) y una imagen Docker | `src/main.js`, `Dockerfile` |
| El servidor WebSocket forma parte del mismo proyecto | Socket.IO se monta sobre el mismo servidor HTTP y el mismo puerto | `src/server.js` |
| Stack de la lista permitida | Fila 1 de la tabla 3.5: Node.js + Express + EJS + HTML5/CSS3/JavaScript + Socket.IO | `package.json` |
| Sin servicios externos de tiempo real | No se usa Pusher, Firebase ni Ably: Socket.IO corre dentro de la aplicación | `src/realtime/` |

"Monolito modular" ([ADR-0001](../03-diseno/adr/0001-monolito-modular-ssr.md)) describe cómo está
ordenado el código por dentro (una carpeta por tema de negocio); se despliega como **una sola
aplicación**. Esa organización prepara el segundo bimestre ([ADR-0012](../03-diseno/adr/0012-del-monolito-a-microservicios.md)).

## 2. Requisitos funcionales obligatorios (sección 3.3)

| Módulo | Requisito de la guía | Implementación | Pruebas |
| --- | --- | --- | --- |
| Registro (SignUp) | Alta de usuarios con validación de datos | `GET/POST /signup` (HU-39). Nombre y apellido, correo único, contraseña de 10+ caracteres con letras y números, confirmación. Nace inactiva (rol Recepción) hasta que administración la aprueba; administración recibe un aviso en vivo | `test/integration/signup.test.js`, `chat.test.js` (aviso) |
| Inicio de sesión (SignIn) | Credenciales contra la BD; contraseña con hash y sal | `POST /login` (HU-01). `scrypt` con sal aleatoria de 16 bytes ([ADR-0010](../03-diseno/adr/0010-scrypt-para-contrasenas.md)); la guía acepta "bcrypt, Argon2 **o equivalente**" y scrypt es la alternativa que recomienda OWASP cuando no se usa Argon2id | `auth.test.js`, `test/unit/password.test.js` |
| Recuperación de clave | Token de un solo uso y con caducidad; correo simulado | `GET/POST /forgot-password` y `/reset-password/:token` (HU-40). Token de 32 bytes, se guarda solo su SHA-256, caduca en 30 min, un solo uso, anula los anteriores y cierra las sesiones abiertas. El correo se simula en la tabla `email_outbox`, el log y la **bandeja de pruebas** `/dev/correos` | `password-reset.test.js` |
| Pantalla principal | Solo con sesión; acceso al CRUD y al chat; cerrar sesión | `GET /dashboard` con accesos a Huéspedes, Chat (mensajes sin leer y personas en línea), Habitaciones y Usuarios; botón **Salir** en todas las páginas | `auth.test.js` |
| CRUD de la entidad principal | Crear, listar con búsqueda/filtro y paginación, consultar por id, actualizar, eliminar con confirmación | `/guests` (HU-41): búsqueda por nombre, documento o correo (sin importar tildes), filtro por nacionalidad, 10/25/50 por página, `GET /guests/:id` y "Ir al huésped N.º", edición con control de concurrencia, página de confirmación antes de eliminar | `guests.test.js`, `test/unit/guest-schema.test.js` |
| Entidad con 5+ atributos validables | Tipos, formatos y longitudes | 9 atributos: tipo y número de documento (cédula con dígito verificador o pasaporte), nombres, apellidos, correo, teléfono (formato E.164), fecha de nacimiento (mayor de edad), nacionalidad (ISO 3166) y notas (máx. 500). Ver el [diccionario de datos](../03-diseno/modelo-de-datos.md#6-diccionario-de-la-entidad-principal-guests) | `guest-schema.test.js`, `validators.test.js` |
| Chat con WebSockets | Usuarios autenticados, mensajes en tiempo real, sala general, historial en BD, usuarios conectados | `/chat/:sala` (HU-42): salas General, Limpieza y Mantenimiento con permisos por rol; historial en `chat_messages`; lista "Conectados ahora"; respaldo HTTP sin JavaScript | `chat.test.js` |
| Evento o notificación adicional | Al menos uno | Varios: aviso de mensaje nuevo con insignia en el menú (`chat:unread`), aviso a administración cuando alguien crea su cuenta (`notify`), tablero de habitaciones en vivo (`room:updated`), bitácora en vivo (`activity:created`) y recarga al cambiar el rol (`session:changed`) | `chat.test.js`, `realtime.test.js` |
| Base de datos documentada | Esquema documentado | PostgreSQL con 7 migraciones SQL versionadas; diagrama entidad-relación, restricciones e índices en el [modelo de datos](../03-diseno/modelo-de-datos.md) | `migrations/` |

## 3. Requisitos no funcionales (sección 3.4)

| Requisito | Cómo se cumple | Dónde |
| --- | --- | --- |
| Validación en el cliente | Atributos HTML (`required`, `minlength`, `maxlength`, `pattern`, `type`, `min`/`max`) y `src/public/js/forms.js`, que muestra mensajes claros junto a cada campo y aplica reglas propias (dígito verificador, coincidencia de contraseñas, teléfono) | `src/public/js/forms.js` |
| Validación en el servidor | Esquemas de zod en cada entrada (formularios y eventos del socket). La misma regla de negocio vive en `src/public/js/lib/validators.js` y la usan **ambos** lados; el servidor nunca confía en el navegador | `*.schemas.js` |
| Mensajes de error claros | En español, junto al campo, con resumen al inicio del formulario y valores conservados | `src/views/partials/field.ejs` |
| Rutas protegidas | `requireAuth` y `requirePermission` en cada ruta; permisos por rol | `src/core/permissions.js` |
| Sesiones seguras | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción, regeneración del id al iniciar sesión, sesiones en PostgreSQL | `src/http/session.js` |
| Inyección SQL | Todas las consultas parametrizadas (`$1`); la búsqueda escapa los comodines de `LIKE` | `*.repository.js` |
| XSS | EJS escapa con `<%= %>`; el navegador pinta mensajes con `textContent`; CSP estricta sin JavaScript en línea | `src/app.js` |
| CSRF | Token sincronizador en cada formulario y en `fetch` | `src/http/middlewares/csrf.js` |
| Secretos en variables de entorno | `.env` (ignorado por Git), validado al arrancar; `.env.example` sin valores reales | `src/config/env.js` |
| WebSocket: autenticación en el handshake | La sesión de Express se lee en el handshake; sin usuario activo, `connect_error: unauthorized`. Además se rechaza otro `Origin` (403) | `src/realtime/socket-server.js` |
| WebSocket: validación y saneamiento | Cada evento se valida con zod; el texto se sanea (caracteres invisibles, saltos de línea) y se limita a 1000 caracteres y 8 mensajes cada 10 s; los paquetes de más de 16 KB se rechazan | `src/modules/chat/chat.schemas.js`, `chat.socket.js` |
| WebSocket seguro (wss) | En el despliegue se sirve por HTTPS; el cliente usa `wss://` automáticamente | [Despliegue](../06-despliegue/despliegue.md) |
| Navegabilidad | Menú principal con la página actual marcada, migas de pan en huéspedes, enlaces de regreso | `src/views/layouts/main.ejs` |
| Rendimiento: paginación e índices | Listado paginado; índice trigram para la búsqueda, índices por apellido y nacionalidad | `migrations/006_guests.sql` |
| Rendimiento: chat sin recargar | Socket.IO agrega cada mensaje a la conversación sin recargar la página | `src/public/js/pages/chat.js` |
| Rendimiento: medición | Lighthouse 100/100/100 y medición de consultas con y sin índices sobre 200 000 huéspedes | [Rendimiento](../05-pruebas/rendimiento.md) |
| Calidad: 5+ pruebas automatizadas | 145 pruebas (unitarias, de integración con PostgreSQL real y de tiempo real con dos clientes) | `npm test` |
| Calidad: README | Instrucciones para ejecutar el proyecto | [README](../../README.md) |

