# Contrato de UI: qué puede y qué no puede cambiar un rediseño

## 1. Por qué existe este documento

En Aurora el HTML es **presentación y contrato funcional a la vez**:

- el tiempo real reemplaza fragmentos completos por atributos `data-*` (ADR-0006);
- los formularios se envían por `fetch` y sustituyen su propio fragmento;
- las pruebas de integración verifican el marcado, no solo el estado de la base de datos.

Por eso un cambio "solo de CSS" puede dejar el tablero sin actualizaciones en vivo, los
formularios sin validación o la integración continua en rojo, **sin que nada falle visualmente**.
Este documento fija las anclas.

> **Regla de oro:** se puede cambiar todo lo que se ve; no se puede cambiar lo que el JavaScript,
> el servidor o las pruebas usan como ancla. Si hace falta mover un ancla, se cambia a la vez en
> el marcado, en el JavaScript y en la prueba, en el mismo commit.

## 2. Ganchos que consulta el JavaScript

### 2.1 Común a todas las páginas (`src/public/js/app.js`)

| Ancla | Dónde se define | Qué deja de funcionar si desaparece |
| --- | --- | --- |
| `[data-fragment]` | `room-card.ejs` (el `<article>`) | La tarjeta deja de reemplazarse tras una acción |
| `[data-enhance]` | Formularios dentro de `room-card.ejs` | El formulario recarga la página en vez de actualizar la tarjeta |
| `[data-toasts]` | `layouts/main.ejs` | No se muestran los avisos de éxito o error |
| `[data-announcer]` | `layouts/main.ejs` | Los lectores de pantalla dejan de anunciar cambios |
| `[data-live-indicator]` y `.live__text` | `layouts/main.ejs` | El indicador de conexión no cambia de estado |
| `main[data-live-channels]` | `layouts/main.ejs` | El socket no se suscribe a ningún canal |
| `main[data-live-refresh]` / `[data-live-manual]` | `layouts/main.ejs` | El panel deja de resincronizarse / el chat pierde su estado |
| `[data-count]` con hijo `[data-count-value]` | `main.ejs`, `chat/index.ejs` | Las insignias de sin leer no se incrementan |

### 2.2 Tablero de habitaciones (`src/public/js/pages/rooms-board.js`)

| Ancla | Dónde se define | Qué deja de funcionar |
| --- | --- | --- |
| `class="key-tag ..."` | `room-card.ejs` | `updateCounts()` no encuentra las tarjetas: los contadores quedan congelados |
| `id="room-<id>"` | `room-card.ejs` | No se localiza la tarjeta a reemplazar |
| `data-version` | `room-card.ejs` | Se descartan o se aplican de más las actualizaciones (respuestas desordenadas) |
| `data-groups` | `room-card.ejs` | Los contadores por estado dejan de cuadrar |
| `data-room-id`, `data-code` | `room-card.ejs` | Diagnóstico y depuración del fragmento |
| `[data-count]` / `[data-filter]` | `board.ejs` | Los chips de filtro no actualizan su número |
| `[data-activity-list]`, `[data-activity-template]`, `[data-activity-empty]` | `board.ejs` | La bitácora en vivo no recibe entradas |
| `.activity__time`, `.activity__summary`, `.activity__actor` | `activity-item.ejs` | Los ítems nuevos de la bitácora se insertan vacíos |

### 2.3 Chat (`src/public/js/pages/chat.js`)

| Ancla | Dónde se define | Qué deja de funcionar |
| --- | --- | --- |
| `[data-chat]` con `data-room`, `data-last-id`, `data-history` | `chat/index.ejs` | El chat no arranca |
| `[data-chat-log]`, `[data-chat-messages]`, `[data-chat-live]`, `[data-chat-empty]` | `chat/index.ejs` | No se pintan mensajes ni el estado vacío |
| `[data-chat-form]` | `chat/index.ejs` | El envío no se intercepta |
| `[data-message-id]` | `chat-message.ejs` | Se duplican mensajes al reconectar |
| `#chat-message-template`, `#online-user-template` | `chat/index.ejs` | No se pueden insertar mensajes ni personas conectadas |
| `.chat-message--mine`, `.chat-message__author`, `__role`, `__body`, `time` | `chat-message.ejs` | Los mensajes nuevos salen sin autor, rol ni hora |
| `[data-room-unread]`, `[data-online-list]`, `[data-online-count]`, `[data-online-empty]` | `chat/index.ejs` | Insignias y lista de conectados quedan fijas |
| `[data-chat-badge]`, `[data-load-older]` | `main.ejs`, `chat/index.ejs` | No se avisa de mensajes en otras salas / no carga historial |
| `.field--invalid` | `forms.js` | El error del mensaje no se marca |

### 2.4 Validación en el navegador (`src/public/js/forms.js`)

