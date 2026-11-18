# ADR-0001: Monolito modular con renderizado en el servidor

- Estado: Aceptado
- Fecha: 2026-10-22

## Contexto

La asignatura exige Node.js + Express + plantillas del lado del servidor + JavaScript sin framework
de frontend, y el proyecto dura 12 semanas con un equipo pequeño. Un PMS tiene varios dominios
(inventario, reservas, recepción, limpieza, facturación) que distintas personas desarrollarán en
paralelo.

## Decisión

Un **único proceso Node.js** (un repositorio, un despliegue) organizado en **módulos por dominio**
(`src/modules/<dominio>`), cada uno con sus capas internas: rutas → controlador → servicio →
repositorio. Las páginas se renderizan en el servidor con EJS y el JavaScript del cliente solo
mejora la experiencia (*progressive enhancement*).

## Alternativas consideradas

- **SPA (React/Vue) + API REST**: fuera del stack de la asignatura; duplica el modelo de estado en
  cliente y servidor; exige CORS, tokens y dos despliegues.
- **Microservicios**: complejidad operativa (red, despliegues, consistencia distribuida) sin
  beneficio para un solo hotel y un equipo de 2–5 personas.
- **Monolito organizado por capas globales** (`controllers/`, `services/`, `repositories/` en la
  raíz): funciona, pero un cambio de una historia toca cuatro carpetas distantes y los integrantes
  se pisan. Agrupar por dominio mantiene junto lo que cambia junto.

## Consecuencias

- ✅ Un solo `npm run dev` levanta todo; un solo despliegue.
- ✅ Cada integrante es dueño de una carpeta de módulo; menos conflictos de Git.
- ✅ Las páginas funcionan aunque el JavaScript falle.
- ⚠️ Hay que respetar las reglas de dependencia (un módulo usa a otro solo por su servicio) para
  que el monolito no se vuelva una "bola de barro". Se revisa en los PR.
