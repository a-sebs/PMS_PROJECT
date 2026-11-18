-- 002 · Usuarios del personal y sesiones.

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text        NOT NULL,
  full_name     text        NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  role          text        NOT NULL
                  CHECK (role IN ('admin', 'front_desk', 'housekeeping', 'maintenance')),
  password_hash text        NOT NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Correo único sin distinguir mayúsculas.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sesiones de express-session, con el formato que espera connect-pg-simple.
CREATE TABLE user_sessions (
  sid    varchar      NOT NULL PRIMARY KEY,
  sess   json         NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);
