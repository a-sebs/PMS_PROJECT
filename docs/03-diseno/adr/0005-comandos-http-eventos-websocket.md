# ADR-0005: Comandos por HTTP, eventos por WebSocket y bus de eventos interno

- Estado: Aceptado (con una excepción acotada para el chat: [ADR-0011](0011-chat-por-websocket.md))
- Fecha: 2026-10-22

## Contexto

Con Socket.IO disponible, es tentador hacer todo por socket (`socket.emit('changeStatus')`). Pero
Express ya resuelve sesión, CSRF, validación, permisos, códigos de estado, logs y pruebas con
Supertest. Además, si un servicio llama directamente a Socket.IO, queda acoplado al transporte y es
difícil de probar.

## Decisión

1. **Todo cambio de datos es una petición HTTP** (`fetch` o formulario).
2. **Socket.IO solo transporta avisos servidor → cliente** de hechos ya confirmados, más la gestión
   de canales (`channel:join`).
3. Los servicios **publican eventos de dominio** en un **bus interno** (`src/core/events.js`)
   **después del COMMIT**. Los módulos `*.realtime.js` se suscriben y los reenvían a los canales.

## Alternativas consideradas

- **Comandos por socket**: habría que reimplementar CSRF, validación, permisos y manejo de errores
  para el socket, y las pruebas serían más difíciles.
- **El servicio emite directamente a `io`**: más corto, pero mezcla negocio con transporte; un
  futuro consumidor (notificaciones, correo, auditoría) obligaría a tocar el servicio otra vez.

## Consecuencias

- ✅ Las acciones funcionan sin JavaScript (formulario + redirección).
- ✅ Los servicios se prueban sin levantar Socket.IO.
- ✅ Agregar un consumidor de eventos (por ejemplo, notificaciones en el Sprint 4) no toca el servicio.
- ⚠️ El bus es en memoria: si el proceso cae entre el COMMIT y la publicación, el aviso se pierde
  (los datos no). Los clientes lo compensan resincronizando al reconectar. Para garantías más
  fuertes existiría el patrón *transactional outbox*, innecesario para este alcance.
