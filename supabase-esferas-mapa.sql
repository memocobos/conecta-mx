-- =============================================================================
-- Esferas del Dragón — MAPA DEL VENUE (imagen): captura del mapa para conciertos.
-- Agrega la columna `mapa`.
--
-- Guarda la URL pública COMPLETA de la imagen subida al bucket público
-- 'mapas-eventos' (proyecto KH npgnhsmwpcipxgvfxrho), p.ej.:
--   https://npgnhsmwpcipxgvfxrho.supabase.co/storage/v1/object/public/mapas-eventos/<slug>.webp
--
-- Vacío / ausente → el evento no tiene mapa; el sitio muestra "🗺️ Mapa próximamente".
-- Los 56 mapas legacy (clave → mapas.js) NO usan esta columna; siguen igual.
--
-- Ejecuta una sola vez en Supabase (SQL editor). Idempotente.
-- =============================================================================

ALTER TABLE esferas_eventos ADD COLUMN IF NOT EXISTS mapa text;
-- URL pública completa del mapa (o vacío = sin mapa / "próximamente").
