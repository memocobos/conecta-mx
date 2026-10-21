-- =============================================================================
-- STRIKE-DEDUP-1 · 20-oct-2026 · YA CORRIDO (Jane)
--
-- El cron check-strikes-diario aplicaba el MISMO strike todos los días: Alexa
-- recibió «Reporte no enviado — Rodeo Saltillo» el 19 y otra vez el 20 (2/3), y
-- el 21 la habría SUSPENDIDO. La causa: la bitácora strikes_log NUNCA aceptó una
-- fila del cron, por DOS candados que el código no conocía:
--   1) por_quien NOT NULL — el cron escribe null (no hay humano detrás);
--   2) CHECK de accion = ('asignado','quitado') — el cron escribe
--      'strike_reporte_no_enviado' / 'strike_devolucion_pendiente' /
--      'strike_faltante_bodega', y admin-coordi-control 'strike_manual'.
-- Sin bitácora, el dedup (_yaExisteStrikeReporte) nunca encontraba el previo.
-- =============================================================================
alter table strikes_log alter column por_quien drop not null;
alter table strikes_log drop constraint strikes_log_accion_check;
alter table strikes_log add constraint strikes_log_accion_check check (accion = any (array[
  'asignado','quitado','strike_manual',
  'strike_reporte_no_enviado','strike_devolucion_pendiente','strike_faltante_bodega']));

-- Asientos tardíos para que el cron no repita los strikes ya aplicados
-- (Alexa/julionrodep, Allan/alejandrosanz, Ximena/vaiven), y Alexa a 0 strikes
-- por palabra de Memo (el Rodeo se canceló: no había reporte que entregar).
-- Ver las filas con fecha 20/21-oct en strikes_log.
