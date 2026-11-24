# Mapa de rutas HTTP

Convenciones:

- **Página**: HTML completo con layout. Con la cabecera `X-Partial: main` devuelve solo el contenido
  de `<main>` (resincronización).
- **Fragmento**: HTML parcial sin layout, para insertar en una página existente.
- **Acción**: `POST` protegido con CSRF. Si la petición trae `X-Requested-With: fetch` responde JSON
  `{ ok, html?, error? }`; si viene de un formulario sin JavaScript, redirige (303) con mensaje flash.
- Los permisos se verifican siempre en el servidor (ver [seguridad](seguridad.md)).

## Implementadas

| Método | Ruta | Permiso | Respuesta | Descripción |
| --- | --- | --- | --- | --- |
| GET | `/health` | Público | JSON | Estado del servicio y de la base de datos |
| GET | `/` | — | Redirección | A `/dashboard` con sesión, a `/login` sin ella |
| GET | `/login` | Público | Página | Formulario de inicio de sesión |
| POST | `/login` | Público (limitado a 10 intentos / 15 min por IP) | Redirección o página con error | Inicia sesión y regenera el id de sesión |
| POST | `/logout` | Con sesión | Redirección | Cierra sesión y desconecta los sockets de esa sesión |
| GET | `/dashboard` | `dashboard.view` | Página | Resumen del estado del hotel; se resincroniza en vivo |
| GET | `/rooms` | `rooms.view` | Página | Tablero de habitaciones en vivo |
| GET | `/rooms/:id/card` | `rooms.view` | Fragmento | Tarjeta de una habitación, con acciones según el rol |
| POST | `/rooms/:id/housekeeping` | `rooms.view` + rol permitido por la transición | Acción | Cambia el estado de limpieza (`status`, `version`) |
| POST | `/rooms/:id/out-of-order` | `rooms.out_of_order` | Acción | Bloquea (`action=block`, `reason`) o libera (`action=release`); requiere `version` |
| GET | `/signup` | Público | Página | Formulario de registro (HU-39) |
| POST | `/signup` | Público (10 cuentas por hora por IP) | Redirección o página con errores (422/409) | Crea la cuenta inactiva con rol Recepción (pendiente de aprobación) y redirige al login |
| GET | `/forgot-password` | Público | Página | Pedir el enlace de recuperación (HU-40) |
| POST | `/forgot-password` | Público (10 / 15 min por IP) | Página | Misma respuesta exista o no la cuenta; encola el correo y lo entrega por el transporte configurado |
| GET | `/reset-password/:token` | Público | Página (410 si el enlace no sirve) | Formulario de nueva clave |
| POST | `/reset-password/:token` | Público (10 / 15 min por IP) | Redirección al login, 422 o 410 | Cambia la clave, gasta el token y cierra las sesiones abiertas |
| GET | `/dev/correos` | Público, **solo fuera de producción** | Página | Bandeja de pruebas con los correos y su estado de entrega |
| GET | `/guests` | `guests.view` | Página | Listado paginado (`?q=`, `?nationality=`, `?page=`, `?perPage=10\|25\|50`) |
| GET | `/guests/lookup?id=` | `guests.view` | Redirección | Consulta directa por identificador |
| GET | `/guests/new` | `guests.manage` | Página | Formulario de alta |
| POST | `/guests` | `guests.manage` | Redirección o página con errores (422/409) | Registra un huésped |
| GET | `/guests/:id` | `guests.view` | Página | Ficha del huésped (404 si no existe) |
| GET | `/guests/:id/edit` | `guests.manage` | Página | Formulario de edición (incluye `version`) |
| POST | `/guests/:id` | `guests.manage` | Redirección o página con errores (422/409) | Actualiza; 409 si otra persona lo modificó antes |
| GET | `/guests/:id/delete` | `guests.manage` | Página | Confirmación antes de eliminar |
| POST | `/guests/:id/delete` | `guests.manage` | Redirección | Elimina y deja rastro en la bitácora |
| GET | `/chat` | `chat.use` | Redirección | A la sala general |
| GET | `/chat/:room` | `chat.use` + rol con acceso a la sala | Página | Sala del chat con historial, conectados y salas (`?before=` para mensajes anteriores) |
| POST | `/chat/:room/messages` | `chat.use` + rol con acceso | Redirección (o JSON con `fetch`) | Respaldo sin JavaScript; con JS el mensaje va por Socket.IO (`chat:send`) |
| GET | `/users` | `users.manage` | Página | Personal, rol y estado de cada cuenta (HU-03) |
| POST | `/users/:id` | `users.manage` | Redirección | Cambia rol y estado (nadie se cambia a sí mismo) |

