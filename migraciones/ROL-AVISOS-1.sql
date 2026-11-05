-- ═══════════════════════════════════════════════════════════════════════════
-- ROL-AVISOS-1 · bitácora de los recordatorios del ROL FIJO (4-nov-2026)
-- Un momento (apertura / vence_hoy / vencido / antes_evento) sale UNA vez en la
-- vida de una cuota: UNIQUE (viajero_id, cuota_n, tipo). La fila se aparta ANTES
-- de mandar y se borra si el correo falla (el reintento sale limpio).
-- RLS deny-all + GRANT a service_role (regla del 30-oct).
-- CORRIDA: 4-nov-2026 vía MCP.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.rol_avisos (
  id uuid primary key default gen_random_uuid(),
  viajero_id uuid not null,
  cuota_n int not null,
  tipo text not null check (tipo in ('apertura','vence_hoy','vencido','antes_evento')),
  correo text not null check (correo = lower(correo)),
  dia date not null,
  monto numeric,
  email_id text,
  enviado_at timestamptz not null default now(),
  constraint rol_avisos_uq unique (viajero_id, cuota_n, tipo)
);
alter table public.rol_avisos enable row level security;
revoke all on public.rol_avisos from anon, authenticated;
grant select, insert, update, delete on public.rol_avisos to service_role;
