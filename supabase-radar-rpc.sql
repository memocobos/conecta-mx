-- ════════════════════════════════════════════════════════════════════
-- supabase-radar-rpc.sql  —  Radar del Dragón: conteo agregado server-side
-- ════════════════════════════════════════════════════════════════════
-- OBJETIVO: que el Radar haga UNA llamada RPC por rango en vez de
-- descargar ~52,758 filas y contar en el navegador (que hace timeout en
-- rangos largos por Prefer:count=exact por página → devuelve parciales).
--
-- Cómo correrlo: pégalo COMPLETO en Supabase → SQL Editor → Run.
-- NO toca datos. Solo crea funciones (CREATE OR REPLACE) y GRANTs.
-- Re-ejecutable cuantas veces quieras.
--
-- Después de crearlo, el Radar llamará:
--   POST /rest/v1/rpc/radar_metricas   body: { "p_rango": "all" }
-- y recibe TODO (main + rol + pagos + waitlist) en un solo JSON.
--
-- RANGOS soportados (idénticos a _radarSinceISO/_radarPrevSinceISO):
--   'today'   = desde medianoche de hoy (TZ America/Monterrey)
--   'week'    = now() - 7 días
--   'month'   = now() - 30 días   (default del Radar)
--   '3months' = now() - 90 días
--   'all'     = desde 1970 (epoch)
-- El periodo ANTERIOR (para flechas de tendencia) es del mismo tamaño,
-- inmediatamente antes del actual (en 'all' queda vacío → prev = 0, igual
-- que hoy en el frontend).
--
-- SUPUESTOS de columnas (las que el Radar lee hoy de las filas):
--   main_eventos_uso : session_id, accion, evento_id, evento_nombre,
--                      paquete, zona, precio_total, codigo_valido,
--                      origen_trafico, device, filtro_usado, created_at
--   rol_eventos_uso  : session_id, accion, evento_id, evento_nombre,
--                      paquete, created_at
--   pagos_eventos_uso: session_id, accion, cuenta_copiada, referrer, created_at
--   eventos_waitlist : (cualquier col) — solo se cuenta COUNT(*)
-- Si alguna columna no existe, el CREATE fallará y Supabase dirá cuál.
-- ════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────
-- HELPER 1: métricas de main_eventos_uso para una ventana [since, until)
-- until NULL = sin tope superior (hasta ahora).
-- Devuelve TODO lo que muestran los paneles "Resumen general",
-- "Sitio principal" y "Comparativas".
-- ────────────────────────────────────────────────────────────────────
create or replace function radar_main_metrics(p_since timestamptz, p_until timestamptz)
returns jsonb
language sql
stable
as $$
  with src as (
    select *
    from main_eventos_uso
    where created_at >= p_since
      and (p_until is null or created_at < p_until)
  ),
  last_pkg as (
    -- última elección de paquete por sesión (igual que el frontend)
    select distinct on (session_id) session_id, upper(paquete) as pkg
    from src
    where accion = 'main_paquete_elegido' and paquete is not null
    order by session_id, created_at desc
  )
  select jsonb_build_object(
    -- ── KPIs por sesión única (resumen + sitio) ──
    'visitas',        count(distinct session_id) filter (where accion='main_visita'),
    'eventos_vistos', count(distinct session_id) filter (where accion='main_evento_visto'),
    'cotizaciones',   count(distinct session_id) filter (where accion='main_cotizacion_generada'),
    'modal',          count(distinct session_id) filter (where accion='main_modal_pago_abierto'),
    'comprobante',    count(distinct session_id) filter (where accion='main_comprobante_enviado'),
    'codigos',        count(distinct session_id) filter (where accion='main_codigo_intentado'),
    'codigos_ok',     count(distinct session_id) filter (where accion='main_codigo_intentado' and codigo_valido is true),
    'musica',         count(distinct session_id) filter (where accion='main_musica_reproducida'),
    -- ── Conteos por FILA (Comparativas usa COUNT, no DISTINCT) ──
    'cotizaciones_n', count(*) filter (where accion='main_cotizacion_generada'),
    'modal_n',        count(*) filter (where accion='main_modal_pago_abierto'),
    'comprobante_n',  count(*) filter (where accion='main_comprobante_enviado'),
    'codigos_ok_n',   count(*) filter (where accion='main_codigo_intentado' and codigo_valido is true),
    'codigos_no_n',   count(*) filter (where accion='main_codigo_intentado' and codigo_valido is distinct from true),
    'total_rows',     count(*),
    -- ── Embudo (sitio): sesiones únicas por paso ──
    'embudo', jsonb_build_object(
      'visitas',      count(distinct session_id) filter (where accion='main_visita'),
      'evento_visto', count(distinct session_id) filter (where accion='main_evento_visto'),
      'paquete',      count(distinct session_id) filter (where accion='main_paquete_elegido'),
      'zona',         count(distinct session_id) filter (where accion='main_zona_elegida'),
      'cotizacion',   count(distinct session_id) filter (where accion='main_cotizacion_generada'),
      'modal',        count(distinct session_id) filter (where accion='main_modal_pago_abierto'),
      'comprobante',  count(distinct session_id) filter (where accion='main_comprobante_enviado')
    ),
    -- ── Top eventos COTIZADOS (resumen, top 6, sesiones únicas) ──
    'top_cotizados', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'evento_id', evento_id, 'nombre', nombre, 'sesiones', sesiones
             ) order by sesiones desc), '[]'::jsonb)
      from (
        select evento_id,
               coalesce(max(evento_nombre), evento_id::text) as nombre,
               count(distinct session_id) as sesiones
        from src
        where accion='main_cotizacion_generada' and evento_id is not null
        group by evento_id
        order by sesiones desc
        limit 6
      ) t
    ),
    -- ── Top eventos VISTOS (sitio, top 10, sesiones únicas) ──
    'top_vistos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'evento_id', evento_id, 'nombre', nombre, 'sesiones', sesiones
             ) order by sesiones desc), '[]'::jsonb)
      from (
        select evento_id,
               coalesce(max(evento_nombre), evento_id::text) as nombre,
               count(distinct session_id) as sesiones
        from src
        where accion='main_evento_visto' and evento_id is not null
        group by evento_id
        order by sesiones desc
        limit 10
      ) t
    ),
    -- ── Paquetes (última elección por sesión) ──
    'paquetes', (
      select jsonb_build_object(
        'PLUS',  count(*) filter (where pkg='PLUS'),
        'RIDE',  count(*) filter (where pkg='RIDE'),
        'STAY',  count(*) filter (where pkg='STAY'),
        'CHEAP', count(*) filter (where pkg='CHEAP')
      ) from last_pkg
    ),
    -- ── Filtros usados (sitio, top 10, por fila) ──
    'filtros', (
      select coalesce(jsonb_agg(jsonb_build_object('filtro', filtro_usado, 'n', n)
               order by n desc), '[]'::jsonb)
      from (
        select filtro_usado, count(*) as n
        from src
        where accion='main_filtro_aplicado' and filtro_usado is not null
        group by filtro_usado
        order by n desc
        limit 10
      ) t
    ),
    -- ── Orígenes de tráfico (donut, por fila sobre main_visita) ──
    'origenes', (
      select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
      from (
        select lower(coalesce(origen_trafico,'direct')) as k, count(*) as n
        from src
        where accion='main_visita'
        group by 1
      ) t
    ),
    -- ── Devices (sitio, por fila sobre todas las filas) ──
    'devices', (
      select coalesce(jsonb_object_agg(device, n), '{}'::jsonb)
      from (
        select device, count(*) as n
        from src
        where device is not null
        group by device
      ) t
    )
  )
  from src;
