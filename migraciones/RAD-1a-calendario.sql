-- ═══════════════════════════════════════════════════════════════════════════
-- RAD-1a · EL CALENDARIO DEL RADAR, EN LA BASE
--
-- ⚠️ PARA JANE. No se aplica desde la PR: cambiar una función del RPC cambia
-- producción en el instante, sin pasar por un merge.
--
-- QUÉ ARREGLA, medido el 27-ago-2026 (jueves) contra datos reales:
--
--   · «week» era `ahora − 7 días`. La semana de verdad (lun 24 → hoy) traía
--     1,990 clicks; la ventana rodante, 3,090. **55% de más.**
--   · «month» era `ahora − 30 días`, y el RPC devolvía la ventana arrancando
--     en "2026-07-28T17:51:50" — a las cinco y media de la tarde de un 28 de
--     julio, porque contaba 30×24 horas hacia atrás desde el clic.
--   · Y el comentario decía `-- medianoche de hoy en horario de Reynosa
--     (America/Monterrey)`. **Reynosa NO es Monterrey**: −05:00 contra −06:00.
--     El rótulo prometía una cosa y el código hacía otra, todos los días.
--
-- 🔒 REYNOSA ES `America/Matamoros`, y esto NO es un detalle:
--   `America/Cancun` da −05:00 igual que Matamoros HOY, así que hoy son
--   indistinguibles. Divergen **del 1-nov-2026 al 13-mar-2027 — 133 días** —
--   porque Matamoros sigue el horario de verano de EE.UU. y Cancún es fijo.
--   Reynosa es frontera y sigue a EE.UU.: es lo que ya razonaron
--   `giveaway-consuelo`, `giveaway-recordatorio` e `index.html`.
--
-- ⚠️ NO SE TOCA `event_clicks_diario`. Sus 9 días (18→27 ago) están cortados en
--   Monterrey y así se quedan: reescribir historia es peor que anotarla. Es
--   legacy declarado, como los `-06:00` de mayo en el catálogo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.radar_metricas(p_rango text)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_tz         text        := 'America/Matamoros';   -- Reynosa. Ver la cabecera.
  v_now        timestamptz := now();
  v_pared      timestamp;                            -- el reloj de pared de Reynosa
  v_hoy        date;
  v_since      timestamptz;
  v_until      timestamptz := null;
  v_prev_since timestamptz;
  v_prev_until timestamptz;
  v_leyenda    text;
  v_completa   boolean := false;
  v_dias       int := null;
begin
  v_pared := v_now at time zone v_tz;
  v_hoy   := v_pared::date;

  if p_rango = 'today' then
    v_since      := v_hoy::timestamp at time zone v_tz;
    v_prev_since := (v_hoy - 1)::timestamp at time zone v_tz;
    v_prev_until := v_since;
    v_leyenda    := 'Hoy';
    v_dias       := 1;

  elsif p_rango = 'week' then
    -- LUNES a domingo. `date_trunc('week')` en Postgres ya arranca en lunes.
    v_since      := date_trunc('week', v_pared)::timestamp at time zone v_tz;
    v_prev_since := (date_trunc('week', v_pared) - interval '7 days')::timestamp at time zone v_tz;
    v_prev_until := v_since;
    v_leyenda    := 'Esta semana (lun→hoy)';
    v_dias       := extract(isodow from v_pared)::int;
    v_completa   := (v_dias = 7);

  elsif p_rango = 'month' then
    v_since      := date_trunc('month', v_pared)::timestamp at time zone v_tz;
    v_prev_since := (date_trunc('month', v_pared) - interval '1 month')::timestamp at time zone v_tz;
    v_prev_until := v_since;
    v_leyenda    := 'Este mes (1→hoy)';
    v_dias       := extract(day from v_pared)::int;

  elsif p_rango = '3months' then
    -- TRES MESES DE CALENDARIO que terminan en el actual, no 90×24 horas.
    v_since      := (date_trunc('month', v_pared) - interval '2 months')::timestamp at time zone v_tz;
    v_prev_since := (date_trunc('month', v_pared) - interval '5 months')::timestamp at time zone v_tz;
    v_prev_until := v_since;
    v_leyenda    := '3 meses (calendario)';

  elsif p_rango in ('rolling7','rolling30') then
    -- 🔒 Las rodantes SIGUEN EXISTIENDO: son un corte legítimo y útil. Lo que
    -- dejan de hacer es llamarse «esta semana» o «este mes». Y ahora arrancan a
    -- MEDIANOCHE de Reynosa, no a la hora del clic.
    v_dias       := case when p_rango = 'rolling7' then 7 else 30 end;
    v_since      := (v_hoy - (v_dias - 1))::timestamp at time zone v_tz;
    v_prev_since := (v_hoy - (2 * v_dias - 1))::timestamp at time zone v_tz;
    v_prev_until := v_since;
    v_leyenda    := 'Últimos ' || v_dias || ' días';
    v_completa   := true;

  else
    v_since      := '1970-01-01T00:00:00Z'::timestamptz;
    v_prev_since := v_since;
    v_prev_until := v_since;
    v_leyenda    := 'Todo';
    v_completa   := true;
  end if;

  return jsonb_build_object(
    'rango',    p_rango,
    'generado', v_now,
    -- 🔒 La leyenda VIAJA CON LA VENTANA. Así el rótulo de la pantalla no puede
    -- decir algo distinto de lo que el corte hizo: es el mismo objeto.
    'ventana',  jsonb_build_object(
      'since', v_since, 'until', v_until,
      'prev_since', v_prev_since, 'prev_until', v_prev_until,
      'tz', v_tz, 'leyenda', v_leyenda, 'completa', v_completa, 'dias', v_dias
    ),
    'main', jsonb_build_object(
      'act',  radar_main_metrics(v_since, v_until),
      'prev', radar_main_metrics(v_prev_since, v_prev_until)
    ),
    'rol', jsonb_build_object(
      'act',  radar_rol_metrics(v_since, v_until),
      'prev', radar_rol_metrics(v_prev_since, v_prev_until)
    ),
    'pagos', jsonb_build_object(
      'act',  radar_pagos_metrics(v_since, v_until)
    ),
    'waitlist_total', (select count(*) from eventos_waitlist)
  );
end;
$function$;
