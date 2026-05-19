-- ============================================================================
-- supabase-sistema-alertas-grants.sql
--
-- GRANTs para la tabla `sistema_alertas` (usada por Mística / Montaña Pai).
-- Resuelve el 401 "permission denied for table sistema_alertas" en queries
-- desde el frontend con la anon key.
--
-- Correr en el proyecto Supabase de Kamehouse:
--   https://supabase.com/dashboard/project/npgnhsmwpcipxgvfxrho/sql/new
--
-- Patrón idéntico al que aplicamos antes a rol_eventos_uso, main_eventos_uso,
-- pagos_eventos_uso y radar_alertas. PostgREST chequea el GRANT antes de
-- evaluar RLS — sin estos, una query con anon key devuelve 401 aunque la
-- policy permita acceso.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON sistema_alertas TO anon, authenticated;
GRANT ALL                    ON sistema_alertas TO service_role;
