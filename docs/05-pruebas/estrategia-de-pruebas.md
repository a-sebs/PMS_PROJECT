# Estrategia de pruebas

## 1. Objetivo

Demostrar con evidencia automatizada que cada criterio de aceptación se cumple, y detectar
regresiones en cada Pull Request antes de integrarlo a `main`.

## 2. Niveles de prueba

| Nivel | Qué verifica | Herramientas | Dónde | Estado |
| --- | --- | --- | --- | --- |
| Unitarias | Lógica pura: máquinas de estado, códigos de estado, contraseñas, bus de eventos, permisos, validadores compartidos (cédula, teléfono, edad), esquema del huésped, saneamiento del chat, límite de frecuencia, presencia | `node:test` | `test/unit/` | ✅ Activas |
| Integración HTTP | Rutas + middlewares + servicios + **PostgreSQL real**: permisos, CSRF, validación, conflictos, bitácora | `node:test` + Supertest | `test/integration/` | ✅ Activas |
| Tiempo real | Autenticación del socket, canales con permisos, eventos del contrato, cierre de sesión; chat entre dos usuarios, historial, validación de mensajes, permisos por sala, límite de frecuencia, no leídos, presencia, avisos | `socket.io-client` contra un servidor real | `test/integration/realtime.test.js`, `chat.test.js` | ✅ Activas |
| Concurrencia | Peticiones simultáneas sobre la misma entidad: exactamente una gana | `Promise.all` + PostgreSQL real | `rooms.test.js` (y reservas en el Sprint 2) | ✅ Activas |
| End-to-end | Flujos completos en navegadores reales, dos usuarios a la vez | Playwright | `test/e2e/` | Sprint 6 |
| Accesibilidad | Reglas WCAG automatizables | `@axe-core/playwright` | `test/e2e/` | Sprint 6 |
| Rendimiento | Consultas con y sin índices (200 000 filas), Lighthouse | `EXPLAIN ANALYZE`, Lighthouse | `scripts/perf-guests.js`, [Rendimiento](rendimiento.md) | ✅ Medido |
| Carga | RNF-01 (latencia p95 con muchos usuarios) | `autocannon` | `scripts/` | Sprint 6 |

Las pruebas de integración usan una base de datos real (no *mocks*) porque lo que más importa probar
—restricciones, transacciones, `FOR UPDATE`— vive en PostgreSQL ([ADR-0009](../03-diseno/adr/0009-node-test-runner.md)).

## 3. Datos de prueba

- Base de datos **dedicada** (`TEST_DATABASE_URL`) cuyo nombre **debe terminar en `_test`**: las
  pruebas la vacían. Si no termina así, se niegan a correr.
- Cada archivo de pruebas migra, vacía las tablas y carga los datos de demostración
  (`src/db/seed-data.js`) con una contraseña propia de pruebas.
- Las pruebas que modifican habitaciones restauran el inventario antes de cada caso (`beforeEach`).
- Los archivos se ejecutan en serie (`--test-concurrency=1`) para no pisarse la base de datos.

## 4. Cómo ejecutar

```bash
npm test               # todo (necesita PostgreSQL con pms_test)
npm run test:unit      # solo unitarias, sin base de datos
npm run test:coverage  # con informe de cobertura
```

En CI (`.github/workflows/ci.yml`) corren con Node 22 y 24 contra un servicio de PostgreSQL.

## 5. Criterios de salida

| Métrica | Umbral | Sprint 0 | Entrega del primer bimestre |
| --- | --- | --- | --- |
| Pruebas en verde | 100 % | 85 / 85 | 145 / 145 |
| Cobertura de líneas en `src/` | ≥ 70 % | 97 % | 97 % |
| Cobertura de ramas en `src/` | ≥ 60 % | 88 % | 87 % |
| Propagación en vivo entre dos navegadores | < 1 s | ≈ 70–90 ms | Mensaje del chat visible en el otro navegador en < 1 s (Playwright) |
| Lighthouse (rendimiento / accesibilidad / buenas prácticas) | ≥ 90 | — | 100 / 100 / 100 |

## 6. Trazabilidad (criterio → prueba)

