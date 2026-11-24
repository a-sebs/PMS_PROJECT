# Guía de desarrollo

## 1. Requisitos previos

| Herramienta | Versión | Nota |
| --- | --- | --- |
| Node.js | ≥ 22.12 (recomendado 24 LTS, ver `.nvmrc`) | `nvm use` toma la versión del proyecto |
| Docker Desktop | Reciente | Para PostgreSQL; también sirve un PostgreSQL ≥ 15 instalado a mano |
| Git | Reciente | |

## 2. Primer arranque (menos de 10 minutos)

```bash
git clone https://github.com/a-sebs/PMS_PROJECT.git
cd PMS_PROJECT

nvm use                  # Selecciona la versión definida en .nvmrc (si tienes nvm instalado)

cp .env.example .env          # en PowerShell: Copy-Item .env.example .env
# Genera un secreto y pégalo en SESSION_SECRET dentro de .env:
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"

docker compose up -d db       # PostgreSQL con las bases pms_dev y pms_test
npm install
npm run db:setup              # migraciones + datos de demostración
npm run dev                   # http://localhost:3000 (se reinicia al guardar)
```

Usuarios de demostración (contraseña `Aurora2026!`, configurable con `SEED_PASSWORD`):

| Correo | Rol |
| --- | --- |
| `admin@aurora.test` | Administración |
| `recepcion@aurora.test` | Recepción |
| `limpieza@aurora.test`, `limpieza2@aurora.test` | Limpieza |
| `mantenimiento@aurora.test` | Mantenimiento |

Para ver el tiempo real, abre dos navegadores (o una ventana normal y una de incógnito) con
usuarios distintos en **Habitaciones** y cambia el estado de una habitación en uno de ellos.

## 3. Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor con recarga automática al cambiar archivos de `src/` |
| `npm start` | Servidor sin recarga (como en producción) |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:seed` | Carga datos de demostración (idempotente) |
| `npm run db:setup` | Migrar + seed |
| `npm run db:reset` | **Borra todo** el esquema, migra y carga la demo (solo desarrollo) |
| `npm run perf:guests -- 200000` | Mide la búsqueda de huéspedes con y sin índices (no deja datos) |
| `npm test` | Todas las pruebas (necesita la base `pms_test`) |
| `npm run test:unit` | Solo pruebas unitarias (no necesitan base de datos) |
| `npm run test:coverage` | Pruebas con informe de cobertura |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run check` | Lo mismo que el CI: lint + formato + pruebas. Córrelo antes de abrir un PR |

## 4. Cómo agregar un módulo (receta)

Ejemplo: el módulo `reservations` del Sprint 2.

1. **Migración**: `migrations/005_reservations.sql` (nunca edites una ya integrada a `main`).
2. **Repositorio** `src/modules/reservations/reservations.repository.js`: funciones `(q, …)` con SQL
   parametrizado; `q` es el pool o el cliente de una transacción.
3. **Lógica pura** (máquina de estados, cálculos de noches y precios) en un archivo sin I/O, con
   pruebas unitarias.
4. **Servicio**: reglas de negocio dentro de `db.transaction()`, bitácora con `auditService.record()`
   y `events.publish()` **después** del COMMIT.
5. **Esquemas** de validación con zod (`*.schemas.js`).
6. **Controlador**: traduce HTTP ↔ servicio; usa `res.renderPage()` para páginas y responde JSON
   `{ ok, html }` a `fetch`.
7. **Rutas** con `requirePermission(...)`; agrega el permiso en `src/core/permissions.js`.
8. **Vistas** en `src/views/reservations/` y parciales reutilizables en `src/views/partials/`.
9. **Tiempo real** (`*.realtime.js`): suscríbete a tus eventos de dominio y emite al canal; registra
   el canal en `src/realtime/channels.js`.
10. **Conecta** el servicio y el suscriptor en `src/container.js`, y el router en `src/app.js`.
11. **Pruebas** unitarias e integración, y **documentación**: rutas, eventos, modelo de datos y, si
    hubo una decisión importante, un ADR.

## 5. Convenciones de código (servidor)

- **Módulos ES** (`import`/`export`). Imports internos con el alias `#src/…` (definido en
  `package.json` → `imports`).
- **Nombres**: código y SQL en inglés (`camelCase` en JS, `snake_case` en SQL); comentarios,
  mensajes y documentación en español.
- **Errores**: lanza las clases de `src/core/errors.js` (`ConflictError`, `ForbiddenError`…); el
  manejador central decide la respuesta. Express 5 captura los errores de funciones `async`.
- **Nada de SQL en controladores ni `req`/`res` en servicios.** Un módulo usa a otro solo mediante su
  servicio.
- **Toda entrada se valida** con un esquema antes de llegar al servicio.
- **Dinero en centavos** (enteros) y **fechas de estancia como texto `AAAA-MM-DD`**.

## 6. Convenciones del frontend

La CSP del proyecto prohíbe JavaScript y CSS en línea. En la práctica:

- Nada de `<script>…</script>`, `onclick="…"` ni `style="…"` en las vistas. El JavaScript va en
  `src/public/js/`; los datos que necesita, en atributos `data-*`; los anchos variables, en
  atributos SVG (como la barra del panel).
- **Delegación de eventos** en `document`: el HTML que llega después funciona sin volver a enlazarlo.
- Formularios con `data-enhance` → `app.js` los envía con `fetch` y reemplaza el `[data-fragment]`
  que los contiene con el HTML de la respuesta. Sin JavaScript siguen funcionando (PRG).
- Datos dinámicos con `textContent`, nunca `innerHTML` (salvo HTML que generó nuestro servidor).
- Usa `form.getAttribute('action')`, no `form.action`: un campo llamado `action` "tapa" la propiedad
  (*DOM clobbering*). Este error real apareció durante el Sprint 0.
- Accesibilidad: controles nativos (`<button>`, `<a>`, `<details>`), foco visible, y anuncios en vivo
  con `announce()` de `app.js`.

## 7. Flujo de Git en la práctica

```bash
git switch develop && git pull
git switch -c feat/HU-12-crear-reserva
# … trabajo …
npm run check
git add -A
git commit -m "feat(reservations): crear reserva con código de confirmación"
git push -u origin feat/HU-12-crear-reserva
# Abrir el PR hacia develop en GitHub con la plantilla y enlazar el issue (Closes #12)
```

Tipos de commit: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `style`, `perf`.

## 8. Solución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `Configuración inválida: DATABASE_URL…` | Falta `.env` | `cp .env.example .env` |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL no está corriendo | `docker compose up -d db` |
| El puerto 5432 está ocupado | Hay otro PostgreSQL local | Detenlo o cambia el puerto en `docker-compose.yml` y en `.env` |
| `database "pms_test" does not exist` | El volumen se creó antes del script de inicio | `docker compose down -v && docker compose up -d db` (borra los datos locales) |
| Las pruebas se niegan a correr | `TEST_DATABASE_URL` no termina en `_test` | Es a propósito: las pruebas vacían esa base |
| El indicador dice "Sin conexión" | La sesión expiró o el servidor se reinició | Recarga la página; si persiste, revisa la consola del navegador |
| Cambié CSS/JS y no se ve | Caché del navegador | Recarga forzada (Ctrl+Shift+R) |
