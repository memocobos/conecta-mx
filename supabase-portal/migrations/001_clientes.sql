-- ============================================================================
-- 001_clientes.sql
-- Tabla principal de clientes del portal de Conecta MX.
-- Cada fila representa un cliente registrado con perfil completo.
-- ============================================================================

-- Secuencia para numero_cliente, arranca en 1000 (los 1000 quemados son para
-- compatibilidad histórica con el Excel viejo de 58 pestañas).
create sequence if not exists numero_cliente_seq start with 1000 increment by 1;

-- Tabla clientes
create table if not exists public.clientes (
  id                              uuid primary key default gen_random_uuid(),
  auth_user_id                    uuid unique not null references auth.users(id) on delete cascade,
  numero_cliente                  integer unique not null,
  correo                          text unique not null,
  nombre_completo                 text not null,
  fecha_nacimiento                date not null,
  celular                         text not null,
  correo_ticketmaster             text,
  talla_playera                   text not null check (talla_playera in ('XS','S','M','L','XL','XXL')),
  contacto_emergencia_nombre      text not null,
  contacto_emergencia_telefono    text not null,
  contacto_emergencia_relacion    text,
  notas_internas                  text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  ultima_actividad                timestamptz not null default now()
);

-- ============================================================================
-- Triggers
-- ============================================================================

-- BEFORE INSERT: asignar numero_cliente desde la secuencia + forzar correo en lowercase.
create or replace function public.clientes_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.numero_cliente is null then
    new.numero_cliente := nextval('numero_cliente_seq');
  end if;
  new.correo := lower(new.correo);
  if new.correo_ticketmaster is not null then
    new.correo_ticketmaster := lower(new.correo_ticketmaster);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clientes_before_insert on public.clientes;
create trigger trg_clientes_before_insert
  before insert on public.clientes
  for each row execute function public.clientes_before_insert();

-- BEFORE UPDATE: refrescar updated_at + lowercase de correos si cambian.
create or replace function public.clientes_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.correo is distinct from old.correo then
    new.correo := lower(new.correo);
  end if;
  if new.correo_ticketmaster is distinct from old.correo_ticketmaster
     and new.correo_ticketmaster is not null then
    new.correo_ticketmaster := lower(new.correo_ticketmaster);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clientes_before_update on public.clientes;
create trigger trg_clientes_before_update
  before update on public.clientes
  for each row execute function public.clientes_before_update();

-- ============================================================================
-- Índices
-- ============================================================================
create index if not exists idx_clientes_correo          on public.clientes (correo);
create index if not exists idx_clientes_auth_user_id    on public.clientes (auth_user_id);
create index if not exists idx_clientes_numero_cliente  on public.clientes (numero_cliente);
