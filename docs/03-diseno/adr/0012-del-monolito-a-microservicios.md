# ADR-0012: Monolito en el primer bimestre, microservicios en el segundo

- Estado: Aceptado
- Fecha: 2026-11-17

## Contexto

La guía del docente divide el proyecto en dos etapas que se construyen una sobre otra:

1. **Primer bimestre:** aplicación **monolítica** (vistas y rutas en el servidor, un solo proyecto
   desplegable, WebSocket dentro del mismo proyecto) con el stack Node.js + Express + EJS + Socket.IO.
2. **Segundo bimestre:** la misma aplicación evoluciona a un **frontend desacoplado**, un **backend**
   y **microservicios**, con CI/CD y observabilidad.

Hay que entregar un monolito sin cerrarle el camino a la segunda etapa.

## Decisión

Entregar un **monolito modular** ([ADR-0001](0001-monolito-modular-ssr.md)): un solo proceso
desplegable, pero con fronteras internas claras que luego se pueden separar.

| Lo que ya existe en el monolito | Cómo se aprovecha en el segundo bimestre |
| --- | --- |
| Un módulo por tema (`auth`, `guests`, `chat`, `rooms`…) que solo se comunica con otros a través de su servicio | Cada módulo es candidato a microservicio sin reescribir su lógica |
| Servicios sin `req`/`res` y repositorios con SQL propio | La lógica se reutiliza detrás de una API REST |
| Los controladores ya responden JSON a `fetch` (`wantsJson`) | Base de la API que consumirá el frontend desacoplado |
| Bus de eventos de dominio (`room.status_changed`, `chat.message_posted`…) publicado después del COMMIT | Se reemplaza por un *broker* (por ejemplo, RabbitMQ o NATS) entre servicios |
| Socket.IO detrás de una fachada (`gateway.js`) | Se convierte en un servicio de tiempo real; con varias instancias se usa un *adapter* compartido |
| Logs estructurados con id de petición y `GET /health` | Punto de partida de la observabilidad y de los *health checks* de los contenedores |
| CI con GitHub Actions y Docker | Se extiende a CI/CD por servicio |

Corte tentativo para el segundo bimestre (a confirmar con la sección correspondiente de la guía):
**servicio de identidad** (registro, sesión, recuperación), **servicio de huéspedes** (CRUD),
**servicio de chat y notificaciones** (WebSocket) y un **frontend** que consume sus APIs.

## Alternativas consideradas

- **Empezar ya con microservicios**: incumple la guía del primer bimestre y multiplica la
  complejidad (red, despliegue, datos distribuidos) antes de tener el producto funcionando.
- **Monolito sin fronteras internas**: más rápido al principio, pero el segundo bimestre exigiría
  reescribir en lugar de extraer.

## Consecuencias

- Cumple la definición de monolito de la guía (ver la [matriz de cumplimiento](../../02-analisis/matriz-guia-docente.md)).
- Hay que vigilar que ningún módulo lea tablas de otro: es lo que haría difícil separarlos. Hoy
  existe un acoplamiento conocido: huéspedes, chat y bitácora hacen `JOIN` con `users` para mostrar
  el nombre de la persona. Al separar servicios, ese nombre viajará en el evento o se copiará al
  guardar (el nombre "al momento del hecho").
- Algunas piezas en memoria (presencia del chat, límite de frecuencia) deberán compartirse entre
  instancias cuando haya más de una.
