# Rendimiento: mediciones

La guía pide paginación, índices en los campos de búsqueda, chat sin recargar la página y "al menos
una medición simple". Aquí están tres mediciones, cómo repetirlas y lo que aprendimos de ellas.

**Entorno:** Windows 11 con Node.js 22.22, PostgreSQL 17 en un contenedor Docker y Chrome 158
headless, aplicación en modo desarrollo (`npm run dev`), 24 de noviembre de 2026. Los tiempos
cambian según la máquina: lo importante es la comparación dentro de cada tabla.

## 1. Lighthouse 12.8

| Página | Dispositivo | Rendimiento | Accesibilidad | Buenas prácticas | FCP | LCP | TBT | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/login` | Móvil (simulado) | 100 | 100 | 100 | 1,2 s | 1,4 s | 0 ms | 0 |
| `/guests?q=salazar` | Móvil (simulado) | 99–100 | 100 | 100 | 1,1 s | 1,9 s | 0 ms | 0,004 |
| `/guests?q=salazar` | Escritorio | 100 | 100 | 100 | 0,3 s | 0,4 s | 0 ms | 0,006 |
| `/chat/general` | Escritorio | 100 | 100 | 100 | 0,3 s | 0,5 s | 0 ms | 0,006 |

El puntaje de rendimiento se mueve ±1 punto entre corridas con las mismas métricas de carga (en el
móvil de huéspedes, tres corridas seguidas dieron 99, 99 y 100 con idénticos FCP, LCP y CLS): por
eso esa fila se informa como rango. Las otras tres páginas dieron 100 en su corrida registrada.

Informes completos (se abren en el navegador): [login](lighthouse/login-movil.html),
[huéspedes](lighthouse/huespedes-escritorio.html) y [chat](lighthouse/chat-escritorio.html).

**Lo que corregimos gracias a la medición:**

| Hallazgo | Causa | Corrección |
| --- | --- | --- |
| Accesibilidad 95 en el chat | `role="log"` estaba en la lista `<ol>`, que no admite ese rol, y sus `<li>` quedaban sin lista | El rol pasó a un `<div>` que envuelve la lista |
| CLS de 0,146 en el login (rendimiento 94) | Al llegar las fuentes, el texto cambiaba de tamaño y la tarjeta centrada "saltaba" | `<link rel="preload">` de las tres fuentes de la primera pantalla |
| "Habilitar la compresión de texto" | El servidor enviaba HTML, CSS y JS sin comprimir | Middleware `compression` (gzip) |

**Pendientes conscientes:** las hojas de estilo y los scripts no se minifican ni se guardan en
caché por largo tiempo, porque no tienen huella en el nombre (`app.3f9a.css`) y un caché largo
mostraría versiones viejas tras un despliegue. Es una tarea del segundo bimestre, junto con el
empaquetado del frontend.

## 2. Tiempo de respuesta HTTP

60 peticiones seguidas a cada URL con una sesión de Recepción (se descartan las 10 primeras para
calentar):

| URL | Mediana | Percentil 95 |
| --- | ---: | ---: |
| `/guests` | 8,2 ms | 11,5 ms |
| `/guests?q=salazar` | 8,4 ms | 12,8 ms |
| `/guests?nationality=CO&page=2` | 13,3 ms | 20,2 ms |
| `/guests/5` | 6,0 ms | 10,6 ms |

Incluye validar la sesión contra la base de datos, consultar, renderizar EJS y comprimir.

## 3. Consultas con y sin índices (200 000 huéspedes)

```bash
npm run perf:guests -- 200000
```

El script inserta 200 000 huéspedes sintéticos **dentro de una transacción que se revierte** (no
deja nada en la base de datos), mide cada consulta cinco veces con `EXPLAIN ANALYZE` y repite la
medición prohibiendo a PostgreSQL usar índices. Se informa la mediana.

| Consulta | Con índices | Sin índices | Plan elegido con índices |
| --- | ---: | ---: | --- |
| Buscar "zambr" (contar coincidencias) | 12,4 ms | 31,7 ms | Bitmap Index Scan sobre el índice trigram |
| Buscar "zambr", página 1 — **versión inicial** | 99,1 ms | 37,1 ms | Index Scan por apellido (filtrando fila por fila) |
| Buscar "zambr", página 1 — **versión final** | 14,3 ms | 55,5 ms | Bitmap Index Scan sobre el índice trigram |
| Buscar por documento | 24,4 ms | 31,8 ms | Bitmap Index Scan sobre el índice trigram |
| Filtrar por nacionalidad (página 1) | 0,5 ms | 25,9 ms | Index Scan por apellido |
| Listado sin filtros (página 1) | 0,01 ms | 29,9 ms | Index Scan por apellido |

**Lo que muestra la tabla:**

- Los índices de orden (`guests_last_name_idx`) hacen que el listado paginado sea casi instantáneo:
  PostgreSQL lee solo las 10 filas de la página en lugar de ordenar 200 000.
- El índice trigram (`pg_trgm`) permite buscar fragmentos de texto (`LIKE '%zambr%'`) sin
  recorrer la tabla completa.
- **La medición encontró un problema real.** En la versión inicial, PostgreSQL decidía recorrer el
  índice por apellido y descartar fila por fila hasta juntar 10 coincidencias: como "Zambrano"
  empieza con Z, recorría casi toda la tabla (99 ms, peor que sin índices). La versión final
  (`WITH … AS MATERIALIZED` en `guests.repository.js`) obliga a **filtrar primero** con el índice
  trigram y ordenar después solo lo encontrado: 14 ms, siete veces más rápido.
- Con los 48 huéspedes de demostración todas las consultas tardan menos de 1 ms; los índices
  empiezan a notarse con miles de filas.

## 4. Cómo repetir las mediciones

```bash
npm run dev                        # en otra terminal
npm run perf:guests -- 200000      # consultas con y sin índices

# Lighthouse (necesita Chrome o Chromium instalado)
npx lighthouse http://localhost:3000/login --view
# Páginas con sesión: copiar la cookie pms.sid del navegador
npx lighthouse "http://localhost:3000/guests?q=salazar" --preset=desktop \
  --extra-headers='{"Cookie":"pms.sid=PEGAR_AQUI"}' --view
```
