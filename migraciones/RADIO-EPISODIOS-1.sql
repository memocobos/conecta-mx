-- RADIO-EPISODIOS-1 (3-nov-2026) — los episodios grabados de Radio Conecta.
-- Palabra de Memo: «dame la opción de guardar los episodios de los programas
-- de radio, el audio sobre todo… quiero hacer pruebas y grabar para escuchar».
--
-- La GRABADORA vive en la cabina de Kaio-sama (graba LA MEZCLA: mic + samplers
-- + música, post-efectos — lo mismo que sale al aire) y funciona con o sin
-- estar al aire. Un episodio se guarda en el bucket PRIVADO radio-episodios
-- (el navegador sube DIRECTO con una URL firmada de subida: un episodio de una
-- hora pesa ~55 MB y una function no carga más de ~6 MB) y esta tabla es su
-- índice. Escuchar/descargar va con URL firmada de 1 h que firma
-- admin-radio-cabina (solo maestro_roshi).
-- Contenido, no dinero: eliminar existe (con confirmar:true en el servidor).

create table if not exists public.radio_episodios (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (char_length(btrim(titulo)) between 1 and 160),
  programa_id   uuid null references public.radio_programas(id) on delete set null,
  grabado_el    timestamptz not null default now(),
  duracion_seg  integer null check (duracion_seg is null or duracion_seg >= 0),
  bytes         bigint  null check (bytes is null or bytes >= 0),
  audio_path    text not null unique check (audio_path like 'episodios/%'),
  creado_por    text null,
  creado_en     timestamptz not null default now()
);

alter table public.radio_episodios enable row level security;   -- deny-all: solo service_role
revoke all on public.radio_episodios from anon, authenticated;
grant select, insert, update, delete on public.radio_episodios to service_role;

-- Bucket PRIVADO (las pruebas no se publican). Sin tope propio: manda el tope
-- global del proyecto (Storage → Settings); si una grabación lo pasa, la
-- grabadora lo DICE y la deja descargable.
insert into storage.buckets (id, name, public)
values ('radio-episodios', 'radio-episodios', false)
on conflict (id) do nothing;
