-- ============================================================================
-- 004_solicitudes_rls.sql
-- Row Level Security para solicitudes_tour.
--
-- Modelo:
--   - Cliente lee solo sus solicitudes.
--   - Cliente inserta solo con su propio auth_user_id y cliente_id.
--   - Cliente puede editar solicitudes propias SOLO si están en estado 'pendiente'.
--     Cuando pasan a en_pagos/pagado/cancelado, quedan inmutables para el cliente.
--   - Cliente NO puede modificar: cliente_id, auth_user_id, estado, created_at.
--     Estos los controla un trigger porque RLS no restringe columnas.
--   - service_role tiene acceso total (Netlify Functions, Kamehouse admin futuro).
--   - Sin policy de DELETE — el cliente no borra; el admin sí vía service_role.
-- ============================================================================

alter table public.solicitudes_tour enable row level security;

-- ---------------------------------------------------------------------------
-- SELECT: cliente ve solo sus solicitudes
-- ---------------------------------------------------------------------------
drop policy if exists "solicitud_select_propio" on public.solicitudes_tour;
create policy "solicitud_select_propio"
  on public.solicitudes_tour
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- INSERT: cliente inserta solo con su auth_user_id y su cliente_id
-- ---------------------------------------------------------------------------
drop policy if exists "solicitud_insert_propio" on public.solicitudes_tour;
create policy "solicitud_insert_propio"
  on public.solicitudes_tour
  for insert
  to authenticated
  with check (
    auth_user_id = auth.uid()
    and exists (
      select 1 from public.clientes c
      where c.id = solicitudes_tour.cliente_id
        and c.auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- UPDATE: cliente actualiza solo solicitudes propias que sigan en 'pendiente'.
-- USING aplica al estado VIEJO; WITH CHECK aplica al estado NUEVO.
-- Si el cliente intenta tocar una en 'en_pagos' o posterior, USING la oculta.
-- ---------------------------------------------------------------------------
drop policy if exists "solicitud_update_propio_pendiente" on public.solicitudes_tour;
create policy "solicitud_update_propio_pendiente"
  on public.solicitudes_tour
  for update
  to authenticated
  using      (auth_user_id = auth.uid() and estado = 'pendiente')
  with check (auth_user_id = auth.uid() and estado = 'pendiente');

-- ---------------------------------------------------------------------------
-- Trigger: bloquea columnas inmutables para roles no-service_role.
-- RLS no puede restringir QUÉ columnas se modifican, solo qué filas.
-- ---------------------------------------------------------------------------
create or replace function public.solicitudes_bloquear_columnas_sensibles()
returns trigger
language plpgsql
security definer
as $$
begin
  if current_setting('role', true) <> 'service_role' then
    if new.cliente_id is distinct from old.cliente_id then
      raise exception 'cliente_id es inmutable';
    end if;
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'auth_user_id es inmutable';
    end if;
    if new.estado is distinct from old.estado then
      raise exception 'estado solo lo cambia el admin';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at es inmutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_solicitudes_bloquear_columnas on public.solicitudes_tour;
create trigger trg_solicitudes_bloquear_columnas
  before update on public.solicitudes_tour
  for each row execute function public.solicitudes_bloquear_columnas_sensibles();

-- ---------------------------------------------------------------------------
-- service_role: acceso total (Netlify Functions, Kamehouse admin)
-- ---------------------------------------------------------------------------
drop policy if exists "solicitud_service_role_all" on public.solicitudes_tour;
create policy "solicitud_service_role_all"
  on public.solicitudes_tour
  for all
  to service_role
  using (true)
  with check (true);
