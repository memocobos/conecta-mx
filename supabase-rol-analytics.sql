-- ============================================================================
-- supabase-rol-analytics.sql
-- Tabla de eventos de uso de /rol para analytics anónimo.
--
-- Corre esto en el proyecto Supabase de Kamehouse:
--   https://supabase.com/dashboard/project/npgnhsmwpcipxgvfxrho/sql/new
--
-- Privacidad: NO se guardan emails, nombres, IP del cliente ni comprobantes.
-- session_id es aleatorio, vive en sessionStorage del navegador y se borra al
-- cerrar el browser. El user_agent se guarda solo para distinguir mobile/desktop
-- en análisis agregado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rol_eventos_uso (
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
  tipo_compra     text,
  user_agent      text,
  pathname        text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uso_session ON rol_eventos_uso(session_id);
CREATE INDEX IF NOT EXISTS idx_uso_accion  ON rol_eventos_uso(accion);
CREATE INDEX IF NOT EXISTS idx_uso_evento  ON rol_eventos_uso(evento_id);
CREATE INDEX IF NOT EXISTS idx_uso_created ON rol_eventos_uso(created_at);

ALTER TABLE rol_eventos_uso ENABLE ROW LEVEL SECURITY;

-- INSERT abierto: el frontend puede registrar eventos sin auth (el rate-limit
-- vive en la Netlify Function que llamamos, no en RLS).
DROP POLICY IF EXISTS "Public insert uso" ON rol_eventos_uso;
CREATE POLICY "Public insert uso" ON rol_eventos_uso
  FOR INSERT WITH CHECK (true);

-- SELECT abierto: el dashboard de Kamehouse usa el anon key del proyecto y lee
-- agregados con queries directas (sin RPC). El control de acceso al dashboard
-- está en el frontend de Kamehouse (rol maestro_roshi / bulma).
DROP POLICY IF EXISTS "Public read uso" ON rol_eventos_uso;
CREATE POLICY "Public read uso" ON rol_eventos_uso
  FOR SELECT USING (true);
