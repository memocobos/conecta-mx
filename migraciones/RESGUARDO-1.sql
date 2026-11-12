-- RESGUARDO-1 (12-nov-2026) — YA CORRIDA. Comprobantes de RESGUARDO por viajero:
-- se guardan para tenerlos, NO suman a ningún saldo (tabla propia, jamás
-- abonos_viajero). Archivo en el bucket privado abonos-viajeros bajo resguardo/.
create table if not exists public.comprobantes_resguardo (
  id uuid primary key default gen_random_uuid(),
  viajero_id uuid not null,
  foto_path text not null,
  fecha_pago date,
  nota text check (nota is null or length(nota) <= 300),
  subido_por text,
  creado_at timestamptz not null default now(),
  archivado_at timestamptz,
  archivado_por text
);
create index if not exists comprobantes_resguardo_viajero_idx on public.comprobantes_resguardo (viajero_id) where archivado_at is null;
alter table public.comprobantes_resguardo enable row level security;
revoke all on public.comprobantes_resguardo from anon, authenticated;
grant select, insert, update, delete on public.comprobantes_resguardo to service_role;
