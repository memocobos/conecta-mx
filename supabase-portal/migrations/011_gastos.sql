-- ============================================================================
-- 011_gastos.sql
-- Tabla de gastos (egresos) del portal de Conecta MX — reconstrucción G1.
--
-- Reemplaza la vieja tabla gastos_generales del Supabase de Kamehouse (ligada a
-- la tabla vieja de eventos y con RLS que bloqueaba escrituras). Aquí los gastos
-- viven en el portal y se ligan a los eventos del array EV de index.html por
-- evento_id de TEXTO (base, p.ej. 'karolg', o base+'#'+idx para multifecha),
-- igual que los ingresos/pagos. No hay FK a ninguna tabla de eventos: el nombre
-- del evento lo resuelve el front desde EV.
--
-- Acceso: SOLO service_role (Netlify Functions admin). El cliente NUNCA accede.
-- Mismo patrón RLS que 008_pagos_rls.sql.
-- ============================================================================

create table if not exists public.gastos (
  id             uuid primary key default gen_random_uuid(),
  evento_id      text,                         -- EV base o base#idx; null = General
  concepto       text not null,
  monto          numeric(10,2) not null check (monto >= 0),
  categoria      text,                         -- Transporte, Hospedaje, Kits, etc.
  metodo_pago    text,
  fecha          date not null,
  notas          text,
  registrado_por text,                         -- correo/rol del admin (NO es FK)
  created_at     timestamptz not null default now()
);

create index if not exists idx_gastos_evento on public.gastos (evento_id);
create index if not exists idx_gastos_fecha  on public.gastos (fecha);

-- ============================================================================
-- RLS — solo service_role (igual patrón que pagos): el cliente NO accede;
-- todo pasa por las funciones admin con service_role.
-- ============================================================================
alter table public.gastos enable row level security;

drop policy if exists "gasto_service_role_all" on public.gastos;
create policy "gasto_service_role_all"
  on public.gastos
  for all
  to service_role
  using (true)
  with check (true);
