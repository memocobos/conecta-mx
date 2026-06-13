-- =============================================================================
-- Esferas del Dragón — ETAPA B1: zonas con precios de venta.
-- Agrega la columna `zonas` a esferas_eventos.
--
-- JSON array de objetos:
--   [{"n":"General","p":3900,"pc":2350,"vip":0,"ag":0}, ...]
--   n  = nombre de la zona (string)
--   p  = precio paquete PLUS  (number >= 0)
--   pc = precio paquete CHEAP (number >= 0; 0/ausente = sin cheap)
--   vip = 0/1  · ag = 0/1 (agotada)
--
-- El compilador (generarObj) emite zonas:[...] y, solo si alguna zona tiene
-- pc>0, cheapZonas:[...] espejeada. Hotel/pagos siguen en B2.
--
-- Ejecuta una sola vez en Supabase (SQL editor). Idempotente.
-- =============================================================================

ALTER TABLE esferas_eventos ADD COLUMN IF NOT EXISTS zonas text;
-- JSON array de zonas con precios de venta (PLUS y CHEAP opcional).
