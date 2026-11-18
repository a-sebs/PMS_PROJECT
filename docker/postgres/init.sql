-- Se ejecuta solo la primera vez que se crea el volumen de PostgreSQL.
-- La base de datos de desarrollo (pms_dev) la crea la imagen a partir de POSTGRES_DB.
CREATE DATABASE pms_test OWNER pms;
