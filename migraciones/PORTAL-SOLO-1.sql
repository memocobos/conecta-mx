-- =============================================================================
-- PORTAL-SOLO-1 (27-oct-2026) · El Portal enseña SOLO lo que alguien revisó
-- =============================================================================
-- Palabra de Memo, citada: «antes que se registrara bulma milk o yo podamos
-- revisar su caso para darle la información correcta de su tour, que tal que
-- tiene menos pagos o pagos de más… eso haría al cliente desconfiar … lo que se
-- guarde en la revisión manual tú la puedes utilizar para saber qué onda con esa
-- persona con sus números».
--
-- Dos piezas, en KameHouse (npgnhsmwpcipxgvfxrho):
--   1. viajeros_evento.portal_revisado_at/_por — el SELLO. Sin sello, la fila
--      NO viaja al Portal (ni su dinero, ni editarla, ni su contrato).
--   2. portal_revisiones — la BANDEJA y la BITÁCORA a la vez:
--        tipo 'revisar'  → el cliente se registró y tiene filas sin sello
--        tipo 'ligar'    → el cliente no ve nada y pide que liguemos su viaje
--        tipo 'adelanto' → Bulma/Milk/Memo revisaron por adelantado (nace publicada)
--      con los números ANTES y DESPUÉS y la nota de qué se corrigió.
--
-- Backfill: las filas nacidas de una REQUISICIÓN APROBADA ya se revisaron al
-- aprobar (alguien vio el comprobante y tecleó el monto) → nacen selladas.
-- Medido antes de correr: 48 filas con nota 'Requisición %', 0 repartos ACOMP-2.
-- =============================================================================

alter table public.viajeros_evento
  add column if not exists portal_revisado_at timestamptz,
  add column if not exists portal_revisado_por text;

create table if not exists public.portal_revisiones (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null,
  estado          text not null default 'pendiente',
  correo          text not null,
  evento_id       text,
  nombre_dado     text,
  celular         text,
  nota_cliente    text,
  viajero_ids     uuid[] not null default '{}',
  antes           jsonb,
  despues         jsonb,
  nota_staff      text,
  motivo          text,
  creado_en       timestamptz not null default now(),
  atendida_at     timestamptz,
  atendida_por    text,
  correo_enviado_at timestamptz,
  constraint portal_revisiones_tipo_check   check (tipo in ('revisar','ligar','adelanto')),
  constraint portal_revisiones_estado_check check (estado in ('pendiente','publicada','rechazada')),
  constraint portal_revisiones_correo_min   check (correo = lower(correo) and length(correo) >= 5),
  -- 🔒 un «ligar» sin evento o sin nombre no se puede buscar: la base lo rechaza
  constraint portal_revisiones_ligar_datos  check (tipo <> 'ligar' or (evento_id is not null and nombre_dado is not null and length(trim(nombre_dado)) >= 2)),
  -- 🔒 rechazada exige su motivo (le llega TAL CUAL al cliente)
  constraint portal_revisiones_motivo       check (estado <> 'rechazada' or (motivo is not null and length(trim(motivo)) >= 3))
);

-- Una revisión pendiente por correo; un «ligar» pendiente por correo+evento.
create unique index if not exists portal_revisiones_revisar_pend_uq
  on public.portal_revisiones (correo) where tipo = 'revisar' and estado = 'pendiente';
create unique index if not exists portal_revisiones_ligar_pend_uq
  on public.portal_revisiones (correo, evento_id) where tipo = 'ligar' and estado = 'pendiente';
create index if not exists portal_revisiones_estado_idx on public.portal_revisiones (estado, creado_en);

alter table public.portal_revisiones enable row level security;
revoke all on public.portal_revisiones from anon, authenticated;
grant select, insert, update, delete on public.portal_revisiones to service_role;

-- Backfill: lo nacido de una requisición aprobada ya fue revisado al aprobar.
update public.viajeros_evento
   set portal_revisado_at = now(),
       portal_revisado_por = 'auto: requisición aprobada (PORTAL-SOLO-1)'
 where notas like 'Requisición %'
   and portal_revisado_at is null;
-- Esperado: 48 filas.

-- Candados que deben MORDER (probados al correr):
--   insert tipo 'ligar' sin evento_id                → 23514
--   insert estado 'rechazada' sin motivo             → 23514
--   insert correo con mayúsculas                     → 23514
--   segundo 'revisar' pendiente del mismo correo     → 23505