| Ancla | Dónde se define | Qué deja de funcionar |
| --- | --- | --- |
| `form[data-validate]` | `chat/index.ejs`, `guests/form.ejs`, auth | No se valida antes de enviar |
| `data-validate-words`, `data-validate-match`, `data-validate-document` | `guests/form.ejs`, auth | Reglas de nombre, contraseña y documento |
| `data-msg-required`, `data-msg-pattern`, `data-msg-min`, `data-msg-max` | campos | Mensajes de error en español |
| `.field`, `[data-field-error]` | `partials/field.ejs` | El error no aparece junto al campo |
| `[data-counter]` | `guests/form.ejs` | El contador de caracteres no se actualiza |
| `[data-guest-form]` | `guests/form.ejs` | El formulario de huéspedes no se mejora |

## 3. Lo que verifican las pruebas

Estas aserciones convierten el marcado en contrato. Cambiarlas es legítimo, pero **en el mismo
commit** que el marcado.

| Prueba | Aserción | Consecuencia práctica |
| --- | --- | --- |
| `test/integration/rooms.test.js:55` | 22 coincidencias de `class="key-tag ` | La clase del `<article>` debe empezar por `key-tag` **seguida de un espacio** y el modificador |
| `test/integration/rooms.test.js:95` | La tarjeta empieza por `<article class="key-tag` | El parcial no puede empezar con un salto de línea, un comentario ni un `<div>` envolvente |
| `test/integration/rooms.test.js:96,117,160` | `data-version="N"` | El atributo debe ir en el `<article>` |
| `test/integration/rooms.test.js:125,236` | `data-code="VC"`, `data-code="OOO"` | El código combinado se renderiza en el atributo |
| `test/integration/rooms.test.js:62-72` | Textos `Iniciar limpieza`, `Terminar limpieza`, `Marcar sucia`, `Inspeccionar`, `Bloquear habitación`, `Liberar habitación` | Las etiquetas de los botones son contrato: no se abrevian |
| `test/integration/rooms.test.js:175-179` | Entre `id="room-3"` y `id="room-4"` no aparece `Inspeccionar` | Los `id` deben conservar el formato `room-<id>` |
| `test/integration/chat.test.js:213` | `data-chat-badge data-count="N"` | Los dos atributos deben ir juntos y en ese orden |
| `test/integration/rooms.test.js:87` | Sin `<header class="topbar">` en `X-Partial: main` | La vista no puede incluir el layout |

## 4. Reglas de accesibilidad medidas (no negociables)

Contraste calculado sobre los tokens actuales (WCAG 2.2 AA: 4.5:1 para texto normal, 3:1 para
texto grande ≥ 24 px o ≥ 18.66 px en negrita):

| Combinación | Ratio | Veredicto |
| --- | --- | --- |
| `--on-status` sobre `--status-ready` (claro) | 5.29:1 | ✅ |
| `--on-status` sobre `--status-dirty` (claro) | 5.48:1 | ✅ |
| `--on-status` sobre `--status-occupied` (claro) | 6.46:1 | ✅ |
| `--on-status` sobre `--status-ooo` (claro) | 5.98:1 | ✅ |
| `--on-status` sobre estados (oscuro) | 6.96–8.62:1 | ✅ |
| `--ink` sobre `--paper` | 13.82:1 | ✅ |
| `--brass` sobre `--surface` | 5.01:1 | ✅ |
| `--brass` sobre `--paper` | **4.42:1** | ⚠️ No usar latón para texto pequeño sobre el fondo de página (solo sobre superficies blancas o en texto grande) |

Reglas que un rediseño no puede romper:

1. **El estado nunca va solo en color**: siempre código (`VD`) + texto + ícono decorativo.
2. **44 × 44 px** de objetivo táctil en móvil (limpieza trabaja con guantes).
3. **Foco visible** con anillo de latón y separación; nada clickeable con `<div>`.
4. **Sin JavaScript** todo sigue funcionando: formularios POST + redirección (PRG).
5. **`prefers-reduced-motion`** respetado; ninguna animación es la única señal de un cambio.
6. No duplicar regiones `aria-live`: los cambios se anuncian una sola vez.

## 5. Checklist antes de dar por buena una pantalla

```bash
npm run check        # lint + formato + 146 pruebas
```

Y además, a mano:

- [ ] Los cuatro roles (administración, recepción, limpieza, mantenimiento) ven solo sus acciones.
- [ ] Móvil a 320 px y 375 px: sin desplazamiento horizontal, botones de 44 px.
- [ ] Modo oscuro: contraste y estados legibles.
- [ ] Sin JavaScript: la pantalla sigue siendo usable.
- [ ] Cambio en vivo de una habitación y de un mensaje de chat.
- [ ] Informes de `docs/05-pruebas/lighthouse/` regenerados si cambió el CSS crítico.
- [ ] `docs/03-diseno/ui-ux.md` y las capturas del `README.md` actualizadas.

## 6. Fuera de alcance de un rediseño

Sin decisión explícita y su propio ADR, un cambio visual **no** toca:

- migraciones, tablas, columnas, restricciones ni relaciones;
- rutas, permisos (`src/core/permissions.js`) ni máquinas de estado;
- la lista de funcionalidades: nada de calendarios, llegadas/salidas, KPIs financieros ni
  notificaciones que aparenten operaciones que aún no existen.
