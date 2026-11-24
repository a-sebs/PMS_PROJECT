-- 008 · Entrega real de correos: estado del envío en la bandeja de salida.
--
-- Hasta ahora `email_outbox` era solo una bandeja simulada: cada fila era un correo que nunca salía
-- de la máquina. Con un transporte real hay que distinguir lo que se encoló, lo que el proveedor
-- aceptó y lo que falló, para poder reintentar y para no confundir "aceptado" con "entregado".

ALTER TABLE email_outbox
  ADD COLUMN status      text NOT NULL DEFAULT 'queued',
  ADD COLUMN provider_id text,
  ADD COLUMN error       text,
  ADD COLUMN sent_at     timestamptz;

-- Las filas que existían se generaron con el transporte simulado: nunca salieron de aquí.
UPDATE email_outbox SET status = 'simulated';

ALTER TABLE email_outbox
  ADD CONSTRAINT email_outbox_status_check
  CHECK (status IN ('queued', 'sent', 'failed', 'simulated'));

-- Lo que quedó a medias es lo que interesa vigilar: encolados sin entregar y fallos.
CREATE INDEX email_outbox_pending_idx
  ON email_outbox (status, created_at DESC)
  WHERE status IN ('queued', 'failed');
