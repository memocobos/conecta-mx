-- ═══════════════════════════════════════════════════════════════════════════
-- RADIO-V2A2 · FIN LIBRE + FOTO DEL PROGRAMA (24-oct-2026) — YA CORRIDA en KH
-- ═══════════════════════════════════════════════════════════════════════════
-- Palabra de Memo tras probar la cartelera: «los programas son sin límite de
-- tiempo… inicia a las 8 pero se extiende todo lo que ellos quieran, solo
-- habrá un programa por día» + «opción para meter foto del programa» +
-- «opción para eliminar programación».
--
-- Lo que cambia:
--   · hora_fin se vuelve OPCIONAL (NULL = cierre libre). El CHECK de horas se
--     re-crea permitiendo NULL; con fin escrito sigue exigiendo fin > inicio.
--     Para la parrilla, un programa sin fin cubre «al aire» desde su inicio
--     hasta el FIN DE ESE DÍA (23:59 de Reynosa) — lo decide
--     _lib/radio-cartelera; el banner 🔴 real lo sigue decidiendo live.is_live.
--   · foto_url (≤500) — la foto del programa, servida desde el bucket PÚBLICO
--     nuevo `radio-programas` (la página /radio es pública; al bucket solo
--     escribe el servidor con la service key vía admin-radio-cartelera, que
--     valida magia de bytes jpg/png/webp).
--   · ELIMINAR existe desde esta tuerca (decisión de Memo): la cartelera es
--     CONTENIDO, no dinero — un DELETE aquí no borra un acta financiera.
--     Candados: solo maestro_roshi + confirmar:true EN EL SERVIDOR. Archivar
--     sigue existiendo para pausar sin perder.
--
-- Candado de entrada medido antes de correr: 1 programa · sin foto_url ·
-- hora_fin NOT NULL · bucket inexistente. Candado de salida: fin nullable ·
-- foto_col 1 · bucket público true · CHECK re-creado con NULL permitido.

alter table public.radio_programas alter column hora_fin drop not null;
alter table public.radio_programas drop constraint radio_prog_horas;
alter table public.radio_programas add constraint radio_prog_horas
  check (hora_fin is null or hora_fin > hora_inicio);
alter table public.radio_programas add column foto_url text
  check (foto_url is null or length(foto_url) <= 500);
insert into storage.buckets (id, name, public) values ('radio-programas', 'radio-programas', true);