$$;


-- ────────────────────────────────────────────────────────────────────
-- HELPER 2: métricas de rol_eventos_uso para una ventana [since, until)
-- ────────────────────────────────────────────────────────────────────
create or replace function radar_rol_metrics(p_since timestamptz, p_until timestamptz)
returns jsonb
language sql
stable
as $$
  with src as (
    select *
    from rol_eventos_uso
    where created_at >= p_since
      and (p_until is null or created_at < p_until)
  ),
  last_pkg as (
    select distinct on (session_id) session_id, upper(paquete) as pkg
    from src
    where accion = 'rol_paquete_elegido' and paquete is not null
    order by session_id, created_at desc
  )
  select jsonb_build_object(
    -- ── KPIs ──
    'sesiones',          count(distinct session_id),
    'planes',            count(*) filter (where accion='rol_plan_generado'),
    'sesiones_con_plan', count(distinct session_id) filter (where accion='rol_plan_generado'),
    'sesiones_visitan',  count(distinct session_id) filter (where accion='rol_visita'),
    'recordatorios',     count(*) filter (where accion='rol_recordatorios_activados'),
    'comprobantes',      count(*) filter (where accion='rol_comprobante_subido'),
    'tours',             count(*) filter (where accion='rol_tour_guardado'),
    'ics',               count(*) filter (where accion='rol_calendario_descargado'),
    'png',               count(*) filter (where accion='rol_png_descargado'),
    'shared',            count(*) filter (where accion='rol_compartido'),
    -- ── Embudo (sesiones únicas por paso) ──
    'embudo', jsonb_build_object(
      'visitas',       count(distinct session_id) filter (where accion='rol_visita'),
      'evento',        count(distinct session_id) filter (where accion='rol_evento_seleccionado'),
      'paquete',       count(distinct session_id) filter (where accion='rol_paquete_elegido'),
      'zona',          count(distinct session_id) filter (where accion='rol_zona_elegida'),
      'plan',          count(distinct session_id) filter (where accion='rol_plan_generado'),
      'recordatorios', count(distinct session_id) filter (where accion='rol_recordatorios_activados')
    ),
    -- ── Top eventos por planes generados (top 10, POR FILA, no distinct) ──
    'top_eventos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'evento_id', evento_id, 'nombre', nombre, 'planes', planes
             ) order by planes desc), '[]'::jsonb)
      from (
        select evento_id,
               coalesce(max(evento_nombre), evento_id::text) as nombre,
               count(*) as planes
        from src
        where accion='rol_plan_generado' and evento_id is not null
        group by evento_id
        order by planes desc
        limit 10
      ) t
    ),
    -- ── Paquetes (última elección por sesión) ──
    'paquetes', (
      select jsonb_build_object(
        'PLUS',  count(*) filter (where pkg='PLUS'),
        'RIDE',  count(*) filter (where pkg='RIDE'),
        'STAY',  count(*) filter (where pkg='STAY'),
        'CHEAP', count(*) filter (where pkg='CHEAP')
      ) from last_pkg
    ),
    -- ── Métodos de compartir (widget rro-share): cuenta por tipo_compra ──
    -- copy / whatsapp / email; cualquier otro valor (o vacío) cae en 'otro'.
    'share_metodos', (
      select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
      from (
        select case
                 when lower(coalesce(tipo_compra,'')) in ('copy','whatsapp','email')
                   then lower(tipo_compra)
                 else 'otro'
               end as k,
               count(*) as n
        from src
        where accion='rol_compartido'
        group by 1
      ) t
    )
  )
  from src;
