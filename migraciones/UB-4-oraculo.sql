-- ═══════════════════════════════════════════════════════════════════════════
-- UB-4 · promos_oraculo() — las lecturas de Uranai Baba
-- Base: KameHouse (npgnhsmwpcipxgvfxrho).  La corre Jane.
--
-- SIN IA. Son reglas MEDIBLES sobre datos de la casa. Baba habla como adivina
-- pero JURA COMO NOTARIO: cada lectura devuelve sus números y su fuente, y el
-- texto de la pantalla se arma con ESOS números, no con adjetivos.
--
-- 🔒 TRES REGLAS DE LLAVE, firmadas:
--   1. Los eventos se llavean con `split_part(evento_id, ':', 1)`. En el log hay
--      26 ids con dos puntos —`omar:waitlist` y familia— que el modal de lista
--      de espera escribe como si fueran eventos. Son fantasmas DEL INSTRUMENTO,
--      no de la base: no se limpian los datos, se llavea bien.
--      ⚠️ No es cosmético: con las llaves sucias, R1 daba 4 eventos y da 2, y
--      R2 se perdía a `badbunny` con 271 almas esperando.
--   2. Los intentos de código se cuentan con `codigo_aplicado` NO NULO (857 de
--      954). Los 97 de diferencia son clics en Aplicar CON EL CAMPO VACÍO: un
--      envío en blanco no es un intento de código.
--   3. El día de hoy se corta en REYNOSA (`America/Matamoros`).
--
-- 🔒 Y LA REGLA DE ORO: si el dato no alcanza, la lectura sale con
-- `nublado: true` y su motivo. NUNCA se rellena. Dos de las seis nacen así.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function promos_oraculo()
returns jsonb
language sql
stable
as $$
with
hoy as (select (now() at time zone 'America/Matamoros')::date as d),
-- el embudo por evento, 7 días, con la llave LIMPIA
f as (
  select split_part(evento_id, ':', 1) as slug,
         count(*) filter (where accion = 'main_evento_visto')        as vistas,
         count(*) filter (where accion = 'main_cotizacion_generada') as cotiz,
         count(*) filter (where accion = 'main_comprobante_enviado') as comprob
  from main_eventos_uso
  where created_at >= now() - interval '7 days'
    and coalesce(evento_id, '') <> ''
  group by 1
),
-- los códigos, con el filtro de 857
cod as (
  select upper(trim(codigo_aplicado)) as codigo,
         count(*) as intentos,
         count(*) filter (where codigo_valido) as validos
  from main_eventos_uso
  where accion = 'main_codigo_intentado'
    and coalesce(trim(codigo_aplicado), '') <> ''
    and created_at >= now() - interval '30 days'
  group by 1
),
wl as (
  select split_part(evento_id, ':', 1) as slug,
         count(*) as espera,
         count(*) filter (where notificado is not true) as sin_notif
  from eventos_waitlist group by 1
),
ev as (
  select slug, nombre, fecha_inicio, (fecha_inicio - (select d from hoy)) as dias
  from esferas_eventos where not archivado and fecha_inicio is not null
),
st as (select split_part(evento_id,':',1) as slug, sum(vendidos_fuera) as fuera from stock_ajustes group by 1),
cp as (select split_part(evento_id,':',1) as slug, sum(cantidad) as boletos from compras group by 1),

-- ═══ R1 · MIRADA SIN COMPRA ═══
r1 as (
  select jsonb_agg(jsonb_build_object(
           'slug', slug, 'vistas', vistas, 'cotiz', cotiz, 'comprob', comprob,
           'pct', round(100.0*comprob/vistas, 1)) order by vistas desc) as items,
         count(*) as n
  from f where vistas >= 100 and comprob::numeric/vistas < 0.02
),
-- ═══ R2 · ESPERA CON VISTAS ═══
r2 as (
  select jsonb_agg(jsonb_build_object(
           'slug', wl.slug, 'espera', wl.espera, 'sin_notif', wl.sin_notif,
           'vistas', f.vistas) order by wl.espera desc) as items,
         count(*) as n
  from wl join f on f.slug = wl.slug where wl.espera >= 10 and f.vistas > 0
),
-- ═══ R3 · CÓDIGO QUE REBOTA ═══
r3 as (
  select jsonb_agg(jsonb_build_object(
           'codigo', codigo, 'intentos', intentos, 'validos', validos,
           'pct', round(100.0*validos/intentos)) order by intentos desc) as items,
         count(*) as n
  from cod where intentos >= 5 and validos::numeric/intentos < 0.6
),
-- ═══ R4 · SE ACERCA CON INVENTARIO ═══
-- Solo puede hablar de eventos con `compras` capturadas. Se devuelve TAMBIÉN
-- cuántos se quedan fuera por falta de dato, para que Baba lo diga.
r4 as (
  select jsonb_agg(jsonb_build_object(
           'slug', ev.slug, 'nombre', ev.nombre, 'dias', ev.dias,
           'inventario', cp.boletos - coalesce(st.fuera,0)) order by ev.dias) as items,
         count(*) as n
  from ev join cp on cp.slug = ev.slug left join st on st.slug = ev.slug
  where ev.dias between 0 and 21 and (cp.boletos - coalesce(st.fuera,0)) > 0
),
r4_ciegos as (
  select count(*) as n from ev
  where dias between 0 and 21 and slug not in (select slug from cp)
),
-- ═══ R5 y R6 · las que NACEN EN SILENCIO ═══
r5 as (
  select count(*) as n from (select distinct slug from wl) w join (select distinct slug from st) t using (slug)
),
r6 as (select count(*) as n from abonos_viajero)

