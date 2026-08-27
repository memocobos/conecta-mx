-- ═══════════════════════════════════════════════════════════════════════════
-- RAD-1e · GIRU 🤖 · EL MOTOR
--
-- ⚠️ PARA JANE, igual que 1a, 1a-FIX, 1c y 1d. No se aplica desde la PR.
--
-- 🔒 GIRU NO OPINA, GIRU LEE. Cada lectura sale de una regla sobre datos
-- reales, trae los NÚMEROS que la produjeron y el nombre de su fuente. Cero
-- llamadas externas, cero llave de API, cero costo por consulta.
--
-- 🔒 LAS CUATRO REGLAS DE LA VOZ, firmadas:
--   1. Toda lectura trae su fuente y es reproducible con una consulta.
--   2. Ninguna lectura sin UMBRAL: «subió 200%» sobre 1→3 sesiones es ruido.
--   3. Ninguna comparación con ventanas de distinto largo. Medido el 27-ago:
--      con 4 días contra 7, «el que más subió» salía −9%; con tramos iguales,
--      el mismo evento sale +32%. **La conclusión se invierte.**
--   4. Si no hay nada que decir, GIRU SE CALLA. Un robot que siempre encuentra
--      algo es un robot que inventa.
--
-- MEDIDO HOY, antes de escribir una línea: de las cinco reglas disparan DOS.
-- R2 sale +6% (día normal, se calla), R1 no tiene récord que anunciar, y solo
-- R3 y R4 tienen algo. Ésa es la selectividad que se busca — y de paso
-- desmiente la maqueta del diagnóstico, cuya primera lectura («hoy vas en 190
-- visitas, la media es 608») ni siquiera habría existido bajo la regla 3.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.radar_giru()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_tz      text := 'America/Matamoros';   -- Reynosa. Ver RAD-1a.
  v_pared   timestamp;
  v_hoy     date;
  v_corrido interval;
  v_lunes   date;
  v_dow     int;
  v_out     jsonb := '[]'::jsonb;
  -- 🔒 LOS UMBRALES, EN UN SOLO SITIO Y CON NOMBRE. Sueltos por el cuerpo son
  -- imposibles de re-litigar; aquí se leen de un vistazo y el arnés los cita.
  k_dia_pct   numeric := 25;   -- el día se comenta si se aleja ≥25% de su media
  k_dia_piso  int     := 50;   -- …y solo si la media llega a 50 (si no, es ruido)
  k_ev_pct    numeric := 25;   -- un evento «subió» a partir de +25%
  k_ev_baja   numeric := 30;   -- …y «cayó» a partir de −30% (más exigente: caer alarma)
  k_ev_base   int     := 20;   -- …siempre que la semana previa tuviera ≥20 sesiones
  k_wl_n      int     := 20;   -- lista de espera: ≥20 registros nuevos en 7 días
