-- ============================================================================
-- supabase-radar-tracking.sql
-- 3 tablas para el Radar del Dragón:
--   - main_eventos_uso   → tracking del sitio principal (conectareynosa.mx)
--   - pagos_eventos_uso  → tracking de /pagos
--   - radar_alertas      → anomalías detectadas por el cron
--
-- Correr en el proyecto Supabase de Kamehouse:
--   https://supabase.com/dashboard/project/npgnhsmwpcipxgvfxrho/sql/new
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Sitio principal
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS main_eventos_uso (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      text NOT NULL,
  accion          text NOT NULL,
  evento_id       text,
  evento_nombre   text,
  paquete         text,
  zona            text,
  precio_zona     numeric,
  habitacion      text,
  transporte      text,
  precio_total    numeric,
  paso_wizard     text,
  codigo_aplicado text,
  codigo_valido   boolean,
  filtro_usado    text,
  origen_trafico  text,
  device          text,
  user_agent      text,
  pathname        text,
  referrer        text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_main_session ON main_eventos_uso(session_id);
CREATE INDEX IF NOT EXISTS idx_main_accion  ON main_eventos_uso(accion);
CREATE INDEX IF NOT EXISTS idx_main_evento  ON main_eventos_uso(evento_id);
CREATE INDEX IF NOT EXISTS idx_main_created ON main_eventos_uso(created_at);

ALTER TABLE main_eventos_uso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public insert main" ON main_eventos_uso;
CREATE POLICY "Public insert main" ON main_eventos_uso FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public read main" ON main_eventos_uso;
CREATE POLICY "Public read main" ON main_eventos_uso FOR SELECT USING (true);
GRANT SELECT, INSERT ON main_eventos_uso TO anon, authenticated;
GRANT ALL ON main_eventos_uso TO service_role;

-- ----------------------------------------------------------------------------
-- 2) /pagos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos_eventos_uso (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      text NOT NULL,
  accion          text NOT NULL,
  cuenta_copiada  text,
  origen          text,
  device          text,
  user_agent      text,
  referrer        text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_session ON pagos_eventos_uso(session_id);
CREATE INDEX IF NOT EXISTS idx_pagos_accion  ON pagos_eventos_uso(accion);
CREATE INDEX IF NOT EXISTS idx_pagos_created ON pagos_eventos_uso(created_at);

ALTER TABLE pagos_eventos_uso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public insert pagos" ON pagos_eventos_uso;
CREATE POLICY "Public insert pagos" ON pagos_eventos_uso FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public read pagos" ON pagos_eventos_uso;
CREATE POLICY "Public read pagos" ON pagos_eventos_uso FOR SELECT USING (true);
GRANT SELECT, INSERT ON pagos_eventos_uso TO anon, authenticated;
GRANT ALL ON pagos_eventos_uso TO service_role;

-- ----------------------------------------------------------------------------
-- 3) Alertas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS radar_alertas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL,
  severidad       text NOT NULL DEFAULT 'info',
  titulo          text NOT NULL,
  mensaje         text NOT NULL,
  datos           jsonb,
  vista           boolean DEFAULT false,
  email_enviado   boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_radar_tipo    ON radar_alertas(tipo);
CREATE INDEX IF NOT EXISTS idx_radar_vista   ON radar_alertas(vista);
CREATE INDEX IF NOT EXISTS idx_radar_created ON radar_alertas(created_at);

ALTER TABLE radar_alertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public all alertas" ON radar_alertas;
CREATE POLICY "Public all alertas" ON radar_alertas FOR ALL USING (true);
GRANT SELECT, INSERT, UPDATE ON radar_alertas TO anon, authenticated;
GRANT ALL ON radar_alertas TO service_role;
