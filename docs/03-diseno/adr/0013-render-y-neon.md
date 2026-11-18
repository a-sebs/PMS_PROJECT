# ADR-0013 — Publicar el monolito en Render con PostgreSQL en Neon

- Estado: Aceptado para la demo del primer bimestre
- Fecha: 2026-11-18

## Decisión

GitHub Actions verifica los PR y cambios integrados en `develop` y `main`. Cada rama tiene un servicio Render Free que publica el monolito por HTTPS y WebSocket seguro. Staging sigue a `develop` y la demo estable sigue a `main` después de una promoción revisada. Un solo proyecto Neon Free aloja las dos ramas PostgreSQL. Staging usa `develop` y producción usa la rama raíz. Cada servicio Render guarda la conexión directa de su rama y su propio secreto de sesión. Ambos planes encajan con una demo de uso intermitente.
[WebSockets en Render](https://render.com/docs/websocket) · [Plan gratuito de Neon](https://neon.com/pricing)

El proceso usa la conexión directa de Neon porque el migrador mantiene un bloqueo consultivo
de sesión durante varias transacciones. El servidor reutiliza conexiones con `pg.Pool`.
[Limitaciones del pool de Neon](https://neon.com/docs/connect/connection-pooling)

## Alternativas consideradas

- Azure requería recuperar el acceso del equipo antes de desplegar.
- Vercel documenta soporte para Socket.IO con Fluid Compute. Render permite ejecutar directamente
  el proceso HTTP y Socket.IO que ya usa Aurora. [WebSockets en Vercel](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)
- Supabase también cubriría PostgreSQL. El equipo eligió Neon para la demo porque Aurora ya resuelve
  la autenticación y el tiempo real en Express y Socket.IO.
- La base gratuita de Render caduca a los 30 días. Se prefirió una base que acompañe la entrega
  durante el semestre. [Límites de Render Free](https://render.com/docs/free)

## Consecuencias

Render suspende el servicio gratuito tras 15 minutos sin tráfico entrante y estima cerca de un
minuto para reactivarse. Hay que medir el primer acceso real durante la prueba de la demo.
El presupuesto se mantiene en cero usando los planes Free dentro de sus cuotas.
[Arranque en frío de Render](https://render.com/docs/free)
