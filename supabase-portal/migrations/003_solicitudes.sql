-- ============================================================================
-- 003_solicitudes.sql
-- Tabla de solicitudes de tour del portal de Conecta MX.
-- Cada fila es una intención del cliente de viajar a un evento.
-- Estado va de 'pendiente' → 'en_pagos' → 'pagado' (o → 'cancelado').
-- ============================================================================

create table if not exists public.solicitudes_tour (
  id                       uuid primary key default gen_random_uuid(),
  cliente_id               uuid not null references public.clientes(id) on delete cascade,
  auth_user_id             uuid not null references auth.users(id) on delete cascade,
  evento_id                text not null,
  evento_nombre            text not null,
  paquete                  text not null check (paquete in ('PLUS','RIDE','STAY','CHEAP')),
  zona                     text not null,
  num_personas             integer not null default 1 check (num_personas between 1 and 12),
  -- Habitación: usamos los nombres reales de HOTEL_STD (no individual/doble/triple/cuadruple
  -- del prompt original, que no coinciden con los datos de eventos).
  tipo_habitacion          text check (tipo_habitacion in ('compartida','triple','doble','individual')),
  lleva_vuelo              boolean not null default false,
  codigo_vuelo             text,
  codigo_descuento         text,
  precio_total             numeric(10,2) not null check (precio_total >= 0),
  monto_separo             numeric(10,2) not null check (monto_separo >= 0),
  comprobante_separo_url   text,
  notas_cliente            text,
  estado                   text not null default 'pendiente'
                                check (estado in ('pendiente','en_pagos','pagado','cancelado')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ============================================================================
-- Triggers
-- ============================================================================

-- BEFORE UPDATE: refrescar updated_at
create or replace function public.solicitudes_tour_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_solicitudes_before_update on public.solicitudes_tour;
create trigger trg_solicitudes_before_update
  before update on public.solicitudes_tour
  for each row execute function public.solicitudes_tour_before_update();

-- ============================================================================
-- Índices
-- ============================================================================
create index if not exists idx_solicitudes_cliente_id     on public.solicitudes_tour (cliente_id);
create index if not exists idx_solicitudes_auth_user_id   on public.solicitudes_tour (auth_user_id);
create index if not exists idx_solicitudes_evento_id      on public.solicitudes_tour (evento_id);
create index if not exists idx_solicitudes_estado         on public.solicitudes_tour (estado);
create index if not exists idx_solicitudes_created_at     on public.solicitudes_tour (created_at desc);
