-- =============================================================================
-- Esferas del Dragón — Multifecha en FICHA (varias fechas del mismo artista).
-- Agrega la columna `fechas_extra` a esferas_eventos.
--
-- JSON array de fechas ADICIONALES 'YYYY-MM-DD' (la primera fecha sigue viviendo
-- en fecha_inicio). El compilador junta [fecha_inicio, ...fechas_extra], ordena
-- y dedupe; con 2+ fechas emite dsList en el objeto-evento del index.
--
-- NO toca precios/zonas (eso es el multifecha-festival = Palacio, otra fase).
-- Ejecuta una sola vez en Supabase (SQL editor). Idempotente.
-- =============================================================================

ALTER TABLE esferas_eventos ADD COLUMN IF NOT EXISTS fechas_extra text;
-- JSON array de fechas adicionales 'YYYY-MM-DD' (la primera sigue en fecha_inicio).
