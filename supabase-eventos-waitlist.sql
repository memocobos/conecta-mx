-- Lista de espera de eventos "PRÓXIMAMENTE".
-- Correr en proyecto Supabase: npgnhsmwpcipxgvfxrho (kamehouse).
--
-- Tabla principal: registros de clientes interesados por evento.
-- Tabla snapshot: rastrea el estado anterior de cada evento para detectar
-- la transición proximamente -> activo y disparar las notificaciones masivas.

CREATE TABLE IF NOT EXISTS eventos_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id text NOT NULL,
  evento_nombre text NOT NULL,
  nombre text NOT NULL,
  email text NOT NULL,
  notificado boolean DEFAULT false,
  notificado_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wl_evento ON eventos_waitlist(evento_id);
CREATE INDEX IF NOT EXISTS idx_wl_email  ON eventos_waitlist(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wl_unique ON eventos_waitlist(evento_id, email);

ALTER TABLE eventos_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public insert waitlist" ON eventos_waitlist;
CREATE POLICY "Public insert waitlist" ON eventos_waitlist FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public read waitlist" ON eventos_waitlist;
CREATE POLICY "Public read waitlist"   ON eventos_waitlist FOR SELECT USING (true);

-- Snapshot del estado de cada evento — la función de notificación lo compara
-- contra el estado actual del array EV y dispara emails cuando detecta el
-- cambio de 'proximamente' a '' (activo).
CREATE TABLE IF NOT EXISTS eventos_estado_snapshot (
  evento_id  text PRIMARY KEY,
  estado     text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE eventos_estado_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public all snapshot" ON eventos_estado_snapshot;
CREATE POLICY "Public all snapshot" ON eventos_estado_snapshot FOR ALL USING (true);
