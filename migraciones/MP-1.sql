-- =============================================================================
-- MP-1 · LINKS DE PAGO DE MERCADO PAGO (Checkout Pro) — la base
-- 8-nov-2026 · palabra de Memo (domingo): links de pago al reservar en el
-- index, por cuota en el Portal y como botón en KameHouse; la COMISIÓN se le
-- cobra al cliente; al caer el pago el sistema MARCA «pagado en MP» y Bulma
-- aprueba (nada automático decide dinero — el rumbo del 12-oct).
--
-- Esta acta cubre la FASE 1a (requisición del index). Las fases 1b (botón en
-- KameHouse por viajero) y 1c (Portal por cuota) reusan la misma tabla.
--
-- 🔒 Regla de la casa (30-oct): toda tabla nueva lleva su GRANT a service_role
-- y RLS deny-all. Nadie la lee desde el navegador.
-- =============================================================================

-- 1) La bitácora de pagos de Mercado Pago. UNA fila por pago de MP (su id es
--    único en MP, así que el webhook es idempotente por construcción: el 2º
--    aviso del mismo pago choca con el UNIQUE y se confirma como «ya estaba»).
create table if not exists public.mp_pagos (
  id                  uuid primary key default gen_random_uuid(),
  mp_payment_id       text not null unique,
  preference_id       text,
  external_reference  text not null,          -- 'req:R-XXXXX' · 'vj:<uuid>' · 'vj:<uuid>:cuota:N'
  requisicion_id      uuid,                   -- cuando la referencia es una requisición
  viajero_id          uuid,                   -- cuando la referencia es un viajero (1b/1c)
  monto_esperado      numeric(12,2) not null check (monto_esperado >= 0),  -- lo que debía cubrir (sin comisión)
  monto_cobrado       numeric(12,2) not null check (monto_cobrado >= 0),   -- transaction_amount (con comisión)
  comision            numeric(12,2) not null default 0 check (comision >= 0),
  neto                numeric(12,2),           -- net_received_amount que reporta MP
  metodo              text,                    -- payment_type_id: credit_card · debit_card · ticket (OXXO) · bank_transfer…
  estado              text not null check (estado in ('approved','pending','in_process','rejected','cancelled','refunded','charged_back','authorized')),
  status_detail       text,
  payload             jsonb,                   -- el pago tal cual lo contestó la API (para auditar)
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index if not exists idx_mp_pagos_ref on public.mp_pagos (external_reference);
create index if not exists idx_mp_pagos_req on public.mp_pagos (requisicion_id) where requisicion_id is not null;
create index if not exists idx_mp_pagos_vj  on public.mp_pagos (viajero_id) where viajero_id is not null;

alter table public.mp_pagos enable row level security;
revoke all on public.mp_pagos from anon, authenticated;
grant select, insert, update, delete on public.mp_pagos to service_role;

-- 2) La requisición aprende su link y su pago.
alter table public.requisiciones
  add column if not exists mp_preference_id text,
  add column if not exists mp_init_point    text,
  add column if not exists mp_monto_cobrar  numeric(12,2),   -- separo + comisión (lo que dice el link)
  add column if not exists mp_pago_id       text,            -- el pago APROBADO (uno; el 2º se rechaza por valor esperado)
  add column if not exists mp_monto         numeric(12,2),   -- lo que MP cobró
  add column if not exists mp_pagado_at     timestamptz;

-- 3) El abono guarda la referencia del pago de MP (su «comprobante» es el id).
alter table public.abonos_viajero
  add column if not exists mp_pago_id text;

comment on table  public.mp_pagos is 'MP-1: bitácora de pagos de Mercado Pago (Checkout Pro). El webhook la llena; la aprobación humana lee de aquí.';
comment on column public.requisiciones.mp_pago_id is 'MP-1: id del pago de Mercado Pago APROBADO para esta requisición (null = sin pagar). Lo escribe el webhook.';
comment on column public.abonos_viajero.mp_pago_id is 'MP-1: el abono nació de un pago de Mercado Pago; su comprobante es este id (no hay foto).';

-- =============================================================================
-- REGISTRO: ✅ YA CORRIDA (8-nov-2026, apply_migration `mp_1_links_de_pago`).
--   Candados MORDIDOS con inserts de prueba (DO block, cero basura): estado
--   'raro' → check_violation · monto_esperado −1 → check_violation.
--   GRANT leído de information_schema.role_table_grants: service_role trae
--   SELECT/INSERT/UPDATE/DELETE; anon y authenticated NO aparecen.
--   Columnas nuevas en requisiciones (6) y abonos_viajero (1) presentes.
-- =============================================================================
