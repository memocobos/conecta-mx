-- =============================================================================
-- VJ-HAB-1 (30-oct-2026) · EL TIPO DE HABITACIÓN, ESTRUCTURADO
-- Palabra de Memo (reporte de Milk/Bulma): «quieren ver el tipo de habitación
-- que escogieron y editar en caso de cambio para poder hacer el rooming list
-- en automático en base al acomodo acá en capsule corps».
--
-- ⚠️ ESTA ACTA ES REGISTRO: YA CORRIÓ el 30-oct-2026 (migración
-- vj_hab_1_hotel_tipo). Es idempotente (IF NOT EXISTS + backfill con
-- hotel_tipo IS NULL): re-correrla no mueve nada.
--
-- Lo medido antes de escribir: el tipo elegido al reservar vivía SOLO como
-- texto en la nota del viajero («· hotel: Compartida (4 personas) ·»);
-- `requisiciones.hotel` sí lo guarda pero el aprobar solo lo anexaba a la
-- nota. `habitacion_id` (el cuarto concreto del rooming) tiene 0 usos.
-- Vista previa del backfill: 59 filas con «hotel: » en nota, TODAS parsean
-- (46 Compartida · 10 Doble · 3 Triple, cero ambiguas).
-- =============================================================================

alter table public.viajeros_evento add column if not exists hotel_tipo text;
-- CHECK con los 4 tipos del rooming KH (TIPOS de admin-rooming-grupos).
-- NULL = no eligió / no aplica (CHEAP y las filas que no duermen).
alter table public.viajeros_evento drop constraint if exists viajeros_evento_hotel_tipo_chk;
alter table public.viajeros_evento add constraint viajeros_evento_hotel_tipo_chk
  check (hotel_tipo is null or hotel_tipo in ('Compartida','Doble','Triple','Individual'));

-- Backfill desde la nota (el crudo completo SIGUE en la nota — nada se pierde):
update public.viajeros_evento ve
set hotel_tipo = n.canon
from (
  select id,
    case
      when trim(substring(notas from 'hotel: ([^·]+?) · ')) ilike 'compartida%' then 'Compartida'
      when trim(substring(notas from 'hotel: ([^·]+?) · ')) ilike 'doble%' then 'Doble'
      when trim(substring(notas from 'hotel: ([^·]+?) · ')) ilike 'triple%' then 'Triple'
      when trim(substring(notas from 'hotel: ([^·]+?) · ')) ilike 'individual%' then 'Individual'
      else null end as canon
  from public.viajeros_evento where notas ilike '%hotel: %'
) n
where ve.id = n.id and n.canon is not null and ve.hotel_tipo is null;

-- Careo de salida (corrido en query FRESCA el 30-oct): Compartida 46 ·
-- Doble 10 · Triple 3. Candado MORDIDO: un tipo inventado rebota con 23514
-- (verificado con UPDATE de prueba; 0 filas corruptas tras la mordida).
select hotel_tipo, count(*) from public.viajeros_evento
where hotel_tipo is not null group by 1 order by 2 desc;
