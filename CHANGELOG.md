# Changelog

Todos los cambios relevantes del proyecto. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

- Preparados staging desde `develop` y la demo estable desde `main` en Render Free, cada uno conectado a su rama de PostgreSQL en el mismo proyecto Neon, migraciones al arranque
  y controles de GitHub Actions para Node 22 y 24 (ADR-0013).

### Agregado: requisitos obligatorios del primer bimestre (guía del docente)

- Registro de usuarios (HU-39) con validación en el navegador y en el servidor; la cuenta entra
  como Recepción y administración recibe un aviso en tiempo real.
- Recuperación de clave (HU-40) con token de un solo uso (solo se guarda su SHA-256), caducidad de
  30 minutos, cierre de las sesiones abiertas y correo simulado con bandeja de pruebas en
  `/dev/correos` (solo en desarrollo).
- CRUD de huéspedes (HU-41), la entidad principal: listado paginado con búsqueda sin tildes y filtro
  por nacionalidad, consulta por identificador, alta y edición con concurrencia optimista, borrado
  con confirmación. Cédula ecuatoriana con dígito verificador, teléfono en E.164 y mayoría de edad,
  con las mismas reglas en el navegador y en el servidor (`src/public/js/lib/validators.js`).
- Chat del personal en tiempo real (HU-42): salas con permisos por rol, historial en PostgreSQL,
  usuarios conectados, aviso e insignia de mensajes sin leer, respaldo sin JavaScript.
- Administración de usuarios (HU-03, parcial): cambio de rol y desactivación con efecto inmediato.
- Pantalla principal con accesos al CRUD y al chat; menú con Huéspedes, Chat y Usuarios.
- Medición de rendimiento: `npm run perf:guests` (consultas con y sin índices sobre 200 000 filas) e
  informes de Lighthouse (100/100/100).
- Documentación: matriz de cumplimiento de la guía, ADR-0011 (chat por WebSocket), ADR-0012
  (monolito ahora, microservicios en el segundo bimestre), cómo funciona Socket.IO sobre WebSocket
  con paquetes reales, diccionario de datos de la entidad principal.
- 60 pruebas nuevas (145 en total).

### Cambiado

- La búsqueda de huéspedes filtra primero con el índice trigram y ordena después (7 veces más
  rápida con 200 000 huéspedes que la primera versión).
- Respuestas comprimidas con gzip; precarga de las fuentes de la primera pantalla (CLS 0).
- Los logs ya no incluyen cabeceras HTTP (cookies) y ocultan los tokens de recuperación.
- Socket.IO rechaza paquetes de más de 16 KB.
- `APP_URL` es obligatoria en producción.

### Agregado (Sprint 0)

- Expediente del ciclo de vida en `docs/`: visión y alcance, plan de 12 semanas, registro de
  riesgos, requisitos (38 historias de usuario, requisitos no funcionales y reglas de negocio),
  glosario, arquitectura C4, modelo de datos, máquinas de estado, contrato de tiempo real, mapa de
  rutas, seguridad (OWASP Top 10:2025), UI/UX y 10 ADR; guías de desarrollo, pruebas, despliegue y
  mantenimiento.
- Esqueleto ejecutable: Express 5 + EJS + PostgreSQL + Socket.IO con la sesión compartida,
  composition root, bus de eventos de dominio, migraciones en SQL y datos de demostración.
- Inicio y cierre de sesión (HU-01) con scrypt, regeneración de sesión, límite de intentos y cierre
  de los sockets de la sesión; permisos por rol verificados en el servidor (HU-02).
- Tablero de habitaciones en vivo (HU-07) con estados VI/VC/VD/OC/OD/OOO, filtros sin JavaScript
  (`:target` + `:has()`) e indicador de conexión con resincronización (HU-34).
- Cambio de estado de limpieza (HU-08) con máquina de estados, condiciones por habitación y
  concurrencia optimista; fuera de servicio con motivo (HU-09); bitácora en vivo e inmutable (HU-30).
- Panel por rol con la composición del hotel, actualizado en vivo.
- Seguridad: CSP estricta, CSRF, cookies `HttpOnly` + `SameSite`, verificación de origen en
  Socket.IO, logs con id de petición, `GET /health`.
- 85 pruebas (unitarias, integración con PostgreSQL real, tiempo real y concurrencia), CI con
  GitHub Actions (Node 22 y 24), Dependabot, Docker Compose y Dockerfile.
