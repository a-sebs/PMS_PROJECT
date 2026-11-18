# ADR-0007: Prevención de overbooking con restricción de exclusión

- Estado: Aceptado (implementación en el Sprint 2)
- Fecha: 2026-10-22

## Contexto

La regla más importante del sistema (RN-02) es que una habitación no se venda dos veces para fechas
que se solapan. Validarlo solo en Node (`SELECT` para ver si está libre y luego `INSERT`) tiene una
condición de carrera: dos peticiones simultáneas pueden ver la habitación libre y ambas insertar.

## Decisión

1. **Cada reserva (y cada retención) apunta a una habitación concreta** (`room_id`); el sistema
   elige automáticamente la primera habitación libre del tipo pedido y recepción puede moverla.
2. Una **restricción de exclusión** en PostgreSQL impide solapes:

   ```sql
   EXCLUDE USING gist (room_id WITH =, stay WITH &&)
     WHERE (status IN ('hold', 'confirmed', 'checked_in'))
   ```

3. El servicio captura el error `23P01` y responde **409 Conflict** con un mensaje claro.
4. Una **prueba automatizada** lanza 50 solicitudes concurrentes por la misma habitación y fechas, y
   exige exactamente 1 éxito.

## Alternativas consideradas

- **Validar en Node con `SELECT … FOR UPDATE`**: no hay fila que bloquear cuando la habitación está
  libre; habría que bloquear la habitación entera (serializa todas las reservas de esa habitación) o
  usar aislamiento `SERIALIZABLE` con reintentos.
- **Inventario por tipo** (tabla `room_type_inventory` con un contador por noche): más flexible
  (asignar habitación al llegar), pero más complejo de mantener consistente y de explicar.
- **Bloqueo en memoria o en Socket.IO**: se pierde al reiniciar y no funciona con varias instancias.

## Consecuencias

- ✅ Garantía absoluta: ni un error de programación ni una carrera producen doble venta.
- ✅ Las retenciones (`hold`) usan el mismo mecanismo: bloquean igual que una reserva.
- ⚠️ Menos flexibilidad que reservar por tipo: si se quiere mover a un huésped, hay que reasignar
  la habitación (operación que la misma restricción protege).
- ⚠️ Un hold vencido sigue bloqueando hasta que el proceso de expiración lo marque `expired`. Se
  mitiga expirando los holds vencidos de esa habitación dentro de la misma transacción de reserva y
  con un barrido periódico cada 30 s.