$$;


-- ────────────────────────────────────────────────────────────────────
-- HELPER 3: métricas de pagos_eventos_uso para una ventana [since, until)
-- ────────────────────────────────────────────────────────────────────
create or replace function radar_pagos_metrics(p_since timestamptz, p_until timestamptz)
returns jsonb
language sql
stable
as $$
  with src as (
    select *
    from pagos_eventos_uso
    where created_at >= p_since
      and (p_until is null or created_at < p_until)
  )
  select jsonb_build_object(
    -- ── KPIs por sesión única ──
    'visitas', count(distinct session_id) filter (where accion='pagos_visita'),
    'copias',  count(distinct session_id) filter (where accion='pagos_cuenta_copiada'),
    'wa',      count(distinct session_id) filter (where accion='pagos_whatsapp_clic'),
    -- ── Cuentas más copiadas (top 10, por fila) ──
    'cuentas', (
      select coalesce(jsonb_agg(jsonb_build_object('cuenta', cuenta_copiada, 'n', n)
               order by n desc), '[]'::jsonb)
      from (
        select cuenta_copiada, count(*) as n
        from src
        where cuenta_copiada is not null
        group by cuenta_copiada
        order by n desc
        limit 10
      ) t
    ),
    -- ── Orígenes (bucket por referrer, igual que el frontend) ──
    'origenes', (
      select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
      from (
        select case
                 when referrer is null or referrer = ''        then 'direct'
                 when lower(referrer) like '%rol%'             then '/rol'
                 when lower(referrer) like '%conectareynosa%'  then 'interno'
                 when lower(referrer) like '%whatsapp%'
                   or lower(referrer) like '%wa.me%'           then 'whatsapp'
                 else 'externo'
               end as k,
               count(*) as n
        from src
        where accion='pagos_visita'
        group by 1
      ) t
    )
  )
  from src;
$$;


