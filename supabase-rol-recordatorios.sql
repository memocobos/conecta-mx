-- Conecta Reynosa · Sistema de recordatorios por email para /rol
-- Ejecutar en SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS rol_recordatorios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  nombre          text NOT NULL,
  evento_id       text NOT NULL,
  evento_nombre   text NOT NULL,
  paquete         text NOT NULL,
  zona            text NOT NULL,
  precio          numeric NOT NULL,
  separo_fecha    date NOT NULL,
  separo_monto    numeric NOT NULL,
  pagos           jsonb NOT NULL,
  created_at      timestamp DEFAULT now(),
  last_sent_at    timestamp,
  active          boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_rol_email   ON rol_recordatorios(email);
CREATE INDEX IF NOT EXISTS idx_rol_active  ON rol_recordatorios(active) WHERE active = true;

ALTER TABLE rol_recordatorios ENABLE ROW LEVEL SECURITY;

-- Inserts públicos (las requests se validan vía Netlify Function, no directamente desde el browser).
-- Si decides exponer la insert directamente desde el cliente, esta policy ya lo permite.
DROP POLICY IF EXISTS "Public insert" ON rol_recordatorios;
CREATE POLICY "Public insert"     ON rol_recordatorios FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public select own" ON rol_recordatorios;
CREATE POLICY "Public select own" ON rol_recordatorios FOR SELECT USING (true);

-- Recomendación: agrega un constraint suave para evitar duplicados exactos
-- (mismo email + evento + separo). Comenta si necesitas permitir múltiples planes idénticos.
-- CREATE UNIQUE INDEX IF NOT EXISTS uniq_rol_sub
--   ON rol_recordatorios(email, evento_id, separo_fecha)
--   WHERE active = true;
