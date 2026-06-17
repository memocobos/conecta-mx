-- =============================================================================
-- Palacio de Kamisama — TUERCA 1c: COMPRAS (inventario manual de boletos en lotes).
-- Proyecto KH legacy (npgnhsmwpcipxgvfxrho). Requiere la tabla `proveedores` (1b).
--
-- Cada fila = un lote comprado de una zona de un evento (cantidad + costo unitario
-- + proveedor). El Palacio calcula stock y deuda por zona/evento sumando estas
-- filas. NADA automático (ventas/apagado/semáforo) — eso es Capa 2.
--
-- Ejecuta una sola vez en el SQL editor del proyecto KH. Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id text NOT NULL,              -- slug del evento (id del array EV)
  zona text NOT NULL,                   -- nombre de la zona (ej. 'General')
  cantidad integer NOT NULL CHECK (cantidad >= 0),
  costo_unitario numeric NOT NULL CHECK (costo_unitario >= 0),
  proveedor_id uuid NOT NULL REFERENCES proveedores(id),
  fecha date NOT NULL DEFAULT current_date,
  nota text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compras_evento ON compras(evento_id);
