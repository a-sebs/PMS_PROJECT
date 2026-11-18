# Visión y alcance

| Campo | Valor |
| --- | --- |
| Proyecto | Aurora PMS — Property Management System para hotel boutique |
| Asignatura | Aplicaciones Web Avanzadas |
| Duración | 12 semanas |
| Stack obligatorio | Node.js + Express + plantillas (EJS) + HTML5/CSS3/JavaScript + Socket.IO |
| Versión del documento | 1.0 (Sprint 0) |

## 1. Problema

Un hotel pequeño coordina a recepción, limpieza y mantenimiento con llamadas, hojas de cálculo y
grupos de mensajería. El resultado es conocido en la industria:

- **Dobles reservas**: dos personas venden la misma habitación para las mismas fechas.
- **Habitaciones "fantasma"**: recepción no sabe si una habitación ya fue limpiada, así que el
  huésped espera en el lobby aunque la habitación esté lista.
- **Información desfasada**: cada persona ve una foto distinta del hotel según cuándo recargó la
  página o preguntó por última vez.
- **Cobros incompletos**: consumos que no llegan a la cuenta del huésped antes del check-out.

## 2. Visión

> **Para** hoteles boutique de 10 a 60 habitaciones **que** coordinan recepción, limpieza y
> mantenimiento de forma manual, **Aurora PMS** es una aplicación web **que** mantiene a todo el
> equipo viendo el mismo estado del hotel en tiempo real y **garantiza desde la base de datos** que
> una habitación nunca se venda dos veces. **A diferencia de** las hojas de cálculo o de un CRUD
> tradicional, cada cambio operativo aparece al instante en las pantallas de quien lo necesita.

## 3. Objetivos (SMART)

| ID | Objetivo | Cómo se mide | Fecha |
| --- | --- | --- | --- |
| O1 | Cubrir el ciclo completo de una estancia: reserva → check-in → limpieza → check-out → cobro | Guion de demo ejecutado sin intervención técnica | Semana 12 |
| O2 | Cero reservas solapadas para la misma habitación | Prueba automatizada con 50 solicitudes concurrentes: exactamente 1 éxito | Semana 5 |
| O3 | Cambios operativos visibles en otros clientes sin recargar | p95 < 1 s en red local (prueba con 2+ navegadores) | Semana 3 |
| O4 | Calidad sostenida | CI en verde en cada PR, 0 errores de ESLint, cobertura ≥ 70 % en servicios | Continuo |
| O5 | Dominio del código por parte del equipo | Cada integrante explica y defiende su módulo en la demo final | Semana 12 |

## 4. Alcance

La priorización usa **MoSCoW** (*Must, Should, Could, Won't*). El MVP es todo lo *Must*.

### Dentro del alcance (Must — MVP)

1. **Acceso y seguridad**: inicio de sesión, roles y permisos (administración, recepción, limpieza,
   mantenimiento), bitácora de acciones.
2. **Inventario**: tipos de habitación, habitaciones y **tablero de estados en vivo**
   (vacante/ocupada × sucia/limpia/inspeccionada, fuera de servicio).
3. **Reservas**: búsqueda de disponibilidad, creación, cancelación, **retenciones temporales
   (holds) visibles en vivo** y prevención de *overbooking* en la base de datos.
4. **Recepción**: check-in, check-out, llegadas y salidas del día.
5. **Housekeeping**: tareas de limpieza generadas automáticamente al hacer check-out, tablero Kanban
   en vivo usable desde el celular.
6. **Mantenimiento**: reporte de averías con prioridad; un ticket puede bloquear la habitación.
7. **Facturación**: folio (estado de cuenta) con cargos por noche y extras, pagos simulados.
8. **Dashboard**: ocupación, ADR, RevPAR, llegadas/salidas y habitaciones bloqueadas, en vivo.

### Deseable (Should)

Gestión de usuarios desde la interfaz, calendario tipo *rack* (habitaciones × días), centro de
notificaciones persistentes, auditoría nocturna (cierre del día), comprobante imprimible, walk-in.

### Opcional si sobra tiempo (Could)

Portal del huésped (consultar reserva, pre-check-in, chat con recepción), presencia ("Ana está
viendo esta reserva"), tarifas por temporada, exportación CSV, modo offline para limpieza.

### Fuera de alcance (Won't, en esta versión)

| Excluido | Motivo |
| --- | --- |
| Integración con Booking/Airbnb/Expedia (*channel manager*) | Requiere acuerdos comerciales y APIs certificadas |
| Pasarela de pago real | Riesgo legal y PCI-DSS; se usa un cobro simulado |
| Facturación electrónica ante la autoridad tributaria | Requiere certificados y homologación |
| Múltiples propiedades | Multiplica la complejidad de cada consulta; el diseño no lo impide a futuro |
| Apps móviles nativas | La interfaz web responsive cubre el caso de uso de limpieza |

## 5. Interesados

| Interesado | Interés principal | Participación |
| --- | --- | --- |
| Docente de la asignatura | Calidad técnica, uso avanzado del stack, proceso de ingeniería | Product Owner / evaluador; asiste a las demos |
| Equipo de desarrollo | Aprender, aprobar, construir algo defendible | Construye, prueba y documenta |
| Recepcionista (usuario simulado) | Saber qué habitaciones puede asignar ya | Valida flujos de reserva y recepción |
| Personal de limpieza (simulado) | Ver qué limpiar y avisar cuando termina | Valida el tablero móvil |
| Técnico de mantenimiento (simulado) | Recibir averías priorizadas | Valida tickets |
| Administrador del hotel (simulado) | Ocupación e ingresos al día | Valida dashboard |
| Huésped | Reserva correcta y check-in rápido | Indirecto (portal opcional) |

## 6. Supuestos y restricciones

**Supuestos**

- Un solo hotel, una sola moneda (USD) y una tasa de impuesto configurable.
- Las fechas de estancia son días calendario sin hora (rango `[llegada, salida)`).
- Los usuarios trabajan con navegadores modernos (últimas 2 versiones de los navegadores principales).
- Toda reserva se hace sobre una habitación concreta (ver [ADR-0007](../03-diseno/adr/0007-overbooking-en-la-base-de-datos.md)).

**Restricciones**

- 12 semanas calendario, con semanas de exámenes que reducen la capacidad.
- Stack definido por la asignatura: Node.js, Express, plantillas del lado del servidor, JavaScript
  sin frameworks de frontend, comunicación en tiempo real con Socket.IO o `ws`.
- Presupuesto cero: herramientas gratuitas y planes gratuitos o de estudiante para el despliegue.

## 7. Criterios de éxito del producto

El proyecto se considera exitoso si en la demo final:

1. Dos navegadores intentan reservar la misma habitación y fechas al mismo tiempo: solo uno lo
   consigue y el otro recibe un mensaje claro.
2. Recepción hace check-out y, sin recargar, la tarea aparece en el celular de limpieza; al marcarla
   como terminada, la habitación cambia a "lista" en la pantalla de recepción.
3. Mantenimiento bloquea una habitación por avería y deja de aparecer como disponible al instante.
4. El dashboard refleja los ingresos y la ocupación tras cada operación, sin recargar.
5. Toda la evidencia (requisitos, diseño, pruebas, CI) está en este repositorio.
