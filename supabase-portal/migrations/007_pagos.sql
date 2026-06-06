-- ============================================================================
-- 007_pagos.sql
-- Tabla de pagos del portal de Conecta MX.
-- Cada fila es UN pago dentro del plan de una solicitud_tour:
--   numero_pago = 1  → Separo (primer pago)
--   numero_pago = 2..N → quincenas (o liquidación si el evento es muy cercano)
--
-- El plan se genera AUTOMÁTICAMENTE cuando un admin de Kamehouse aprueba una
-- solicitud (estado → en_pagos) vía la función admin-generar-plan-pagos.
-- En esta fase (2.3a) los pagos nacen 'pendiente'; marcarlos 'pagado',
-- recibos y comprobantes vienen en fases posteriores.
--
-- Mismo estilo que 003_solicitudes.sql: secuencia de columnas, trigger
-- BEFORE UPDATE para updated_at, índices al final.
-- ============================================================================

create table if not exists public.pagos (
  id               uuid primary key default gen_random_uuid(),
  solicitud_id     uuid not null references public.solicitudes_tour(id) on delete cascade,
  cliente_id       uuid not null references public.clientes(id) on delete cascade,
  auth_user_id     uuid not null references auth.users(id) on delete cascade,
  numero_pago      integer not null,                 -- 1 = separo, 2.. = quincenas
  concepto         text not null,                    -- 'Separo', '9 al 16 de jul', etc.
  monto            numeric(10,2) not null check (monto >= 0),
  fecha_esperada   date not null,
  fecha_pagada     date,                             -- null hasta que se pague (Fase 2.3c)
  estado           text not null default 'pendiente'
                        check (estado in ('pendiente','pagado','vencido','cancelado')),
  metodo           text check (metodo in ('bbva','hey','efectivo','transferencia','otro')),
  referencia       text,
  comprobante_url  text,
  recibo_url       text,
  recibo_enviado   boolean not null default false,
  registrado_por   text,                             -- email/rol del admin de Kamehouse (NO es FK)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Idempotencia: aprobar dos veces NO duplica el plan.
  unique (solicitud_id, numero_pago)
);

-- ============================================================================
-- Triggers
-- ============================================================================

-- BEFORE UPDATE: refrescar updated_at (mismo patrón que solicitudes_tour)
create or replace function public.pagos_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pagos_before_update on public.pagos;
create trigger trg_pagos_before_update
  before update on public.pagos
  for each row execute function public.pagos_before_update();

-- ============================================================================
-- Índices
-- ============================================================================
create index if not exists idx_pagos_solicitud_id    on public.pagos (solicitud_id);
create index if not exists idx_pagos_auth_user_id     on public.pagos (auth_user_id);
create index if not exists idx_pagos_estado           on public.pagos (estado);
create index if not exists idx_pagos_fecha_esperada   on public.pagos (fecha_esperada);
