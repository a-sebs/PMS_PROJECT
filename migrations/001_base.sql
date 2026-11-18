-- 001 · Utilidades compartidas por todas las tablas.

-- Índices GiST sobre tipos escalares: los necesita la restricción anti-overbooking
-- (EXCLUDE USING gist (room_id WITH =, stay WITH &&)) del Sprint 2. Ver ADR-0007.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Mantiene updated_at al día en cualquier tabla que lo use.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
