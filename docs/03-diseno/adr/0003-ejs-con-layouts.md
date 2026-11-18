# ADR-0003: EJS con un helper de layout propio

- Estado: Aceptado
- Fecha: 2026-10-22

## Contexto

La asignatura permite EJS, Pug o Handlebars. Las mismas plantillas se usarán para páginas completas,
para fragmentos que se insertan en vivo ([ADR-0006](0006-html-over-the-wire.md)) y para devolver
solo el contenido de `<main>` cuando el cliente se resincroniza.

## Decisión

- **EJS** como motor de plantillas.
- Un **helper propio de ~20 líneas**, `res.renderPage(view, datos)` (`src/http/middlewares/render-page.js`),
  que renderiza la vista y la envuelve en el layout. Si la petición trae `X-Partial: main`, devuelve
  la vista sin layout.
- Para fragmentos se usa `res.render('partials/…')` directamente, sin layout.
- Las vistas reciben datos ya calculados (incluidas las acciones permitidas) y no contienen reglas
  de negocio.

## Alternativas consideradas

- **`express-ejs-layouts`**: popular en tutoriales, pero sin mantenimiento desde 2018 y con
  comportamientos sorprendentes (por ejemplo, `res.locals.layout = false` no desactiva el layout).
  Un helper propio es más corto que la configuración necesaria para esquivar esos casos.
- **Handlebars**: obliga a vistas sin lógica, lo cual es una virtud, pero exige registrar *helpers*
  para cosas simples (comparar, formatear) y su sintaxis es otro lenguaje que aprender.
- **Pug**: sintaxis por indentación que se aleja del HTML; dificulta copiar maquetas y revisar la
  accesibilidad del marcado.

## Consecuencias

- ✅ Es HTML con JavaScript: curva de aprendizaje mínima y marcado fácil de revisar.
- ✅ Un parcial (`partials/room-card.ejs`) sirve igual para la página y para el fragmento en vivo.
- ✅ Página completa, `<main>` sola o fragmento: tres modos con el mismo código de vista.
- ⚠️ EJS permite meter lógica en la vista. Regla del equipo: en la vista solo condicionales y
  bucles de presentación; cualquier decisión de negocio se calcula antes (servicio o controlador).
- ⚠️ `<%-` no escapa: se usa solo para `include` y HTML generado por el servidor.
