# ADR-0004: Socket.IO compartiendo la sesión de Express

- Estado: Aceptado
- Fecha: 2026-10-22

## Contexto

Necesitamos enviar avisos del servidor a los navegadores en tiempo real, agrupar destinatarios por
permisos y saber qué usuario está detrás de cada conexión. La asignatura permite Socket.IO o `ws`.

## Decisión

**Socket.IO 4** con:

- La sesión de Express compartida en el *handshake* (`io.engine.use()`), sin un segundo login.
- Middleware de autenticación que carga el usuario y rechaza conexiones sin sesión válida.
- **Canales con permisos** implementados sobre las *rooms* de Socket.IO.
- **`connectionStateRecovery`** para recuperar eventos perdidos en cortes breves.

## Alternativas consideradas

- **`ws` puro**: más liviano, pero tendríamos que construir a mano reconexión, salas, *acks*,
  *fallback* a long-polling y serialización. Es trabajo valioso para aprender, pero no es el foco
  del proyecto.
- **Server-Sent Events**: suficiente para avisos servidor → cliente, pero sin salas ni *acks*, y los
  canales con permisos habría que construirlos aparte.
- **Polling periódico**: más carga y latencia; no cumple RNF-02.

## Consecuencias

- ✅ Reconexión, salas, acks y recuperación de estado listos para usar.
- ✅ Misma identidad y permisos en HTTP y en tiempo real.
- ⚠️ Con varias instancias del servidor haría falta un *adapter* compartido (ver
  [arquitectura § 10](../arquitectura.md#10-escalabilidad-más-allá-del-curso)).
