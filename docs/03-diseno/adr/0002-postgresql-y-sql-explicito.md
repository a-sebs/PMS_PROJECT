# ADR-0002: PostgreSQL con SQL explícito y migraciones en SQL

- Estado: Aceptado
- Fecha: 2026-10-22

## Contexto

El núcleo de un PMS es la integridad: no vender dos veces una habitación, no perder cambios
concurrentes, no corromper montos. Necesitamos un motor que haga cumplir esas reglas aunque el
código tenga un error, y que el equipo aprenda SQL de verdad.

## Decisión

- **PostgreSQL ≥ 15** como única base de datos (datos de negocio y sesiones).
- Acceso con el driver **`pg`** y **SQL parametrizado escrito a mano** en los repositorios.
- **Migraciones en archivos `.sql`** numerados, aplicados por un migrador propio de ~60 líneas
  (`src/db/migrator.js`) con bloqueo consultivo.

## Alternativas consideradas

- **MySQL/MariaDB**: no tiene restricciones de exclusión ni tipos de rango (`daterange`), que son
  la base de la prevención de overbooking ([ADR-0007](0007-overbooking-en-la-base-de-datos.md)).
- **ORM (Prisma, Sequelize)**: ocultan el SQL que la asignatura quiere ejercitar y no soportan de
  forma nativa restricciones de exclusión, `FOR UPDATE` con control fino ni rangos.
- **Query builder (Knex)**: razonable, pero agrega una capa más de abstracción sin resolver nada que
  el SQL parametrizado no resuelva aquí.
- **`node-pg-migrate`**: válido; se prefirió un migrador mínimo y legible que el equipo entienda por
  completo.

## Consecuencias

- ✅ Reglas críticas garantizadas por la base de datos (exclusión, `CHECK`, claves foráneas).
- ✅ Consultas visibles y optimizables (`EXPLAIN ANALYZE`).
- ⚠️ Más código repetitivo en los repositorios; se mitiga con funciones pequeñas y nombres claros.
- ⚠️ Cada integrante necesita PostgreSQL local: se resuelve con Docker Compose.
