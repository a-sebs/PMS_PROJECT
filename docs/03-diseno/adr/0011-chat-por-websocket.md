# ADR-0011: Los mensajes del chat viajan por WebSocket

- Estado: Aceptado
- Fecha: 2026-11-17

## Contexto

[ADR-0005](0005-comandos-http-eventos-websocket.md) estableció que todo cambio de datos se hace por
HTTP y que Socket.IO solo avisa. La guía del docente exige además un chat en el que el servidor
valide y sanee **los mensajes recibidos por el WebSocket**, y un chat es el caso típico en el que el
cliente emite eventos: mensajes cortos, frecuentes y de solo inserción.

## Decisión

En el chat, el navegador envía cada mensaje con el evento `chat:send` de Socket.IO y espera un
*acknowledgement* (`{ ok, message }` o `{ ok: false, error }`). Es una excepción acotada a ADR-0005:

1. El socket ya está autenticado en el handshake con la misma sesión de Express.
2. Cada evento se valida con zod y se sanea antes de llegar al servicio.
3. El servicio (`chat.service.js`) aplica las mismas reglas que una ruta HTTP: permiso por sala,
   límite de frecuencia y persistencia **antes** de difundir.
4. Existe un respaldo HTTP (`POST /chat/:sala/messages`) que usa el mismo servicio: el chat funciona
   sin JavaScript o si el WebSocket no conecta.

El resto de los módulos sigue ADR-0005 sin cambios.

## Alternativas consideradas

- **Enviar el mensaje por `fetch` y difundirlo por el socket** (como el resto de la aplicación):
  coherente, pero no demuestra la validación de mensajes recibidos por WebSocket que pide la guía y
  agrega una petición HTTP por mensaje.
- **Difundir sin guardar y guardar después**: más rápido, pero un mensaje podría verse y luego
  perderse. Se descartó: primero se guarda, luego se difunde.

## Consecuencias

- La validación del chat está en un solo lugar (esquema + servicio) aunque haya dos transportes.
- Los eventos del cliente son una superficie de ataque nueva: se limitó el tamaño de los paquetes
  (`maxHttpBufferSize` de 16 KB), la longitud (1000 caracteres) y la frecuencia (8 mensajes cada 10 s
  por persona).
- El límite de frecuencia vive en memoria: con varias instancias de Node habría que moverlo a
  PostgreSQL o Redis (ver [ADR-0012](0012-del-monolito-a-microservicios.md)).