Los formularios HTML solo envían `GET` y `POST`; por eso actualizar y eliminar usan `POST` con una
ruta descriptiva. En el segundo bimestre, la API para el frontend desacoplado usará `PUT`/`DELETE`.

### Respuestas de las acciones con `fetch`

| Situación | Código | Cuerpo |
| --- | --- | --- |
| Éxito | 200 | `{ ok: true, message, version, html: "<article …>" }` |
| Datos inválidos | 422 | `{ ok: false, error: { code: "VALIDATION_ERROR", message, details: { fieldErrors, formErrors } } }` |
| Sin sesión | 401 | `{ ok: false, error: { code: "UNAUTHORIZED", message } }` (el cliente redirige al login) |
| Sin permiso, o la transición no es para su rol | 403 | `{ ok: false, error: { code: "FORBIDDEN", message } }` |
| CSRF inválido | 403 | `{ ok: false, error: { code: "CSRF_INVALID", message } }` |
| No existe | 404 | `{ ok: false, error: { code: "NOT_FOUND", message } }` |
| Otra persona cambió la habitación (versión obsoleta) | 409 | `{ ok: false, error: { code: "VERSION_CONFLICT", message }, html: "<tarjeta vigente>" }` |
| La transición no existe desde el estado actual o no cumple su condición | 409 | `{ ok: false, error: { code: "INVALID_TRANSITION", message }, html }` |
| La habitación está ocupada (RN-10) | 409 | `{ ok: false, error: { code: "ROOM_OCCUPIED", message }, html }` |

## Planificadas

| Sprint | Método | Ruta | Permiso | Descripción |
| --- | --- | --- | --- | --- |
| 1 | GET/POST | `/admin/room-types`, `/admin/room-types/:id` | `rooms.manage` | CRUD de tipos de habitación |
| 1 | GET/POST | `/admin/rooms`, `/admin/rooms/:id` | `rooms.manage` | CRUD de habitaciones |
| 1 | GET | `/activity` | `activity.view` | Bitácora completa con paginación |
| 2 | GET | `/reservations/availability?from&to&guests` | `reservations.view` | Búsqueda de disponibilidad |
| 2 | POST | `/reservations/holds` | `reservations.manage` | Crea una retención de 10 min |
| 2 | DELETE | `/reservations/holds/:id` | `reservations.manage` | Libera la retención |
| 2 | POST | `/reservations` | `reservations.manage` | Confirma la reserva a partir de un hold |
| 2 | GET | `/reservations/:code` | `reservations.view` | Detalle de la reserva |
| 2 | POST | `/reservations/:code/cancel` | `reservations.manage` | Cancela |
| 2 | GET | `/reservations/rack?from` | `reservations.view` | Calendario habitaciones × días |
| 3 | GET | `/frontdesk` | `frontdesk.view` | Llegadas y salidas del día |
| 3 | POST | `/reservations/:code/check-in` | `frontdesk.operate` | Check-in |
| 3 | POST | `/reservations/:code/check-out` | `frontdesk.operate` | Check-out |
| 3 | GET | `/reservations/:code/folio` | `billing.view` | Folio de la estancia |
| 4 | GET | `/housekeeping` | `housekeeping.view` | Kanban de tareas |
| 4 | POST | `/housekeeping/tasks/:id/status` | `housekeeping.operate` | Mueve una tarea |
| 4 | GET/POST | `/maintenance/tickets` | `maintenance.view` / `maintenance.report` | Lista y creación de tickets |
| 4 | POST | `/maintenance/tickets/:id/status` | `maintenance.operate` | Cambia el estado del ticket |
| 5 | POST | `/reservations/:code/folio/lines` | `billing.post` | Cargo extra o pago simulado |
| 5 | GET | `/reservations/:code/receipt` | `billing.view` | Comprobante imprimible |
| 5 | POST | `/night-audit` | `night_audit.run` | Ejecuta el cierre del día |
| 5 | GET/POST | `/admin/users` (alta manual, edición de datos) | `users.manage` | Lo básico (rol y estado) ya está en `/users` |
