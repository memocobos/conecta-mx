-- =============================================================================
-- SEG-1 · El candado de Posponer
--
-- Dos columnas en la bitácora de posposiciones:
--   · pagos_fallidos_ids — ids de las cuotas que NO se pudieron recorrer al
--     posponer. El reintento mueve SOLO éstas (nunca las que ya se movieron), y
--     las vacía al lograrlo. '[]' = no quedó nada pendiente.
--   · aviso_enviado — cuándo salió el aviso a los clientes. NULL = falta avisar,
--     y eso se pinta en la fila del evento en Esferas.
--
-- Ambas aditivas: lo que ya existe sigue funcionando con los defaults.
-- La tabla es deny-all (solo service_role la toca): no hay política que tocar.
--
-- Corrida y verificada contra information_schema el 14-ago-2026.
-- =============================================================================

ALTER TABLE eventos_posposiciones
  ADD COLUMN IF NOT EXISTS pagos_fallidos_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS aviso_enviado timestamptz;

COMMENT ON COLUMN eventos_posposiciones.pagos_fallidos_ids IS
  'SEG-1: ids de pagos del Portal que fallaron al recorrerse. El reintento mueve solo éstos.';
COMMENT ON COLUMN eventos_posposiciones.aviso_enviado IS
  'SEG-1: cuándo se avisó a los clientes. NULL = pendiente visible en la fila del evento.';

-- Verificación (esperado: 2 filas):
-- select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_name = 'eventos_posposiciones'
--    and column_name in ('pagos_fallidos_ids','aviso_enviado');
