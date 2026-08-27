-- ═══════════════════════════════════════════════════════════════════════════
-- RAD-1c · LA FRANJA DEL DÍA
--
-- ⚠️ PARA JANE, igual que RAD-1a y RAD-1a-FIX. No se aplica desde la PR.
--
-- 🔒 NO SE CONSTRUYE NINGÚN CONTADOR NUEVO. Las visitas se miden desde el
-- 19-may-2026 en `main_eventos_uso` (33,563 filas de `main_visita`); lo que
-- faltaba era LEERLAS DE HOY. Un contador nuevo habría sido una segunda fuente
-- del mismo número — la trampa que esta casa ya pagó once veces con «cuánto
-- dinero hay».
--
-- 🔒 Y LA COMPARACIÓN VA CONTRA EL MISMO TRAMO HORARIO, no contra días
-- completos. Es la lección de RAD-1a-FIX aplicada antes de repetirla:
--
--     hoy 14:35 de Reynosa → 285 visitas
--     media de 7 días COMPLETOS      → 606   →  −53%   «día desastroso»
--     media de 7 días AL MISMO TRAMO → 263   →   +8%   «día por encima»
--
--   El signo se invierte. Comparar un día a medias contra días enteros no es
--   un matiz: cambia la conclusión. (La maqueta del diagnóstico decía −76%
--   justamente por calcularlo mal.)
--
-- ⚠️ LOS CLICKS NO LLEVAN COMPARACIÓN, a propósito. `event_clicks_diario`
--   guarda un total POR DÍA sin marca de tiempo, así que no hay forma de
--   recortarlo al tramo corrido: solo se podría comparar hoy-a-medias contra
--   días enteros, que es justo lo que acabamos de prohibir. Se enseña el
--   número y ya. Además su `dia` está cortado en MONTERREY (legacy declarado
--   en RAD-1a), una hora corrido respecto al resto de la franja.
--
-- La agregación vive AQUÍ, no en el cliente: son ~15,000 filas para ocho días.
-- Es el patrón de `event-clicks.js`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.radar_dia()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_tz      text := 'America/Matamoros';   -- Reynosa. Ver RAD-1a.
  v_pared   timestamp;
  v_hoy     date;
  v_corrido interval;                      -- lo que lleva corrido el día
begin
  v_pared   := now() at time zone v_tz;
  v_hoy     := v_pared::date;
  v_corrido := v_pared - v_hoy::timestamp;

  return (
    with dias as (
      -- 0 = hoy, 1..7 = los siete previos. Cada uno recortado al MISMO tramo.
      select g, (v_hoy - g)::date d from generate_series(0, 7) g
    ),
    filas as (
      select dias.g, m.accion, m.session_id
      from dias
      join main_eventos_uso m
        on (m.created_at at time zone v_tz) >= dias.d::timestamp
       and (m.created_at at time zone v_tz) <  dias.d::timestamp + v_corrido
    ),
    por_dia as (
      select dias.g, d,
             count(distinct f.session_id) filter (where f.accion = 'main_visita')             visitas,
             count(distinct f.session_id) filter (where f.accion = 'main_evento_visto')       vieron,
             count(distinct f.session_id) filter (where f.accion = 'main_cotizacion_generada') cotizaron
      from dias left join filas f using (g)
      group by dias.g, d
    ),
    hoy as (select * from por_dia where g = 0),
    med as (select round(avg(visitas)) v, round(avg(vieron)) e, round(avg(cotizaron)) c,
                   count(*) n from por_dia where g > 0)
    select jsonb_build_object(
      'hoy',      v_hoy,
      'tz',       v_tz,
      'corrido',  to_char(v_corrido, 'HH24:MI'),
      'visitas',   (select visitas   from hoy),
      'vieron',    (select vieron    from hoy),
      'cotizaron', (select cotizaron from hoy),
      -- 🔒 La media viaja CON su tramo y con cuántos días la componen, para que
      -- la pantalla no pueda presentarla como algo que no es.
      'media7', jsonb_build_object(
        'visitas', (select v from med), 'vieron', (select e from med),
        'cotizaron', (select c from med), 'dias', (select n from med),
        'tramo', 'mismo tramo horario (00:00→' || to_char(v_corrido, 'HH24:MI') || ')'
      ),
      -- Los clicks: número sin comparación. Ver la cabecera.
      'clicks', (
        select jsonb_build_object(
          'n', coalesce(sum(clicks), 0), 'eventos', count(*),
          'tz', 'America/Monterrey', 'nota', 'cubeta diaria: sin tramo, sin comparación'
        )
        from event_clicks_diario
        where dia = (now() at time zone 'America/Monterrey')::date
      ),
      -- La serie de los ocho días, para la barrita.
      -- ⚠️ TODOS los días vienen recortados al MISMO tramo, no solo hoy. Marcar
      -- únicamente el último como «parcial» sugeriría que los otros siete están
      -- completos —y no lo están—, así que el recorte se declara para la serie
      -- ENTERA y de hoy solo se dice que es hoy. Las ocho barras son
      -- comparables entre sí, que es justo de lo que se trata.
      'serie', jsonb_build_object(
        'tramo', '00:00→' || to_char(v_corrido, 'HH24:MI') || ' en todos los días',
        'dias', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'dia', d, 'visitas', visitas, 'hoy', (g = 0)) order by d), '[]'::jsonb)
          from por_dia
        )
      )
    )
  );
end;
$function$;
