-- ============================================================================
-- 008_pagos_rls.sql
-- Row Level Security para pagos.
--
-- Modelo:
--   - Cliente LEE solo sus pagos (auth_user_id = auth.uid()).
--   - Cliente NUNCA escribe pagos. NO hay policies de INSERT/UPDATE/DELETE
--     para authenticated: todo lo escribe el backend con service_role
--     (admin-generar-plan-pagos y futuras functions de confirmación de pago).
--   - service_role tiene acceso total (Netlify Functions, Kamehouse admin).
-- ============================================================================

alter table public.pagos enable row level security;

-- ---------------------------------------------------------------------------
-- SELECT: el cliente ve solo sus pagos
-- ---------------------------------------------------------------------------
drop policy if exists "pago_select_propio" on public.pagos;
create policy "pago_select_propio"
  on public.pagos
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- service_role: acceso total (Netlify Functions, Kamehouse admin)
-- ---------------------------------------------------------------------------
drop policy if exists "pago_service_role_all" on public.pagos;
create policy "pago_service_role_all"
  on public.pagos
  for all
  to service_role
  using (true)
  with check (true);