begin
  v_pared   := now() at time zone v_tz;
  v_hoy     := v_pared::date;
  v_corrido := v_pared - v_hoy::timestamp;
  v_lunes   := date_trunc('week', v_pared)::date;
  v_dow     := extract(isodow from v_pared)::int;

  -- ── el día, y los días previos AL MISMO TRAMO ────────────────────────────
  with dias as (
    select g, (v_hoy - g)::date d from generate_series(0, 7) g
  ),
  vis as (
    select dias.g, count(distinct m.session_id) s
    from dias left join main_eventos_uso m
      on m.accion = 'main_visita'
     and (m.created_at at time zone v_tz) >= dias.d::timestamp
     and (m.created_at at time zone v_tz) <  dias.d::timestamp + v_corrido
    group by dias.g
  ),
  -- los días YA CERRADOS de este mes, al mismo tramo, para el récord
  mes as (
    select (m.created_at at time zone v_tz)::date d, count(distinct m.session_id) s
    from main_eventos_uso m
    where m.accion = 'main_visita'
      and (m.created_at at time zone v_tz)::date >= date_trunc('month', v_pared)::date
      and (m.created_at at time zone v_tz)::date <  v_hoy
      and (m.created_at at time zone v_tz) < ((m.created_at at time zone v_tz)::date::timestamp + v_corrido)
    group by 1
  ),
  -- eventos: esta semana contra la anterior, RECORTADA AL MISMO NÚMERO DE DÍAS
  ev as (
    select split_part(m.evento_id, ':', 1) eid, m.evento_nombre nom, m.session_id sid,
           (m.created_at at time zone v_tz)::date d
    from main_eventos_uso m
    where m.accion = 'main_evento_visto' and m.evento_id is not null and m.evento_id <> ''
  ),
  act as (select eid, max(nom) nom, count(distinct sid) s from ev
          where d >= v_lunes and d <= v_hoy group by 1),
  prv as (select eid, count(distinct sid) s from ev
          where d >= v_lunes - 7 and d <= v_hoy - 7 group by 1),
  mov as (select a.eid, a.nom, p.s antes, a.s ahora,
                 round((a.s - p.s) * 100.0 / nullif(p.s, 0)) pct
          from act a join prv p using (eid) where p.s >= k_ev_base),
  wl as (select evento_nombre nom, count(*) n from eventos_waitlist
         where created_at >= now() - interval '7 days' and evento_nombre is not null
         group by 1)
  -- ⚠️ `jsonb_strip_nulls` NO QUITA LOS NULL DE UN ARRAY, solo campos de
  -- objeto. Con él, un día sin nada que decir devolvía `[null,null,null,null,
  -- null]` —largo 5— en vez de `[]`: el SILENCIO se habría visto como cinco
  -- tarjetas rotas, que es lo contrario de callarse. Medido: largo 3 con
  -- strip_nulls, largo 1 con este filtro. Se arma el array y se FILTRA.
  select coalesce((select jsonb_agg(x) from unnest(array[
    -- ── R1 · récord del mes ────────────────────────────────────────────────
    -- Solo si HOY, al tramo corrido, supera a TODOS los días cerrados del mes
    -- al MISMO tramo. Comparar hoy-a-medias contra días enteros sería la
    -- trampa que arregló RAD-1a-FIX.
    (select case when (select s from vis where g = 0) > coalesce(max(s), -1) and (select s from vis where g = 0) > 0
       then jsonb_build_object('regla','record_mes','icono','🏆',
              'texto', 'Vas de récord del mes: ' || (select s from vis where g = 0)
                       || ' visitas, y el mejor día llevaba ' || max(s) || ' a esta hora.',
              'fuente','main_eventos_uso · main_visita · sesiones únicas · días cerrados del mes al mismo tramo',
              'datos', jsonb_build_object('hoy',(select s from vis where g=0),'mejor_previo',max(s),
                                          'tramo', to_char(v_corrido,'HH24:MI')))
       end from mes),
    -- ── R2 · el día se sale de su media ────────────────────────────────────
    (select case when avg_s >= k_dia_piso and abs(pct) >= k_dia_pct
       then jsonb_build_object('regla','dia_fuera','icono', case when pct > 0 then '📈' else '📉' end,
              'texto', 'Hoy vas en ' || hoy_s || ' visitas: ' || abs(pct) || '% '
                       || case when pct > 0 then 'por encima' else 'por debajo' end
                       || ' de tu media a esta hora (' || round(avg_s) || ').',
              'fuente','main_eventos_uso · main_visita · hoy vs media de 7 días al MISMO tramo horario',
              'datos', jsonb_build_object('hoy',hoy_s,'media',round(avg_s),'pct',pct,
                                          'tramo', to_char(v_corrido,'HH24:MI'),'dias',7))
       end from (select (select s from vis where g=0) hoy_s, (select avg(s) from vis where g>0) avg_s,
                        round(((select s from vis where g=0) - (select avg(s) from vis where g>0))
                              * 100.0 / nullif((select avg(s) from vis where g>0),0)) pct) t),
    -- ── R3 · el que más subió ──────────────────────────────────────────────
    (select jsonb_build_object('regla','evento_sube','icono','🚀',
              'texto', nom || ' subió ' || pct || '% esta semana: ' || antes || ' → ' || ahora || ' sesiones.',
              'fuente','main_eventos_uso · main_evento_visto · lun→hoy vs lun→mismo día de la semana pasada',
              'datos', jsonb_build_object('evento',eid,'antes',antes,'ahora',ahora,'pct',pct,
                                          'dias_comparados', v_dow, 'base_minima', k_ev_base))
     from mov where pct >= k_ev_pct order by pct desc limit 1),
    -- ── R3b · el que más cayó (espejo, con umbral más exigente) ────────────
    (select jsonb_build_object('regla','evento_baja','icono','🔻',
              'texto', nom || ' cayó ' || abs(pct) || '% esta semana: ' || antes || ' → ' || ahora || ' sesiones.',
              'fuente','main_eventos_uso · main_evento_visto · lun→hoy vs lun→mismo día de la semana pasada',
              'datos', jsonb_build_object('evento',eid,'antes',antes,'ahora',ahora,'pct',pct,
                                          'dias_comparados', v_dow, 'base_minima', k_ev_base))
     from mov where pct <= -k_ev_baja order by pct asc limit 1),
    -- ── R4 · la lista de espera creciendo ──────────────────────────────────
    (select jsonb_build_object('regla','waitlist_crece','icono','✉️',
              'texto', n || ' registros nuevos en lista de espera de ' || nom
                       || ' en 7 días. Considera un cartel.',
              'fuente','eventos_waitlist · created_at ≥ hoy−7 días',
              'datos', jsonb_build_object('evento',nom,'n',n,'dias',7,'minimo',k_wl_n))
     from wl where n >= k_wl_n order by n desc limit 1)
  ]::jsonb[]) x where x is not null), '[]'::jsonb) into v_out;

  return jsonb_build_object(
    'generado', now(), 'tz', v_tz, 'hoy', v_hoy,
    'corrido', to_char(v_corrido, 'HH24:MI'),
    -- 🔒 Los umbrales VIAJAN con la respuesta. Así el arnés los carea contra lo
    -- que dispara, y Memo puede ver por qué Giru se calló.
    'umbrales', jsonb_build_object('dia_pct',k_dia_pct,'dia_piso',k_dia_piso,
                'ev_pct',k_ev_pct,'ev_baja',k_ev_baja,'ev_base',k_ev_base,'wl_n',k_wl_n),
    'semana_en_curso', (v_dow < 7),
    'lecturas', coalesce(v_out, '[]'::jsonb)
  );
end;
$function$;
