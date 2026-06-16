-- =============================================================================
-- Esferas del Dragón — CIERRE: 3 campos comunes que faltaban en la captura.
-- Agrega inc, sep, sep_cheap, nota.
--
--   inc        JSON array de strings ("qué incluye" — Boleto, Transporte, etc.).
--   sep        separo PLUS (entero >=0; default 500 si null/ausente al compilar).
--   sep_cheap  separo CHEAP (entero >=0; solo se emite si el evento tiene cheap).
--   nota       aviso especial (texto libre; vacío = sin nota).
--
-- Los eventos sin estos campos quedan byte-coherentes (inc:[], sep:500, sin
-- sepCheap, sin nota). Ejecuta una sola vez en Supabase (SQL editor). Idempotente.
-- =============================================================================

ALTER TABLE esferas_eventos ADD COLUMN IF NOT EXISTS inc text;         -- JSON array strings
ALTER TABLE esferas_eventos ADD COLUMN IF NOT EXISTS sep integer;      -- separo PLUS
ALTER TABLE esferas_eventos ADD COLUMN IF NOT EXISTS sep_cheap integer;-- separo CHEAP
ALTER TABLE esferas_eventos ADD COLUMN IF NOT EXISTS nota text;        -- aviso especial
