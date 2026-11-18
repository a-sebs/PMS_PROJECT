-- 004 · Bitácora de actividad (RN-07). Es de solo inserción: nadie puede editar ni borrar el pasado.

CREATE TABLE audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    bigint      REFERENCES users (id),
  action      text        NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text        NOT NULL,
  entity_id   text        NOT NULL,
  summary     text        NOT NULL,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_events_occurred_at_idx ON audit_events (occurred_at DESC);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, occurred_at DESC);

CREATE FUNCTION audit_events_reject_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events es de solo inserción: % no está permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_reject_changes();
