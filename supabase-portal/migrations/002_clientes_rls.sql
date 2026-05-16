-- ============================================================================
-- 002_clientes_rls.sql
-- Row Level Security para la tabla clientes.
--
-- Modelo:
--   - El cliente autenticado ve y modifica SOLO su propia fila.
--   - El cliente NO puede modificar campos sensibles (numero_cliente,
--     auth_user_id, correo, notas_internas, created_at) — los protege un
--     trigger porque RLS por sí solo no permite restringir columnas en UPDATE.
--   - service_role (Netlify Functions) tiene acceso total.
--   - No hay policy de DELETE: nadie puede borrar clientes desde el portal.
-- ============================================================================

alter table public.clientes enable row level security;

-- ---------------------------------------------------------------------------
-- Cliente: SELECT su propia fila
-- ---------------------------------------------------------------------------
drop policy if exists "cliente_select_propio" on public.clientes;
create policy "cliente_select_propio"
  on public.clientes
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Cliente: INSERT solo con su propio auth_user_id
-- ---------------------------------------------------------------------------
drop policy if exists "cliente_insert_propio" on public.clientes;
create policy "cliente_insert_propio"
  on public.clientes
  for insert
  to authenticated
  with check (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Cliente: UPDATE solo su propia fila
-- ---------------------------------------------------------------------------
drop policy if exists "cliente_update_propio" on public.clientes;
create policy "cliente_update_propio"
  on public.clientes
  for update
  to authenticated
  using      (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Trigger: bloquea cambios a columnas protegidas cuando el rol no es service_role.
-- (RLS no restringe columnas en UPDATE; este trigger lo hace.)
-- ---------------------------------------------------------------------------
create or replace function public.clientes_bloquear_columnas_sensibles()
returns trigger
language plpgsql
security definer
as $$
begin
  if current_setting('role', true) <> 'service_role' then
    if new.numero_cliente is distinct from old.numero_cliente then
      raise exception 'numero_cliente es inmutable para el cliente';
    end if;
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'auth_user_id es inmutable para el cliente';
    end if;
    if new.correo is distinct from old.correo then
      raise exception 'correo es inmutable desde el portal — contacta soporte';
    end if;
    if new.notas_internas is distinct from old.notas_internas then
      raise exception 'notas_internas es solo de admin';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at es inmutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clientes_bloquear_columnas_sensibles on public.clientes;
create trigger trg_clientes_bloquear_columnas_sensibles
  before update on public.clientes
  for each row execute function public.clientes_bloquear_columnas_sensibles();

-- ---------------------------------------------------------------------------
-- service_role: acceso total
-- ---------------------------------------------------------------------------
drop policy if exists "service_role_all" on public.clientes;
create policy "service_role_all"
  on public.clientes
  for all
  to service_role
  using (true)
  with check (true);

-- NOTA: deliberadamente no se crea ninguna policy de DELETE.
-- El bypass de RLS de service_role permite borrar desde Functions si algún día
-- se necesita (por ejemplo, GDPR/derecho al olvido), pero el cliente nunca
-- podrá borrarse a sí mismo desde el portal.
