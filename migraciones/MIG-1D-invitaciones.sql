-- MIG-1d · 7-sep-2026 · corrido por Jane en KH (npgnhsmwpcipxgvfxrho)
-- El enlace de viajeros al Portal + la bitácora de invitaciones.
-- Diseño de CC aprobado por Jane; el Portal NO se toca desde aquí.

alter table viajeros_evento add column if not exists portal_cliente_id uuid;   -- NO se reusa usuario_id: esa es del staff
alter table viajeros_evento add column if not exists invitado_en  timestamptz;
alter table viajeros_evento add column if not exists invitado_por text;

create table if not exists invitaciones_portal (
  id           uuid primary key default gen_random_uuid(),
  evento_id    text        not null,
  correo       text        not null,
  nombre       text        not null,
  viajero_ids  uuid[]      not null,      -- TODAS las filas de esa persona
  email_id     text,                      -- id que devuelve Resend
  enviada_en   timestamptz not null default now(),
  enviada_por  text        not null       -- el admin del JWT
);
create index if not exists invitaciones_portal_evento_idx on invitaciones_portal (evento_id);
-- Añadido de Jane sobre el diseño: RLS deny-all (solo la service key escribe/lee),
-- como precios_historial y toda tabla que no tiene lector de navegador.
alter table invitaciones_portal enable row level security;

-- Verificado tras correr: columnas=3, tabla=1, rls=true.
