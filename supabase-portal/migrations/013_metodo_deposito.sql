-- ============================================================================
-- 013_metodo_deposito.sql
-- Refinamiento del modelo método/cuenta de pagos.
--
-- `metodo` = CÓMO pagó el cliente. Antes mezclaba bancos (bbva/hey) con formas
-- de pago. Ahora la UI solo ofrece: Transferencia / Depósito / Efectivo. El
-- banco/cuenta (BBVA/Banamex/Efectivo/Otro) vive en `cuenta` (migración 012).
--
-- Agrega 'deposito' al check de metodo. MANTIENE los valores viejos
-- ('bbva','hey','otro') como válidos para NO violar filas existentes — la UI ya
-- no los ofrece, pero la BD no los rechaza. Sin backfill.
-- ============================================================================

alter table public.pagos drop constraint if exists pagos_metodo_check;
alter table public.pagos add constraint pagos_metodo_check
  check (metodo in ('transferencia','deposito','efectivo','bbva','hey','otro'));

-- Recargar el cache de esquema de PostgREST.
notify pgrst, 'reload schema';
