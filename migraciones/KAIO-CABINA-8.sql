-- =============================================================================
-- KAIO-CABINA-8 (25-oct-2026) — el vigilante aprende «programa sin locutor»
-- Base: PORTAL (muvvrstnkxsxfpkhbntq) — ahí vive el estado del radio-vigilante.
-- YA CORRIDA el 25-oct-2026 (vía MCP, verificada: la columna existe).
--
-- `programa_avisado` guarda la LLAVE de la última instancia de programa ya
-- avisada («<uuid del programa>|<fecha Reynosa>»): un aviso por instancia —
-- si el locutor nunca llega, NO se re-avisa cada 10 minutos; la instancia de
-- mañana tiene otra llave y vuelve a vigilarse sola.
--
-- La tabla radio_vigilante ya existía (1 fila, RLS deny-all, service_role) —
-- un ALTER no cambia permisos: el GRANT de la tabla la cubre.
-- =============================================================================

alter table public.radio_vigilante add column if not exists programa_avisado text;

-- Verificación (corrida: devuelve 1 fila con 'programa_avisado'):
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='radio_vigilante'
--    and column_name='programa_avisado';
