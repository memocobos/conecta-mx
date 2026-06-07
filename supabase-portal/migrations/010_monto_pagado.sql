-- ============================================================================
-- 010_monto_pagado.sql
-- Fase 3.2 — Monto real pagado por cada pago del plan.
--
-- Hasta ahora un pago marcado 'pagado' asumía que se pagó EXACTAMENTE el monto
-- del plan (columna `monto`). Para cobros exactos rápidos pero flexibles (el
-- cliente puede pagar distinto: abono parcial, redondeo, etc.) guardamos el
-- monto realmente pagado en `monto_pagado`.
--
-- Compatibilidad hacia atrás:
--   monto_pagado NULL  →  se usó el monto del plan. El cálculo de "abonado"
--   hace COALESCE(monto_pagado, monto), así que los pagos marcados antes de
--   esta fase siguen sumando su `monto` original sin tocar nada.
--
-- nullable + opcional. No cambia RLS (008) ni triggers (007): service_role
-- ya tiene acceso total y el cliente sigue sin poder escribir pagos.
-- ============================================================================

alter table public.pagos
  add column if not exists monto_pagado numeric(10,2) check (monto_pagado >= 0);
