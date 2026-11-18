-- 003 · Inventario: tipos de habitación y habitaciones.
-- El estado de una habitación tiene tres dimensiones independientes (ver docs/03-diseno/maquinas-de-estado.md):
-- ocupación, limpieza y disponibilidad (fuera de servicio).

CREATE TABLE room_types (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code            text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{2,5}$'),
  name            text        NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  description     text,
  base_rate_cents integer     NOT NULL CHECK (base_rate_cents >= 0),
  max_occupancy   smallint    NOT NULL CHECK (max_occupancy BETWEEN 1 AND 12),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER room_types_set_updated_at
  BEFORE UPDATE ON room_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE rooms (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number              text        NOT NULL UNIQUE CHECK (number ~ '^[0-9A-Z-]{1,10}$'),
  floor               smallint    NOT NULL CHECK (floor BETWEEN -5 AND 200),
  room_type_id        bigint      NOT NULL REFERENCES room_types (id),
  occupancy_status    text        NOT NULL DEFAULT 'vacant'
                        CHECK (occupancy_status IN ('vacant', 'occupied')),
  housekeeping_status text        NOT NULL DEFAULT 'dirty'
                        CHECK (housekeeping_status IN ('dirty', 'cleaning', 'clean', 'inspected')),
  is_out_of_order     boolean     NOT NULL DEFAULT false,
  out_of_order_reason text,
  out_of_order_since  timestamptz,
  is_active           boolean     NOT NULL DEFAULT true,
  version             integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by          bigint      REFERENCES users (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Fuera de servicio exige motivo y fecha; en servicio, ninguno de los dos.
  CONSTRAINT rooms_out_of_order_consistency CHECK (
    (is_out_of_order AND out_of_order_reason IS NOT NULL AND out_of_order_since IS NOT NULL)
    OR (NOT is_out_of_order AND out_of_order_reason IS NULL AND out_of_order_since IS NULL)
  ),
  -- RN-10: una habitación ocupada no puede estar fuera de servicio.
  CONSTRAINT rooms_occupied_cannot_be_out_of_order CHECK (
    NOT (is_out_of_order AND occupancy_status = 'occupied')
  )
);

CREATE INDEX rooms_floor_number_idx ON rooms (floor, number);
CREATE INDEX rooms_room_type_id_idx ON rooms (room_type_id);

CREATE TRIGGER rooms_set_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
