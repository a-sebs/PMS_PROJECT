# Registro de decisiones de arquitectura (ADR)

Un ADR documenta **una** decisión importante: el contexto, lo que se decidió, las alternativas y las
consecuencias. No se borran: si una decisión cambia, se escribe un ADR nuevo que la reemplaza y el
viejo pasa a estado *Reemplazado por ADR-XXXX*.

| ADR | Decisión | Estado |
| --- | --- | --- |
| [0001](0001-monolito-modular-ssr.md) | Monolito modular con renderizado en el servidor | Aceptado |
| [0002](0002-postgresql-y-sql-explicito.md) | PostgreSQL con SQL explícito (`pg`) y migraciones en SQL | Aceptado |
| [0003](0003-ejs-con-layouts.md) | EJS con un helper de layout propio | Aceptado |
| [0004](0004-socketio-con-sesion-compartida.md) | Socket.IO compartiendo la sesión de Express | Aceptado |
| [0005](0005-comandos-http-eventos-websocket.md) | Comandos por HTTP, eventos por WebSocket, bus de eventos interno | Aceptado |
| [0006](0006-html-over-the-wire.md) | Actualizaciones en vivo con fragmentos HTML del servidor | Aceptado |
| [0007](0007-overbooking-en-la-base-de-datos.md) | Prevención de overbooking con restricción de exclusión | Aceptado |
| [0008](0008-concurrencia-optimista.md) | Concurrencia optimista con columna `version` | Aceptado |
| [0009](0009-node-test-runner.md) | Runner de pruebas nativo de Node.js | Aceptado |
| [0010](0010-scrypt-para-contrasenas.md) | `scrypt` nativo para contraseñas | Aceptado |
| [0011](0011-chat-por-websocket.md) | Los mensajes del chat viajan por WebSocket (excepción acotada a 0005) | Aceptado |
| [0012](0012-del-monolito-a-microservicios.md) | Monolito en el primer bimestre, microservicios en el segundo | Aceptado |
| [0013](0013-render-y-neon.md) | Demo en Render con PostgreSQL en Neon y CI en GitHub Actions | Aceptado |

## Plantilla

```markdown
# ADR-XXXX: Título en forma de decisión

- Estado: Propuesto | Aceptado | Reemplazado por ADR-YYYY
- Fecha: AAAA-MM-DD

## Contexto
¿Qué problema o fuerza obliga a decidir?

## Decisión
Lo que se decidió, en una o dos frases claras.

## Alternativas consideradas
Cada alternativa con su razón para descartarla.

## Consecuencias
Lo bueno, lo malo y lo que hay que vigilar.
```
