-- =============================================================================
-- Esferas del Dragón — ETAPA B2 (PAGOS): calendario de quincenas.
-- Agrega la columna `pagos` a esferas_eventos.
--
-- JSON array de objetos:
--   [{"l":"Separo","d":"Hoy"},{"l":"Pago 1","d":"9-16 abr"},...]
--   l = label del pago (Separo, Pago 1, Pago final, Liquidacion…)
--   d = rango de fechas como texto libre ("Hoy", "9-16 abr")
--
-- `s` NO se guarda: se DERIVA del label al compilar
--   (s = 1 solo si l.toLowerCase() === 'separo', si no 0).
--
-- El compilador (generarObj) emite pagos:[{l,d,s},...] en orden. Hotel custom = B2b.
-- Ejecuta una sola vez en Supabase (SQL editor). Idempotente.
-- =============================================================================

ALTER TABLE esferas_eventos ADD COLUMN IF NOT EXISTS pagos text;
-- JSON array del calendario de pagos [{l,d}]; s se deriva del label al compilar.
