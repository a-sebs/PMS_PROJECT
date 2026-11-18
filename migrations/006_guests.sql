-- 006 · Huéspedes: la entidad principal del CRUD (HU-41).

-- Búsqueda por fragmentos ("sala" encuentra "Salazar") que puede usar un índice. pg_trgm es una
-- extensión de confianza: la instala el dueño de la base de datos, sin superusuario.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE guests (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_type   text        NOT NULL CHECK (document_type IN ('cedula', 'passport')),
  document_number text        NOT NULL,
  first_name      text        NOT NULL CHECK (length(first_name) BETWEEN 2 AND 60),
  last_name       text        NOT NULL CHECK (length(last_name) BETWEEN 2 AND 60),
  email           text        NOT NULL
                    CHECK (length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Formato internacional E.164: + código de país y hasta 15 dígitos.
  phone           text        NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  birth_date      date        NOT NULL CHECK (birth_date > DATE '1900-01-01'),
  nationality     char(2)     NOT NULL CHECK (nationality ~ '^[A-Z]{2}$'),
  notes           text        CHECK (length(notes) <= 500),
  version         integer     NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by      bigint      REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Texto normalizado (minúsculas y sin tildes) para buscar por nombre, documento o correo.
  search_text     text GENERATED ALWAYS AS (
                    translate(
                      lower(first_name || ' ' || last_name || ' ' || document_number || ' ' || email),
                      'áéíóúüñ', 'aeiouun'
                    )
                  ) STORED,

  -- La aplicación valida además el dígito verificador de la cédula y la mayoría de edad.
  CONSTRAINT guests_document_format CHECK (
    (document_type = 'cedula' AND document_number ~ '^[0-9]{10}$')
    OR (document_type = 'passport' AND document_number ~ '^[A-Z0-9]{5,20}$')
  ),
  CONSTRAINT guests_document_unique UNIQUE (document_type, document_number)
);

-- Índices de los campos de búsqueda (requisito de rendimiento de la guía).
CREATE INDEX guests_search_text_trgm_idx ON guests USING gin (search_text gin_trgm_ops);
CREATE INDEX guests_last_name_idx ON guests (last_name, first_name, id);
CREATE INDEX guests_nationality_idx ON guests (nationality);

CREATE TRIGGER guests_set_updated_at
  BEFORE UPDATE ON guests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