select jsonb_build_object(
  'generado_en', now(),
  'hoy_reynosa', (select d from hoy),
  'lecturas', jsonb_build_array(
    jsonb_build_object('regla','R1','titulo','mirada sin compra',
      'fuente','main_eventos_uso · 7 días · evento_visto vs comprobante_enviado',
      'nublado', (select n from r1) = 0,
      'motivo', case when (select n from r1)=0 then 'ningún evento con 100+ vistas tiene tan pocas compras' end,
      'items', coalesce((select items from r1), '[]'::jsonb)),
    jsonb_build_object('regla','R2','titulo','espera con vistas',
      'fuente','eventos_waitlist + main_eventos_uso · 7 días',
      'nublado', (select n from r2) = 0,
      'motivo', case when (select n from r2)=0 then 'ninguna lista de espera pasa de 10 con miradas recientes' end,
      'items', coalesce((select items from r2), '[]'::jsonb)),
    jsonb_build_object('regla','R3','titulo','código que rebota',
      'fuente','main_eventos_uso · codigo_intentado · 30 días · solo con código escrito',
      'nublado', (select n from r3) = 0,
      'motivo', case when (select n from r3)=0 then 'ningún código con 5+ intentos rebota más de la cuenta' end,
      'items', coalesce((select items from r3), '[]'::jsonb)),
    jsonb_build_object('regla','R4','titulo','se acerca con inventario',
      'fuente','esferas_eventos.fecha_inicio + compras − stock_ajustes',
      'nublado', (select n from r4) = 0,
      'motivo', case when (select n from r4)=0
                     then 'no hay inventario capturado en los eventos que se acercan' end,
      'ciegos', (select n from r4_ciegos),
      'items', coalesce((select items from r4), '[]'::jsonb)),
    -- 🔒 LAS DOS QUE NACEN EN SILENCIO. No se omiten: se declaran nubladas con
    -- su razón, para que el día que el dato exista empiecen a hablar solas.
    jsonb_build_object('regla','R5','titulo','espera con inventario parado',
      'fuente','eventos_waitlist ∩ stock_ajustes',
      'nublado', true,
      'motivo', 'mis esferas están nubladas: de ' || (select count(distinct slug) from wl) ||
                ' eventos con lista de espera y ' || (select count(distinct slug) from st) ||
                ' con inventario apartado, ' || (select n from r5) || ' tienen las dos cosas',
      'items', '[]'::jsonb),
    jsonb_build_object('regla','R6','titulo','evento que no levanta cobro',
      'fuente','abonos_viajero',
      'nublado', true,
      'motivo', 'mis esferas están nubladas: solo hay ' || (select n from r6) ||
                ' abonos capturados en todo el sistema',
      'items', '[]'::jsonb)
  )
)
$$;

comment on function promos_oraculo() is
  'UB-4 · las lecturas de Uranai Baba. Reglas medibles, sin IA. Eventos por '
  'split_part(evento_id,'':'',1); códigos solo con codigo_aplicado no nulo; hoy en Reynosa. '
  'Una lectura sin dato sale nublada con su motivo, nunca rellena.';

-- ═══ HUMO ═══════════════════════════════════════════════════════════════════
do $$
declare j jsonb; n int; nub int;
begin
  j := promos_oraculo();
  n := jsonb_array_length(j->'lecturas');
  if n <> 6 then raise exception 'FALLA: esperaba 6 lecturas, hay %', n; end if;
  select count(*) into nub from jsonb_array_elements(j->'lecturas') x where (x->>'nublado')::boolean;
  -- R5 y R6 nacen nubladas SIEMPRE hoy
  if nub < 2 then raise exception 'FALLA: R5 y R6 tenían que salir nubladas, y hay % nubladas', nub; end if;
  -- toda lectura nublada trae su motivo, y ninguna trae items
  if exists (select 1 from jsonb_array_elements(j->'lecturas') x
             where (x->>'nublado')::boolean and coalesce(x->>'motivo','')='') then
    raise exception 'FALLA: una lectura nublada sin motivo';
  end if;
  if exists (select 1 from jsonb_array_elements(j->'lecturas') x
             where (x->>'nublado')::boolean and jsonb_array_length(x->'items')>0) then
    raise exception 'FALLA: una lectura nublada CON items — eso es rellenar';
  end if;
  -- y toda lectura que habla trae items Y fuente
  if exists (select 1 from jsonb_array_elements(j->'lecturas') x
             where not (x->>'nublado')::boolean
               and (jsonb_array_length(x->'items')=0 or coalesce(x->>'fuente','')='')) then
    raise exception 'FALLA: una lectura que habla sin items o sin fuente';
  end if;
  raise notice 'HUMO OK · 6 lecturas · % nubladas con motivo y sin items · las que hablan traen fuente', nub;
end $$;
