-- ═══════════════════════════════════════════════════════════════════════════
-- RAD-1d · LOS TRES TOPS, CON SU VENTANA EN LA CARA
--
-- ⚠️ PARA JANE, igual que 1a, 1a-FIX y 1c. No se aplica desde la PR.
--
-- 🔒 «AÑO» NO SE PUEDE DECIR, y por eso el tercer top se llama «desde que
-- medimos». Los DÍAS SE COMPUTAN del `min()` real, no se escriben: el
-- diagnóstico dijo «101 días» leyendo la fecha en UTC y en Reynosa son **102**
-- —la medición arranca el 18-may, no el 19—. Un rótulo escrito a mano ya nació
-- equivocado una vez.
--
-- ⚠️ Y LA LLAVE NO ES NI EL NOMBRE NI EL ID A SECAS. Medido:
--     · por `evento_nombre` → 91 claves
--     · por `evento_id`     → 105 claves
--     · ids con dos nombres → 0
--   La diferencia son 24 ids con sufijo `:waitlist` (`juniorh` y
--   `juniorh:waitlist`), que son EL MISMO evento visto desde otro sitio.
--   Agrupar por NOMBRE los fusiona por accidente —y se rompería el día que dos
--   eventos distintos compartan nombre—; agrupar por ID los parte en dos.
--   La llave correcta es el id NORMALIZADO: `split_part(evento_id, ':', 1)`,
--   contando sesiones ÚNICAS para no sumar dos veces a quien vio las dos caras.
--   Solo hay dos patrones de id: 81 simples y 24 `:waitlist`.
--
-- ⚠️ NO se filtran los eventos pasados. Se midió antes de decidir: 9 de los 10
--   más vistos están VIVOS, así que el filtro no compraba nada y habría
--   escondido historia real. (`fanfest`, 929 sesiones, ya no está en el
--   catálogo — y aun así es cierto que se vio.)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.radar_tops(p_n int default 5)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_tz  text := 'America/Matamoros';   -- Reynosa. Ver RAD-1a.
  v_hoy date;
  v_n   int  := greatest(1, least(coalesce(p_n, 5), 20));
begin
  v_hoy := (now() at time zone v_tz)::date;

  return (
    with v as (
      -- 🔒 La llave normalizada. Ver la cabecera.
      select split_part(m.evento_id, ':', 1) eid,
             m.evento_nombre nom, m.session_id sid,
             (m.created_at at time zone v_tz)::date d
      from main_eventos_uso m
      where m.accion = 'main_evento_visto'
        and m.evento_id is not null and m.evento_id <> ''
    ),
    medido as (select min(d) d0, max(d) d1, (max(d) - min(d)) + 1 dias from v),
    crudo as (
      select 'hoy' k, eid, max(nom) nom, count(distinct sid) s
      from v where d = v_hoy group by 1, 2
      union all
      select 'mes', eid, max(nom), count(distinct sid)
      from v where d >= date_trunc('month', v_hoy::timestamp)::date group by 1, 2
      union all
      select 'medido', eid, max(nom), count(distinct sid) from v group by 1, 2
    ),
    orden as (select *, row_number() over (partition by k order by s desc, eid) n from crudo)
    select jsonb_build_object(
      'tz', v_tz, 'hoy', v_hoy,
      -- 🔒 Cada top viaja CON SU VENTANA: fechas y días, ESTRUCTURADOS.
      --
      -- ⚠️ Las fechas NO se formatean aquí. La primera versión usaba
      -- `to_char(v_hoy,'DD "de" FMMonth')` y devolvía **«27 de August»**: el
      -- locale de este Postgres es inglés. Se habría publicado así.
      -- Los meses en español ya viven en el cliente (`_radFechaCorta`, de
      -- RAD-1b), y tenerlos en dos sitios sería la séptima lista a mano de esta
      -- pantalla. El RPC manda el DATO; la pantalla lo escribe.
      'ventanas', jsonb_build_object(
        'hoy',    jsonb_build_object('tipo', 'hoy',    'desde', v_hoy, 'hasta', v_hoy, 'dias', 1),
        'mes',    jsonb_build_object('tipo', 'mes',
                    'desde', date_trunc('month', v_hoy::timestamp)::date, 'hasta', v_hoy,
                    'dias', extract(day from v_hoy)::int),
        'medido', jsonb_build_object('tipo', 'medido',
                    'desde', (select d0 from medido), 'hasta', v_hoy,
                    'dias', (select dias from medido))
      ),
      'tops', (
        select coalesce(jsonb_object_agg(k, filas), '{}'::jsonb)
        from (select k, jsonb_agg(jsonb_build_object(
                       'id', eid, 'nombre', nom, 'sesiones', s, 'pos', n) order by n) filas
              from orden where n <= v_n group by k) z
      )
    )
  );
end;
$function$;
