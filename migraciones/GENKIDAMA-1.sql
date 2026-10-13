-- =============================================================================
-- GENKIDAMA-1 (13-oct-2026) · El concentrado de correos y las campañas.
-- Palabra de Memo: «un concentrado de todos los correos de todos lados
-- (eliminar repetidos) y ahí yo puedo enviar correos a todo mundo con códigos,
-- promociones, descuentos… wizard tour, fecha, código, slogan, 4 tipos de
-- correos… y un visualizador de energía: hoy puedes enviar 300 de 1800».
--
-- 🔒 RLS deny-all en las cuatro: solo la function (service_role) las toca.
-- 🔒 El correo es la llave del concentrado (PK, minúsculas por CHECK): dos
--    fuentes con el mismo correo son UNA persona — el dedup lo hace la base.
-- 🔒 La bitácora (`genkidama_envios`) se asienta DESPUÉS de cada envío y su
--    UNIQUE (campana, correo) impide mandar dos veces la misma campaña.
-- 🔒 Nada se borra: una BAJA es `baja_at`, no un DELETE.
-- =============================================================================
create table if not exists public.genkidama_contactos (
  correo     text primary key check (correo = lower(correo) and position('@' in correo) > 1),
  nombre     text,
  fuente     text not null,           -- la primera fuente donde apareció
  prioridad  int  not null default 3, -- 1 viajeros/requisiciones · 2 waitlist/portal · 3 giveaway
  baja_at    timestamptz,             -- respondió BAJA: jamás se le vuelve a escribir
  creado_at  timestamptz not null default now()
);
alter table public.genkidama_contactos enable row level security;

create table if not exists public.genkidama_campanas (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('promocion','descuento','codigo','ultimos')),
  evento_id   text not null,
  fecha_idx   int,
  codigo      text,
  slogan      text not null check (length(slogan) between 3 and 140),
  asunto      text not null,
  audiencia   int  not null default 0,
  creado_por  text,
  creado_at   timestamptz not null default now()
);
alter table public.genkidama_campanas enable row level security;

create table if not exists public.genkidama_envios (
  id            uuid primary key default gen_random_uuid(),
  campana_id    uuid not null references public.genkidama_campanas(id),
  correo        text not null check (correo = lower(correo)),
  nombre        text,
  prioridad     int not null default 3,
  enviado_at    timestamptz,
  resend_status int,
  error         text,
  unique (campana_id, correo)
);
create index if not exists genkidama_envios_enviado_idx on public.genkidama_envios (enviado_at);
alter table public.genkidama_envios enable row level security;

-- La energía del día: la fija Memo («conforme tú indiques»). Una sola fila.
create table if not exists public.genkidama_config (
  id            int primary key check (id = 1),
  limite_diario int not null default 300 check (limite_diario between 0 and 5000),
  actualizado_por text,
  updated_at    timestamptz not null default now()
);
alter table public.genkidama_config enable row level security;
insert into public.genkidama_config (id, limite_diario)
  select 1, 300 where not exists (select 1 from public.genkidama_config where id = 1);
