-- ═══════════════════════════════════════════════════════════════════════════
-- RADIO-V2A · LA PARRILLA DE RADIO CONECTA (24-oct-2026) — YA CORRIDA en KH
-- ═══════════════════════════════════════════════════════════════════════════
-- Palabra de Memo: «quiero empezar a transmitir programas en vivo, tener
-- cartelera, entrevistas» — serie RADIO-V2 (parrilla → rediseño /radio →
-- locutores). Esta acta es la tabla de la cartelera.
--
-- La forma: un programa es SEMANAL (dia_semana 0=domingo…6=sábado) o ESPECIAL
-- de una fecha puntual — EXACTAMENTE uno de los dos (CHECK). Las horas van en
-- HORA DE REYNOSA (America/Matamoros); quién resuelve «qué está al aire AHORA»
-- es _lib/radio-cartelera, que deriva el huso (jamás un -05:00 tecleado — la
-- ley de la Nube). Un programa que cruce medianoche se captura como DOS filas
-- (el CHECK hora_fin > hora_inicio lo exige y queda dicho aquí).
--
-- 🔒 RLS deny-all (ningún lector de navegador: el público lee por la function
-- radio-cartelera y el admin por admin-radio-cartelera) + GRANT a service_role
-- (regla de la casa desde el 30-oct-2026: tabla nueva sin GRANT = endpoint con
-- «permission denied»).
-- 🔒 Sin DELETE en el flujo: los programas se ARCHIVAN (archivado=true).

create table public.radio_programas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 2 and 80),
  descripcion text check (descripcion is null or length(descripcion) <= 300),
  conductor text check (conductor is null or length(conductor) <= 80),
  dia_semana int check (dia_semana between 0 and 6),
  fecha date,
  hora_inicio time not null,
  hora_fin time not null,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  activo boolean not null default true,
  archivado boolean not null default false,
  creado_en timestamptz not null default now(),
  constraint radio_prog_semanal_o_especial check ((dia_semana is null) <> (fecha is null)),
  constraint radio_prog_horas check (hora_fin > hora_inicio)
);
alter table public.radio_programas enable row level security;
grant select, insert, update, delete on public.radio_programas to service_role;
