-- 005 · Recuperación de clave (HU-40) y correo simulado.

-- Un registro por solicitud de "olvidé mi clave". Se guarda solo el SHA-256 del token: si alguien
-- lee esta tabla, no puede usar los enlaces. Un solo uso (used_at) y caducidad (expires_at).
CREATE TABLE password_reset_tokens (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash bytea       NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_tokens_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX password_reset_tokens_pending_idx
  ON password_reset_tokens (user_id)
  WHERE used_at IS NULL;

-- Bandeja de salida simulada. La guía del proyecto permite simular el envío de correos cuando no
-- hay servidor SMTP: cada correo queda aquí y en el log. En desarrollo se lee en /dev/correos.
CREATE TABLE email_outbox (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  to_address text        NOT NULL,
  subject    text        NOT NULL,
  body_text  text        NOT NULL,
  link_url   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_outbox_created_at_idx ON email_outbox (created_at DESC);
