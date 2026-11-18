# UI/UX y accesibilidad

## 1. Para quién diseñamos

| Usuario | Dónde trabaja | Qué necesita de la pantalla |
| --- | --- | --- |
| Recepción | Computador del mostrador, de pie, con huéspedes enfrente | Saber de un vistazo qué habitaciones puede asignar |
| Limpieza | Celular, con guantes, caminando por los pasillos | Botones grandes, pocas palabras, confirmación clara |
| Mantenimiento | Celular o tablet | Bloquear y liberar habitaciones rápido |
| Administración | Computador, a veces de noche | Panorama del hotel y quién hizo qué |

Principio rector: **es una herramienta de turno, no un sitio de marketing**. Densidad de información
alta, lectura rápida, cero adornos que no comuniquen algo.

## 2. Concepto visual: el casillero de llaves

La pieza memorable del diseño es el **tablero de habitaciones dibujado como el casillero de llaves**
que hay detrás de toda recepción: cada habitación es un **llavero** (el *key tag* de latón con el
número grabado). El número es el protagonista; el estado es una banda de color **con texto e
ícono**. Todo lo demás (barra superior, filtros, bitácora) es sobrio para no competir con el tablero.

## 3. Tokens de diseño

Definidos como variables CSS en `src/public/css/app.css`.

### Color

| Token | Claro | Oscuro (turno de noche) | Uso |
| --- | --- | --- | --- |
| `--ink` | `#18233A` | `#E6EBF2` | Texto principal |
| `--paper` | `#EEF1F4` | `#0F1726` | Fondo de la aplicación |
| `--surface` | `#FFFFFF` | `#172238` | Tarjetas y paneles |
| `--brass` | `#8A6A35` | `#C9A46A` | Acento de marca (llaveros, foco) |
| `--status-ready` | `#1E7A55` | `#4CC38A` | VI / VC (lista para asignar) |
| `--status-dirty` | `#A6520A` | `#F0A35B` | VD / OD (requiere limpieza) |
| `--status-occupied` | `#2F5DA8` | `#7EA6EB` | OC (huésped en casa) |
| `--status-ooo` | `#5B6472` | `#98A2B3` | OOO, con patrón rayado además del color |

El modo oscuro se activa con `prefers-color-scheme: dark`.

### Tipografía

| Rol | Familia | Por qué |
| --- | --- | --- |
| Texto e interfaz | **Atkinson Hyperlegible Next** | Diseñada para máxima legibilidad (distingue `0/O`, `1/l/I`); clave para leer números de habitación de pie y a distancia |
| Números de habitación | **Big Shoulders** (peso 800) | Condensada, de cartelería: grande sin ocupar ancho, como un número grabado en un llavero |

Las fuentes se sirven desde el propio servidor (paquetes `@fontsource`), sin llamadas a terceros:
cumple la CSP y funciona sin internet externo.

Escala tipográfica (base 16 px, razón ≈ 1.25): 13 · 16 · 20 · 25 · 31 · 39 px.

### Espaciado y forma

- Espaciado en múltiplos de 4 px (`--space-1` = 4 px … `--space-8` = 48 px).
- Radios con jerarquía: llaveros con la parte superior redondeada (como el objeto real); paneles con
  radio pequeño; chips totalmente redondeados.

## 4. Pantallas

### Tablero de habitaciones

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Aurora  Panel  Habitaciones                ● En vivo   Lucía · Salir │
├──────────────────────────────────────────────────────────────────────┤
│ Habitaciones                                                         │
│ (Todas 24) (Listas 9) (Sucias 7) (Ocupadas 5) (Fuera de servicio 1)  │
│                                                       ┌────────────┐ │
│ Piso 1                                                │ Actividad  │ │
│  ╭──○──╮ ╭──○──╮ ╭──○──╮ ╭──○──╮ ╭──○──╮             │ 21:15 ·    │ │
│  │ 101 │ │ 102 │ │ 103 │ │ 104 │ │ 105 │             │ Lucía: 204 │ │
│  │Doble│ │Indiv│ │Doble│ │Suite│ │Doble│             │ Sucia → En │ │
│  │▓ VC │ │▓ VD │ │▓ OC │ │▒ OOO│ │▓ VI │             │ limpieza   │ │
│  │[acc]│ │[acc]│ │     │ │[acc]│ │     │             │ …          │ │
│  ╰─────╯ ╰─────╯ ╰─────╯ ╰─────╯ ╰─────╯             └────────────┘ │
│ Piso 2 …                                                             │
└──────────────────────────────────────────────────────────────────────┘
```

- Los chips de conteo **son** los filtros (no hay dos controles para lo mismo).
- En el celular, los llaveros pasan a 2 columnas y la bitácora va debajo.
- Las acciones de cada llavero son solo las que el usuario puede ejecutar.

### Panel (dashboard)

Una **barra segmentada** muestra la composición del hotel en este momento (listas / sucias /
ocupadas / fuera de servicio) y, debajo, la tarea más relevante para el rol de quien entra:
limpieza ve cuántas habitaciones esperan limpieza; recepción, cuántas puede asignar.

## 5. Accesibilidad (WCAG 2.2 AA)

| Criterio | Implementación |
| --- | --- |
| 1.4.1 Uso del color | El estado siempre lleva código y texto (VC, "Vacante limpia"); OOO además tiene patrón rayado |
| 1.4.3 Contraste | Texto ≥ 4.5:1 en ambos temas; bandas de estado con texto blanco u oscuro verificado |
| 2.1.1 Teclado | Todo es un `<button>`, `<a>` o control nativo; nada clickeable con `<div>` |
| 2.4.7 Foco visible | Anillo de foco de 3 px en color latón con separación |
| 2.4.11 Foco no oculto | Sin barras fijas que tapen el elemento enfocado |
| 2.5.8 Tamaño del objetivo | Botones de al menos 44 × 44 px en vista móvil |
| 4.1.3 Mensajes de estado | Región `aria-live="polite"` que anuncia cambios en vivo ("Habitación 204: En limpieza") |
| 2.3.3 Animación | Se respeta `prefers-reduced-motion` |

## 6. Microcopia

- Los botones dicen exactamente lo que hacen: "Iniciar limpieza", "Terminar limpieza", "Bloquear
  habitación", "Liberar habitación".
- El resultado repite el mismo verbo: "Limpieza iniciada en la 204".
- Los errores dicen qué pasó y qué hacer: "Otra persona actualizó la 204 hace un momento. Ya ves
  el estado actual; vuelve a intentarlo si aún aplica."
- Estados vacíos que invitan a actuar: "No hay habitaciones sucias. Buen trabajo." solo cuando es
  cierto y útil.
