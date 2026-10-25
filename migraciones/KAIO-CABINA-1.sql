-- ═══════════════════════════════════════════════════════════════════════════
-- KAIO-CABINA-1 · LA CABINA DE TRANSMISIÓN (24-oct-2026) — YA CORRIDA en KH
-- ═══════════════════════════════════════════════════════════════════════════
-- Palabra de Memo: «mejórame los controles en Kaio-sama, para transmitir desde
-- ahí, poder meter audios como samplers de ruido como risas grabadas y poder
-- cambiar esos audios, buscar y reproducir música de nuestro catálogo».
--
-- Esta acta es el SOUNDBOARD: `radio_samplers` (nombre, color, orden) + bucket
-- PÚBLICO `radio-samplers` (los samplers se tocan en la cabina vía fetch →
-- Web Audio; al bucket solo escribe el servidor con la service key, que valida
-- MAGIA DE BYTES mp3/wav/ogg y tope 3.5 MB — admin-radio-cabina. El tope es
-- 3.5 y no 5 porque el REQUEST de una Netlify Function topa ~6 MB y el base64
-- infla 4/3: un tope de 5 habría sido inalcanzable).
-- La MÚSICA del catálogo NO vive aquí: se busca con admin-radio-media (que ya
-- existía) y se descarga por proxy desde AzuraCast. Los LOCUTORES tampoco:
-- viven en AzuraCast (streamers) y se administran por el mismo endpoint.
-- RLS deny-all + GRANT service_role (regla del 30-oct). Eliminar un sampler es
-- DELETE deliberado (contenido, no dinero — la forma de RADIO-V2a2), con
-- confirmar:true en el servidor y barriendo su objeto del bucket.

create table public.radio_samplers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 1 and 60),
  audio_url text not null check (length(audio_url) <= 500),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  orden int not null default 0,
  archivado boolean not null default false,
  creado_en timestamptz not null default now()
);
alter table public.radio_samplers enable row level security;
grant select, insert, update, delete on public.radio_samplers to service_role;
insert into storage.buckets (id, name, public) values ('radio-samplers', 'radio-samplers', true);
