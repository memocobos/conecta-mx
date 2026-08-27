-- ═══════════════════════════════════════════════════════════════════════════
-- RAD-1i · LA VENTANA SE EXTRAE. EL CRON PREGUNTA.
--
-- ⚠️ PARA JANE. No se aplica desde la PR.
--
-- 🔒 LA CONDICIÓN DE FONDO, firmada por Memo: el cron de alertas NO lleva una
-- tercera copia de la fórmula. **Copiarla queda vetado** — es exactamente cómo
-- esta pantalla llegó a tener SIETE aritméticas de calendario.
--
-- Así que la ventana se EXTRAE de `radar_metricas` a su propia función, y
-- `radar_metricas` pasa a LLAMARLA. El SQL baja de dos copias a UNA, y el cron
-- se cuelga de esa misma. Extraer, no replicar: es lo que se hizo con el juez
-- del semáforo en HER-1h-B, por la misma razón.
--
-- 🔴 QUÉ ARREGLA, medido: el cron comparaba
--       semActual = lunes → AHORA        (parcial)
--       semPrev   = lunesPrev → lunes    (7 días COMPLETOS)
--   …y cortaba la semana con `hoy.getDay()` en el huso del SERVIDOR (UTC).
--   A las 02:00 UTC del lunes ya es lunes en UTC pero TODAVÍA ES DOMINGO 21:00
--   en Reynosa: `semActual` eran DOS HORAS contra 168. De ahí los −98%.
--   Cinco de cinco alertas `cotizacion_caida` fueron ese artefacto, todas
--   severidad ALTA, todos los domingos a la misma hora, cinco semanas seguidas.
--   Y el dedup por semana garantizaba que disparara en la corrida de las 02:00,
--   es decir EN EL INSTANTE DE MÁXIMA DISTORSIÓN.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── LA FUENTE ÚNICA DE LA VENTANA ────────────────────────────────────────────
-- Devuelve el mismo objeto que `radar_metricas` ponía en su llave `ventana`.
-- Cualquiera que necesite un corte del Radar —la pantalla, el cron, lo que
-- venga— pide AQUÍ.
create or replace function public.radar_ventana(p_rango text)
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

  -- 🔒 LA PUERTA ÚNICA del mismo largo (RAD-1a-FIX). Aquí, y en ningún otro
  -- sitio: quien pida la ventana la recibe ya pareja.
  if p_rango is distinct from 'all' and v_since > '1970-01-02'::timestamptz then
    v_largo      := coalesce(v_until, v_now) - v_since;
    v_prev_until := v_prev_since + v_largo;
  end if;

  return jsonb_build_object(
    'rango', p_rango, 'generado', v_now,
    'since', v_since, 'until', v_until,
    'prev_since', v_prev_since, 'prev_until', v_prev_until,
    'largo_seg', extract(epoch from coalesce(v_largo, interval '0'))::bigint,
    'tz', v_tz, 'leyenda', v_leyenda, 'completa', v_completa, 'dias', v_dias
  );
end;
$function$;

-- ── `radar_metricas` DEJA DE CALCULAR Y PASA A PREGUNTAR ────────────────────
-- Mismo contrato de salida que antes (`ventana` incluida): la pantalla no se
-- entera. Lo que cambia es que ya no hay dos sitios donde esté la fórmula.
create or replace function public.radar_metricas(p_rango text)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v jsonb := radar_ventana(p_rango);   -- 🔒 la ÚNICA fuente
  v_since      timestamptz := (v->>'since')::timestamptz;
  v_until      timestamptz := nullif(v->>'until','')::timestamptz;
  v_prev_since timestamptz := (v->>'prev_since')::timestamptz;
  v_prev_until timestamptz := nullif(v->>'prev_until','')::timestamptz;
begin
  return jsonb_build_object(
    'rango',    p_rango,
    'generado', (v->>'generado')::timestamptz,
    'ventana',  v,
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