-- ────────────────────────────────────────────────────────────────────
-- FUNCIÓN PRINCIPAL: radar_metricas(rango)
-- Calcula las ventanas actual y anterior y devuelve TODO en un JSON.
-- Esta es la ÚNICA que el Radar llama por rango.
-- ────────────────────────────────────────────────────────────────────
create or replace function radar_metricas(p_rango text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_now        timestamptz := now();
  v_since      timestamptz;
  v_prev_since timestamptz;
begin
  -- Replica EXACTAMENTE _radarSinceISO / _radarPrevSinceISO del frontend.
  if p_rango = 'today' then
    -- medianoche de hoy en horario de Reynosa (America/Monterrey)
    v_since      := date_trunc('day', v_now at time zone 'America/Monterrey') at time zone 'America/Monterrey';
    v_prev_since := v_since - interval '1 day';
  elsif p_rango = 'week' then
    v_since      := v_now - interval '7 days';
    v_prev_since := v_now - interval '14 days';
  elsif p_rango = 'month' then
    v_since      := v_now - interval '30 days';
    v_prev_since := v_now - interval '60 days';
  elsif p_rango = '3months' then
    v_since      := v_now - interval '90 days';
    v_prev_since := v_now - interval '180 days';
  else
    -- 'all' (o cualquier valor desconocido) → desde epoch; prev queda vacío
    v_since      := '1970-01-01T00:00:00Z'::timestamptz;
    v_prev_since := '1970-01-01T00:00:00Z'::timestamptz;
  end if;

  return jsonb_build_object(
    'rango',    p_rango,
    'generado', v_now,
    'ventana',  jsonb_build_object('since', v_since, 'prev_since', v_prev_since),
    'main', jsonb_build_object(
      'act',  radar_main_metrics(v_since, null),
      'prev', radar_main_metrics(v_prev_since, v_since)
    ),
    'rol', jsonb_build_object(
      'act',  radar_rol_metrics(v_since, null),
      'prev', radar_rol_metrics(v_prev_since, v_since)
    ),
    'pagos', jsonb_build_object(
      'act',  radar_pagos_metrics(v_since, null)
    ),
    'waitlist_total', (select count(*) from eventos_waitlist)
  );
end;
$$;


-- ────────────────────────────────────────────────────────────────────
-- PERMISOS: el Radar llama con la anon key (Bearer SB_KEY). Las funciones
-- son SECURITY INVOKER (default) → respetan RLS igual que los SELECT que
-- el Radar ya hace hoy directo contra las tablas.
-- ────────────────────────────────────────────────────────────────────
grant execute on function radar_main_metrics(timestamptz, timestamptz)  to anon, authenticated;
grant execute on function radar_rol_metrics(timestamptz, timestamptz)   to anon, authenticated;
grant execute on function radar_pagos_metrics(timestamptz, timestamptz) to anon, authenticated;
grant execute on function radar_metricas(text)                          to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════
-- PRUEBAS (corre estas líneas DESPUÉS de crear las funciones)
-- Compara contra lo que YA validamos en supabase-verify-radar.sql.
-- ════════════════════════════════════════════════════════════════════

-- (A) Visitas únicas 'todo' — DEBE dar 8,918 (lo ya validado):
--   select (radar_metricas('all') #>> '{main,act,visitas}')::int as visitas_todo;

-- (B) JSON completo de un rango (legible):
--   select jsonb_pretty(radar_metricas('all'));
--   select jsonb_pretty(radar_metricas('month'));

-- (C) Tabla rápida: KPIs principales por rango, para comparar de un vistazo
--     con el panel del Radar (todas las pills):
--   select
--     r as rango,
--     (radar_metricas(r) #>> '{main,act,visitas}')::int      as visitas,
--     (radar_metricas(r) #>> '{main,act,cotizaciones}')::int as cotizaciones,
--     (radar_metricas(r) #>> '{main,act,modal}')::int        as modal,
--     (radar_metricas(r) #>> '{main,act,comprobante}')::int  as comprobante,
--     (radar_metricas(r) #>> '{main,act,codigos_ok}')::int   as codigos_ok,
--     (radar_metricas(r) #>> '{rol,act,planes}')::int        as planes,
--     (radar_metricas(r) #>> '{waitlist_total}')::int        as waitlist
--   from unnest(array['today','week','month','3months','all']) as r;

-- (D) Verifica que el conteo agregado == conteo crudo (sanity, rango 'all'):
--   select
--     (radar_metricas('all') #>> '{main,act,visitas}')::int                 as por_rpc,
--     (select count(distinct session_id) from main_eventos_uso
--        where accion='main_visita')                                        as por_query_directa;
--   -- ambas columnas deben coincidir.

-- (E) Comparativas usa ventanas propias (semana/mes/año/mes-YoY). Puede
--     llamar directo al helper con fechas explícitas, ej. últimos 30 días:
--   select jsonb_pretty(radar_main_metrics(now() - interval '30 days', null));
