-- =============================================================================
-- RADAR-TZ · La cubeta diaria de clicks se muda a Reynosa (America/Matamoros)
-- Para que lo corra JANE. 7-sep-2026.
--
-- POR QUÉ: TZ-TRIAGE-1 movió los 51 relojes de la app, pero dejó fuera esta
-- cola porque vive EN LA BASE: cambiar el archivo del repo no cambia nada.
--
-- 🔴 LA CONTRADICCIÓN, medida leyendo las funciones VIVAS (no los archivos):
-- `radar_dia()` ya declara `v_tz := 'America/Matamoros'` para TODO su cálculo…
-- salvo su bloque de clicks, que lee la cubeta con `America/Monterrey`. La
-- función se contradice a sí misma, y su propio comentario lo confesaba:
-- «medianoche de hoy en horario de Reynosa (America/Monterrey)».
--
-- SON DOS FUNCIONES Y VAN JUNTAS, EN UNA SOLA TRANSACCIÓN:
--   · increment_event_click_v2 — ESCRIBE la cubeta `dia`
--   · radar_dia                — LEE la cubeta de hoy
-- Si se aplicara una sin la otra, entre las 00:00 y la 01:00 de Reynosa el
-- Radar leería una cubeta distinta de la que se está escribiendo y los clicks
-- de esa hora saldrían en CERO. Juntas, ese hueco no existe.
--
-- ⚠️ NO SE TOCAN LAS CUBETAS VIEJAS. Ver la sentencia en la PR: las 812 filas
-- del 18-ago al 7-sep se quedan con su frontera de Monterrey, como historia.
--
-- Verificación después de correrlo, al final del archivo.
-- =============================================================================

begin;

-- ── 1. LA QUE ESCRIBE ────────────────────────────────────────────────────────
-- Copia EXACTA de la definición viva (leída de pg_get_functiondef, no
-- reconstruida de memoria): cambia ÚNICAMENTE el huso de la cubeta.
create or replace function public.increment_event_click_v2(p_event_id text, p_event_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- El acumulado de siempre: la MISMA receta existente, para no tener dos ideas de lo mismo.
  perform increment_event_click(p_event_id, p_event_name);
  -- La cubeta del dia. [RADAR-TZ] Reynosa (America/Matamoros), no Monterrey:
  -- Monterrey dejó el horario de verano en 2022 y va una hora detrás, así que
  -- entre las 00:00 y la 01:00 de Reynosa escribía la cubeta de AYER.
  insert into event_clicks_diario (event_id, dia, clicks, event_name)
  values (p_event_id, (now() at time zone 'America/Matamoros')::date, 1, p_event_name)
  on conflict (event_id, dia) do update
    set clicks = event_clicks_diario.clicks + 1,
        event_name = coalesce(excluded.event_name, event_clicks_diario.event_name);
end; $function$;

-- ── 2. LA QUE LEE ────────────────────────────────────────────────────────────
-- `radar_dia()` ya usaba Matamoros en `v_tz`. Lo único que se mueve es su
-- bloque de clicks, que leía con otro huso que el resto de la función.
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
      -- [RADAR-TZ] Ahora usa `v_tz` —el MISMO de toda la función— en vez de un
      -- 'America/Monterrey' escrito a mano. Antes esta función se contradecía a
      -- sí misma: su día era Reynosa y su cubeta de clicks, Monterrey.
      'clicks', (
        select jsonb_build_object(
          'n', coalesce(sum(clicks), 0), 'eventos', count(*),
          'tz', v_tz, 'nota', 'cubeta diaria: sin tramo, sin comparación'
        )
        from event_clicks_diario
        where dia = v_hoy
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

commit;

-- ── VERIFICACIÓN (correr después; debe dar 0 y 'America/Matamoros') ─────────
-- select count(*) as funciones_con_monterrey
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname='public' and p.prokind='f'
--    and pg_get_functiondef(p.oid) like '%America/Monterrey%';
--
-- select radar_dia()->'clicks'->>'tz' as tz_de_los_clicks;
