# Glosario del dominio

Términos de la industria hotelera que aparecen en requisitos, código y pantallas. Cuando un término
tiene un nombre técnico en el código, se indica entre paréntesis.

| Término | Significado |
| --- | --- |
| **PMS** (*Property Management System*) | Sistema central que gestiona inventario, reservas, estancias, operaciones y cobros de un alojamiento. |
| **Tipo de habitación** (`room_type`) | Categoría vendible (individual, doble, suite) con tarifa base y capacidad. |
| **Habitación** (`room`) | Unidad física concreta, identificada por su número (por ejemplo, la 204). |
| **Estado de ocupación** (`occupancy_status`) | *Vacante* (sin huésped en casa) u *ocupada* (con huésped registrado). Lo cambian el check-in y el check-out. |
| **Estado de limpieza** (`housekeeping_status`) | *Sucia*, *en limpieza*, *limpia* o *inspeccionada*. |
| **VI / VC / VD** | Vacante inspeccionada / vacante limpia / vacante sucia. VI y VC se pueden asignar a un huésped que llega. |
| **OC / OD** | Ocupada limpia / ocupada sucia (el huésped sigue en casa). |
| **OOO** (*Out of Order*) | Fuera de servicio: habitación bloqueada por avería; no se vende y sale del inventario disponible. |
| **OOS** (*Out of Service*) | Bloqueo menor que no saca la habitación del inventario. No se usa en esta versión. |
| **Housekeeping** | Departamento de limpieza (camareras/os de pisos y supervisión). |
| **Stayover** | Huésped que continúa su estancia; su habitación recibe limpieza de servicio diario. |
| **Reserva** (`reservation`) | Compromiso de una habitación para un rango de fechas a nombre de un huésped. |
| **Retención / hold** | Reserva provisional de pocos minutos mientras se completan los datos; expira sola. |
| **Overbooking** | Vender más estancias que habitaciones disponibles. Aquí se impide por diseño. |
| **Walk-in** | Huésped que llega sin reserva previa. |
| **No-show** | Reserva confirmada cuyo huésped no llegó. |
| **Check-in / check-out** | Registro de llegada / salida del huésped. |
| **Llegadas / salidas del día** | Reservas con fecha de llegada / salida igual a la fecha de negocio. |
| **Rack** | Vista de calendario habitaciones × días con las reservas dibujadas. |
| **Folio** | Estado de cuenta de una estancia: cargos (noches, extras, impuestos) y pagos. Saldo = cargos − pagos. |
| **Auditoría nocturna** (*night audit*) | Cierre diario: carga la noche a los folios, marca no-shows, cuadra cifras y avanza la fecha de negocio. |
| **Fecha de negocio** (*business date*) | Día contable del hotel; puede diferir del reloj (por ejemplo, a las 01:00 sigue siendo "ayer" hasta el cierre). |
| **Ocupación (%)** | Habitaciones ocupadas ÷ habitaciones disponibles (sin OOO) × 100. |
| **ADR** (*Average Daily Rate*) | Ingreso por habitaciones ÷ habitaciones vendidas. Precio medio por noche vendida. |
| **RevPAR** (*Revenue per Available Room*) | Ingreso por habitaciones ÷ habitaciones disponibles. Equivale a ocupación × ADR. |
| **Channel manager** | Sistema que sincroniza disponibilidad con Booking, Airbnb, etc. Fuera de alcance. |

## Términos técnicos del proyecto

| Término | Significado |
| --- | --- |
| **Evento de dominio** | Hecho de negocio ya ocurrido (`room.status_changed`) que se publica en el bus interno después de confirmar la transacción. |
| **Canal** | Grupo de Socket.IO al que se une un cliente para recibir cierto tipo de eventos (por ejemplo `rooms`). |
| **Fragmento** | Trozo de HTML renderizado por el servidor (por ejemplo, una tarjeta de habitación) que el cliente inserta en la página. |
| **Versión** (`version`) | Contador que aumenta en cada cambio de una entidad; permite detectar ediciones simultáneas. |
| **Resincronización** | Volver a pedir al servidor la vista actual cuando el cliente pudo perderse eventos. |
