# ADR-0006: Actualizaciones en vivo con fragmentos HTML del servidor

- Estado: Aceptado
- Fecha: 2026-10-22

## Contexto

Cuando llega un evento en vivo hay que actualizar el DOM. El riesgo principal del frontend en
JavaScript puro ([R03](../../01-planificacion/riesgos.md)) es duplicar el marcado: una versión en
EJS para la carga inicial y otra en JavaScript para las actualizaciones, que con el tiempo divergen.
Además, una tarjeta muestra botones distintos según el rol de quien la ve.

## Decisión

**El servidor es la única fuente del HTML.**

- Para entidades cuya vista depende de permisos (tarjeta de habitación, reserva, tarea): el evento
  es **delgado** (`{ roomId, version }`) y el cliente pide el **fragmento** (`GET /rooms/:id/card`),
  renderizado con el mismo parcial EJS que la página completa.
- Para elementos idénticos para todos (ítem de bitácora, toast): el evento trae datos y el cliente
  clona un `<template>` llenándolo con `textContent`.
- Para resincronizar una vista entera: `fetch` de la URL actual con `X-Partial: main`, que devuelve
  solo el contenido de `<main>`.
- La interacción usa **delegación de eventos** en `document`, así el HTML reemplazado no necesita
  volver a enlazarse.

## Alternativas consideradas

- **Renderizar en el cliente con plantillas JS** (como sugería el análisis inicial): duplica el
  marcado y la lógica de permisos de la vista.
- **Enviar el HTML dentro del evento de socket**: un solo render para todos, pero no puede variar por
  rol y engorda cada mensaje.
- **htmx**: resuelve exactamente esto, pero agrega una dependencia cuyo comportamiento el equipo
  debería aprender; aquí se implementa la idea en ~150 líneas propias.

## Consecuencias

- ✅ Una sola plantilla por componente; los permisos se aplican siempre en el servidor.
- ✅ Funciona también como mejora progresiva de formularios normales.
- ⚠️ Una petición HTTP extra por cliente y por cambio. Con decenas de usuarios es despreciable; si
  creciera, se agrupan cambios (*debounce*) o se usa el evento con datos.
- ⚠️ Las respuestas pueden llegar desordenadas: se resuelve comparando `data-version`.