| Criterio | Prueba |
| --- | --- |
| HU-01.1 inicio de sesión y redirección | `auth.test.js` › *redirige al login (303) a quien no tiene sesión y recuerda adónde iba* |
| HU-01.2 mensaje genérico | `auth.test.js` › *responde lo mismo a contraseña incorrecta y a correo inexistente* |
| HU-01.3 límite de intentos | `auth.test.js` › *bloquea con 429 tras 10 intentos fallidos* |
| HU-01.4 cierre de sesión desconecta sockets | `realtime.test.js` › *cerrar sesión avisa y desconecta los sockets de esa sesión* |
| HU-02.1 permisos en el servidor | `rooms.test.js` › *recepción no puede iniciar una limpieza: 403 y nada cambia* |
| HU-02.2 solo botones permitidos | `rooms.test.js` › *cada rol ve solo los botones que puede usar* |
| HU-07.3 actualización en vivo | `realtime.test.js` › *un cambio de limpieza llega a recepción como room:updated* |
| HU-08.1 transiciones válidas por rol | `room-status.test.js` › *permite exactamente las transiciones documentadas…* |
| HU-08.2 conflicto de versión | `rooms.test.js` › *una versión obsoleta da 409 con la tarjeta vigente* |
| HU-08.3 bitácora | `rooms.test.js` › *limpieza: sucia → en limpieza → limpia, con versión y bitácora* |
| HU-08.4 funciona sin JavaScript | `rooms.test.js` › *sin JavaScript: formulario normal → 303 de vuelta y mensaje flash* |
| HU-09.1 motivo obligatorio | `rooms.test.js` › *el motivo es obligatorio* |
| RN-10 ocupada no se bloquea | `rooms.test.js` › *RN-10: no se puede bloquear…* y *RN-10 también lo garantiza la base de datos* |
| RNF-03 concurrencia | `rooms.test.js` › *dos peticiones simultáneas con la misma versión → exactamente una gana* |
| RNF-04 seguridad | `auth.test.js` › CSP, fijación de sesión, CSRF; `realtime.test.js` › origen cruzado |
| HU-39 registro | `signup.test.js` › crea la cuenta como Recepción inactiva, no entra hasta que administración la activa, correo repetido (409), validación (422), CSRF; `chat.test.js` › aviso en vivo a administración |
| HU-40 recuperación de clave | `password-reset.test.js` › misma respuesta exista o no la cuenta, solo hash del token, un solo uso, caducidad, anula enlaces anteriores, cierra sesiones |
| HU-41 CRUD de huéspedes | `guests.test.js` › paginación, búsqueda sin tildes, filtro, inyección SQL, consulta por id, alta/edición/baja, 422/409, permisos, XSS en notas |
| HU-41 validaciones | `validators.test.js`, `guest-schema.test.js` › cédula, pasaporte, teléfono, edad, longitudes |
| HU-42 chat | `chat.test.js` › mensaje en vivo entre dos usuarios, historial, reconexión, validación y saneamiento, permisos por sala, límite de frecuencia, no leídos, presencia, respaldo sin JavaScript |
| HU-03 usuarios | `users.test.js` › cambio de rol, desactivación, nadie se cambia a sí mismo |

## 7. Guion de demo (prueba manual de aceptación)

1. Abrir dos navegadores: recepción (escritorio) y limpieza (celular o vista móvil).
2. Limpieza pulsa "Iniciar limpieza" en una habitación VD: recepción ve el cambio sin recargar y
   escucha el anuncio si usa lector de pantalla.
3. Limpieza pulsa "Terminar limpieza": el contador "Listas" sube en ambos navegadores.
4. Mantenimiento bloquea una habitación con motivo: aparece como OOO en todos lados y el panel se
   actualiza solo.
5. Dos personas pulsan a la vez sobre la misma habitación: una recibe el aviso de conflicto con el
   estado actual.
6. Desconectar el wifi 10 s y volver: el indicador pasa a "Reconectando…" y luego "En vivo", sin
   perder cambios.

El guion de la entrega del primer bimestre (registro, huéspedes, chat y recuperación de clave) está
en la [matriz de cumplimiento](../02-analisis/matriz-guia-docente.md#4-para-la-defensa).

## 8. Gestión de defectos

Los errores se registran con la plantilla de issue "Reporte de error" (pasos, esperado, actual,
severidad). Todo error corregido incluye una prueba que fallaba antes de la corrección.
