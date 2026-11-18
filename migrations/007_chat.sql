-- 007 · Chat del personal (HU-42): historial de mensajes y hasta dónde leyó cada usuario.

CREATE TABLE chat_messages (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room       text        NOT NULL CHECK (room IN ('general', 'limpieza', 'mantenimiento')),
  author_id  bigint      NOT NULL REFERENCES users (id),
  body       text        NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Historial de una sala (del más nuevo al más viejo) y conteo de no leídos (id > último leído).
CREATE INDEX chat_messages_room_id_idx ON chat_messages (room, id DESC);

CREATE TABLE chat_reads (
  user_id              bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  room                 text   NOT NULL,
  last_read_message_id bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, room)
);
