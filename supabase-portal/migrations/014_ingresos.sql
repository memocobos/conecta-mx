-- ============================================================================
-- 014_ingresos.sql
-- Tabla de ingresos (entradas sueltas) del portal de Conecta MX — S2.
--
-- Clon de public.gastos (011) pero en positivo: registra entradas de dinero que
-- NO pasan por el plan de pagos de un tour — vuelos, autobuses sueltos, cargos
-- administrativos, boletos extra, etc. Se puede ligar a un cliente Y/O a un
-- evento del array EV de index.html, ambos OPCIONALES (igual que gastos liga
-- eventos por evento_id de texto: base o base#idx).
--
-- cliente_id es uuid OPCIONAL y SIN FK dura (igual criterio que registrado_por):
-- el nombre del cliente lo resuelve el front desde la lista de clientes. evento_id
-- es texto OPCIONAL; el nombre del evento lo resuelve el front desde EV.
--
-- Acceso: SOLO service_role (Netlify Functions admin). El cliente NUNCA accede.
-- Mismo patrón RLS que 008_pagos_rls.sql / 011_gastos.sql.
-- ============================================================================

create table if not exists public.ingresos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid,                          -- opcional (NO FK dura, como registrado_por)
  evento_id      text,                          -- EV base o base#idx; null = sin evento
  concepto       text not null,
  monto          numeric(10,2) not null check (monto >= 0),
  categoria      text,                          -- Vuelo, Autobús, Cargo administrativo, Boleto extra, Otro
  cuenta         text,                          -- 'BBVA' | 'Banamex' | 'Efectivo' | 'Otro' (visor de saldos)
  metodo_pago    text,                          -- Transferencia | Depósito | Efectivo
  fecha          date not null,
  notas          text,
  registrado_por text,                          -- correo/rol del admin (NO es FK)
  created_at     timestamptz not null default now()
);

create index if not exists idx_ingresos_cliente on public.ingresos (cliente_id);
create index if not exists idx_ingresos_evento  on public.ingresos (evento_id);
create index if not exists idx_ingresos_fecha   on public.ingresos (fecha);

-- ============================================================================
-- RLS — solo service_role (igual patrón que pagos/gastos): el cliente NO accede;
-- todo pasa por las funciones admin con service_role.
-- ============================================================================
alter table public.ingresos enable row level security;

drop policy if exists "ingreso_service_role_all" on public.ingresos;
create policy "ingreso_service_role_all"
  on public.ingresos
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
