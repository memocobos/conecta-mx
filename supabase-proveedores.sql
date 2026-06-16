-- =============================================================================
-- Palacio de Kamisama — TUERCA 1b: catálogo de PROVEEDORES (proyecto KH legacy).
-- Primera tabla del Palacio. Las compras (1c) y abonos (1d) elegirán proveedor.
--
-- Ejecuta una sola vez en Supabase (SQL editor) del proyecto KH
-- (npgnhsmwpcipxgvfxrho). Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Sembrar "Matriz" por default (idempotente, case-insensitive).
INSERT INTO proveedores (nombre)
SELECT 'Matriz'
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE lower(nombre) = 'matriz');
