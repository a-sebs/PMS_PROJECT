# ADR-0009: Runner de pruebas nativo de Node.js

- Estado: Aceptado
- Fecha: 2026-10-22

## Contexto

Necesitamos pruebas unitarias, de integración con PostgreSQL real y de tiempo real con varios
clientes de Socket.IO, ejecutables en CI desde el primer día.

## Decisión

Usar **`node:test`** y **`node:assert/strict`** (incluidos en Node.js ≥ 22), con **Supertest** para
HTTP y **`socket.io-client`** para tiempo real. Las pruebas de integración usan una base de datos
PostgreSQL real dedicada (cuyo nombre debe terminar en `_test`) y se ejecutan en serie.

## Alternativas consideradas

- **Jest**: muy popular, pero su soporte de ES Modules sigue siendo experimental y agrega
  transformaciones y configuración.
- **Vitest**: excelente, pero orientado a proyectos con Vite; aquí no hay bundler.
- **Mocks de la base de datos (pg-mem)**: no soportan restricciones de exclusión ni `FOR UPDATE`,
  justo lo que más importa probar.

## Consecuencias

- ✅ Cero configuración, soporte nativo de ESM, cobertura con `--experimental-test-coverage`.
- ✅ Las pruebas de integración ejercitan el SQL real, las restricciones y la concurrencia.
- ⚠️ Requiere PostgreSQL para correr la suite completa (Docker Compose local; servicio en CI).
