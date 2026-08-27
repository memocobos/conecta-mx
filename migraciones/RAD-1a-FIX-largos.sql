-- ═══════════════════════════════════════════════════════════════════════════
-- RAD-1a-FIX · LAS DOS VENTANAS, DEL MISMO LARGO
--
-- ⚠️ PARA JANE, igual que RAD-1a. No se aplica desde la PR.
--
-- QUÉ ROMPIÓ RAD-1a, sin querer: al cambiar los cortes rodantes por cortes de
-- calendario, el tramo ACTUAL pasó a ser parcial (del lunes a AHORA) mientras
-- el PREVIO siguió siendo un periodo COMPLETO. El corte viejo era injusto de
-- otra manera, pero comparaba `ahora−7d` contra `ahora−14d..ahora−7d`: dos
-- ventanas de exactamente 7 días.
--
-- MEDIDO EN PRODUCCIÓN el 27-ago (jueves), sobre `main_visita`:
--
--     actual   3.57 días → 2,454 sesiones
--     previo   7.00 días → 4,450 sesiones     → la tarjeta pintaba  −45%
--     previo del MISMO largo → 2,674          → lo honesto es        −8%
--
-- Treinta y siete puntos de distorsión, en cada KPI del Resumen.
--
-- 🔒 LA REGLA, FIRMADA: `prev_until = prev_since + (ahora − since)`.
-- Una sola línea de concepto, aplicada en UNA puerta y no repetida por rango —
-- cinco copias de una regla es cómo esta pantalla llegó a tener cinco
-- calendarios.
--
-- ⚠️ La lección: cambiar un corte tiene DOS lados. Mueve el `since` y mueve
-- también con QUÉ se compara. En RAD-1a solo se miró uno.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.radar_metricas(p_rango text)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_tz         text        := 'America/Matamoros';   -- Reynosa. Ver RAD-1a.
  v_now        timestamptz := now();
  v_pared      timestamp;
  v_hoy        date;
  v_since      timestamptz;
  v_until      timestamptz := null;
  v_prev_since timestamptz;
  v_prev_until timestamptz;
  v_largo      interval;
  v_leyenda    text;
  v_completa   boolean := false;
  v_dias       int := null;
begin
  v_pared := v_now at time zone v_tz;
  v_hoy   := v_pared::date;

  if p_rango = 'today' then
    v_since      := v_hoy::timestamp at time zone v_tz;
    v_prev_since := (v_hoy - 1)::timestamp at time zone v_tz;
    v_leyenda    := 'Hoy';
    v_dias       := 1;

  elsif p_rango = 'week' then
    v_since      := date_trunc('week', v_pared)::timestamp at time zone v_tz;
    v_prev_since := (date_trunc('week', v_pared) - interval '7 days')::timestamp at time zone v_tz;
    v_leyenda    := 'Esta semana (lun→hoy)';
    v_dias       := extract(isodow from v_pared)::int;
    v_completa   := (v_dias = 7);

  elsif p_rango = 'month' then
    v_since      := date_trunc('month', v_pared)::timestamp at time zone v_tz;
    v_prev_since := (date_trunc('month', v_pared) - interval '1 month')::timestamp at time zone v_tz;
    v_leyenda    := 'Este mes (1→hoy)';
    v_dias       := extract(day from v_pared)::int;

  elsif p_rango = '3months' then
    v_since      := (date_trunc('month', v_pared) - interval '2 months')::timestamp at time zone v_tz;
    v_prev_since := (date_trunc('month', v_pared) - interval '5 months')::timestamp at time zone v_tz;
    v_leyenda    := '3 meses (calendario)';

  elsif p_rango in ('rolling7','rolling30') then
    v_dias       := case when p_rango = 'rolling7' then 7 else 30 end;
    v_since      := (v_hoy - (v_dias - 1))::timestamp at time zone v_tz;
    v_prev_since := (v_hoy - (2 * v_dias - 1))::timestamp at time zone v_tz;
    v_leyenda    := 'Últimos ' || v_dias || ' días';
    v_completa   := true;

  else
    v_since      := '1970-01-01T00:00:00Z'::timestamptz;
    v_prev_since := v_since;
    v_prev_until := v_since;
    v_leyenda    := 'Todo';
    v_completa   := true;
  end if;

  -- 🔒 LA PUERTA ÚNICA. El tramo previo se recorta al MISMO largo que lleva
  -- corrido el actual. Vale para todos los rangos: no hay una copia por rama.
  if p_rango is distinct from 'all' and v_since > '1970-01-02'::timestamptz then
    v_largo      := coalesce(v_until, v_now) - v_since;
    v_prev_until := v_prev_since + v_largo;
  end if;

  return jsonb_build_object(
    'rango',    p_rango,
    'generado', v_now,
    'ventana',  jsonb_build_object(
      'since', v_since, 'until', v_until,
      'prev_since', v_prev_since, 'prev_until', v_prev_until,
      -- El largo VIAJA con la ventana: así la pantalla y el arnés pueden
      -- carear que los dos tramos miden lo mismo sin recalcularlo.
      'largo_seg', extract(epoch from coalesce(v_largo, interval '0'))::bigint,
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
