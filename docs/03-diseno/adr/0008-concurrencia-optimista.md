# ADR-0008: Concurrencia optimista con columna `version`

- Estado: Aceptado
- Fecha: 2026-10-22

## Contexto

Entre que un usuario ve una tarjeta y pulsa un botón pueden pasar segundos o minutos. Si otra
persona cambió la habitación en ese tiempo, el primer usuario estaría actuando sobre información
vieja ("terminar limpieza" de una habitación que otro ya marcó como sucia de nuevo). Un bloqueo de
base de datos no sirve para esto: no se puede mantener una transacción abierta mientras el usuario
piensa.

## Decisión

Cada entidad editable tiene una columna **`version`** que aumenta en cada cambio. El formulario
envía la versión que el usuario vio y el servicio, dentro de la transacción:

1. Lee la fila con `SELECT … FOR UPDATE` (bloqueo **pesimista corto**, solo durante la transacción).
2. Si la versión no coincide, responde **409** con el estado actual.
3. Si coincide, valida la transición, actualiza con `version = version + 1` y confirma.

Los dos mecanismos se complementan: `FOR UPDATE` serializa peticiones simultáneas; `version` detecta
que el usuario decidió sobre una foto vieja.

## Alternativas consideradas

- **"El último gana"**: silencioso y peligroso; se pierden cambios sin que nadie se entere.
- **Bloqueo pesimista largo** ("Ana está editando"): requiere liberar bloqueos si el usuario cierra
  la pestaña; útil como ayuda visual (presencia, HU-33), no como garantía.

## Consecuencias

- ✅ Ningún cambio se pierde sin aviso; el usuario ve el estado actual al instante.
- ✅ La misma `version` sirve al cliente para descartar eventos en vivo desordenados.
- ⚠️ Todas las acciones deben enviar la versión; lo verifica la validación de entrada.
