-- ============================================================================
-- 006_notas_admin.sql
-- Agrega columna notas_admin a solicitudes_tour.
--
-- Contexto Fase 2.2b: vista admin de solicitudes en Kamehouse. Cuando un
-- admin cambia el estado (pendiente → en_pagos → pagado / cancelado) puede
-- dejar una nota interna explicando la razón. Es solo de uso administrativo;
-- el cliente NO la ve.
--
-- Seguridad:
--   - El trigger solicitudes_bloquear_columnas_sensibles (003+004) ya bloquea
--     los UPDATE de cliente sobre estado/cliente_id/auth_user_id/created_at,
--     pero NO bloquea notas_admin porque el cliente nunca debió poder verla.
--   - La RLS de UPDATE (solicitud_update_propio_pendiente) limita al cliente
--     a su propia solicitud en estado 'pendiente', y este campo no aparece en
--     ningún path del frontend cliente.
--   - service_role (Netlify Functions) tiene acceso total — esa es la única
--     ruta de escritura prevista.
--   - Para protección defensiva contra clientes "vivos" que intenten escribir
--     notas_admin desde el portal con su anon JWT, agregamos un guard al
--     trigger existente.
-- ============================================================================

alter table public.solicitudes_tour
  add column if not exists notas_admin text;

-- Reescribir el trigger de columnas sensibles para incluir notas_admin.
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
    if new.notas_admin is distinct from old.notas_admin then
      raise exception 'notas_admin es solo de admin';
    end if;
  end if;
  return new;
end;
$$;
