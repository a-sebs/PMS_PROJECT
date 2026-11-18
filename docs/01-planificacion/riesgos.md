# Registro de riesgos

Se revisa en cada retrospectiva. **Exposición** = probabilidad × impacto (Alta = 3, Media = 2,
Baja = 1). Los riesgos con exposición ≥ 6 tienen una acción concreta en el sprint en curso.

| ID | Riesgo | Prob. | Impacto | Exp. | Mitigación (prevenir) | Contingencia (si ocurre) | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | **Alcance excesivo**: querer construir un PMS comercial en 12 semanas | Alta | Alto | 9 | MoSCoW estricto; el alcance de un sprint se congela en la planificación | Recortar *Could* y luego *Should*; nunca recortar pruebas de las *Must* | Abierto |
| R02 | **Doble reserva** por condiciones de carrera entre peticiones simultáneas | Media | Alto | 6 | Restricción de exclusión en PostgreSQL ([ADR-0007](../03-diseno/adr/0007-overbooking-en-la-base-de-datos.md)) + prueba de 50 peticiones concurrentes en CI | El error de la BD se traduce a un 409 claro para el usuario | Mitigado en diseño |
| R03 | **Frontend en JS puro desordenado**: cada pantalla manipula el DOM a su manera | Alta | Medio | 6 | HTML-over-the-wire ([ADR-0006](../03-diseno/adr/0006-html-over-the-wire.md)), módulos ES, delegación de eventos, convenciones en la guía de desarrollo | Refactor en el sprint siguiente con un ítem explícito en el backlog | Mitigado en diseño |
| R04 | **Clientes desincronizados** tras perder la conexión (wifi del hotel, celular que se bloquea) | Alta | Medio | 6 | Recuperación de estado de Socket.IO + resincronización de la vista si no se recupera; versión por entidad | Indicador de conexión visible y botón de recarga | Mitigado en diseño |
| R05 | **Pérdida de cambios** cuando dos usuarios editan lo mismo | Media | Medio | 4 | Concurrencia optimista con columna `version` ([ADR-0008](../03-diseno/adr/0008-concurrencia-optimista.md)) | Mensaje de conflicto y recarga de la entidad | Mitigado en diseño |
| R06 | **Integración tardía**: cada quien trabaja aislado y todo se rompe al juntar | Media | Alto | 6 | Esqueleto ejecutable en Sprint 0, CI desde el primer día, PRs pequeños | Congelar features 2 días para estabilizar | Mitigado |
| R07 | **Baja disponibilidad del equipo** por exámenes u otras materias | Alta | Medio | 6 | Planificar con 70 % de capacidad en semanas de exámenes; Sprint 6 como colchón | Re-priorizar en la planificación siguiente | Abierto |
| R08 | **Despliegue que no soporta WebSockets** o que "se duerme" en plan gratuito | Media | Medio | 4 | Probar el despliegue real en el Sprint 1, no en la semana 12 | Socket.IO cae a *long-polling*; documentar el comportamiento | Abierto |
| R09 | **Vulnerabilidades básicas** (CSRF, XSS, sesiones, inyección SQL) | Media | Alto | 6 | Línea base de seguridad en el esqueleto ([seguridad](../03-diseno/seguridad.md)); `npm audit` y Dependabot | Corregir con prioridad máxima; registrar en el CHANGELOG | Mitigado en diseño |
| R10 | **Código generado con IA que nadie entiende** | Media | Alto | 6 | Reglas de la sección 7 del [plan](plan-del-proyecto.md); revisión cruzada obligatoria | Sesión de lectura de código antes de la demo | Abierto |
| R11 | **Errores por zonas horarias** en fechas de llegada/salida | Media | Medio | 4 | Fechas de estancia como `DATE` (sin hora) y parseadas como texto en Node | Pruebas con fechas límite (fin de mes, cambio de año) | Mitigado en diseño |
| R12 | **Entornos distintos** entre integrantes ("en mi máquina funciona") | Media | Bajo | 2 | Docker Compose para la BD, `.nvmrc`, migraciones y seeds reproducibles | Guía de solución de problemas en la guía de desarrollo | Mitigado |

## Cómo agregar un riesgo

1. Asignar el siguiente ID (`R13`, `R14`…).
2. Estimar probabilidad e impacto con el equipo, no individualmente.
3. Escribir la mitigación como una acción concreta y verificable ("agregar prueba X"), no como una
   intención ("tener cuidado").
4. Cerrar el riesgo solo cuando la mitigación esté hecha y verificada.
