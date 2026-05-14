-- Deliverables (material entregable) por asignación de evento a creadora.
-- 1-N: una eventos_coordi (un evento asignado a un usuario) tiene varios deliverables.
-- Si la asignación se borra, sus deliverables se borran en cascada.

CREATE TABLE IF NOT EXISTS deliverables_creadoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_coordi_id uuid REFERENCES eventos_coordi(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  estado text DEFAULT 'pendiente',         -- pendiente | completado
  notas text,
  link_contenido text,                     -- URL del video/post entregado
  completado_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliv_evento ON deliverables_creadoras(evento_coordi_id);

ALTER TABLE deliverables_creadoras ENABLE ROW LEVEL SECURITY;

-- Mismo patrón permisivo que contratos_creadoras (acceso vía anon con token de sesión).
DROP POLICY IF EXISTS "Public read deliverables" ON deliverables_creadoras;
CREATE POLICY "Public read deliverables" ON deliverables_creadoras FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public write deliverables" ON deliverables_creadoras;
CREATE POLICY "Public write deliverables" ON deliverables_creadoras FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update deliverables" ON deliverables_creadoras;
CREATE POLICY "Public update deliverables" ON deliverables_creadoras FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public delete deliverables" ON deliverables_creadoras;
CREATE POLICY "Public delete deliverables" ON deliverables_creadoras FOR DELETE USING (true);
