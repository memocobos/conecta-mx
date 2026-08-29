-- ═══════════════════════════════════════════════════════════════════════════
-- ORACULO-FIX-1 · dos lecturas de Baba mentían
-- Base: KameHouse (npgnhsmwpcipxgvfxrho).  La corre Jane.
--
-- Cazadas por Memo en USO REAL. Las dos son la misma familia: el oráculo
-- OPINANDO sobre algo que no le tocaba calcular ni distinguir.
--
-- ── R4: INVENTABA SU PROPIA CUENTA DE INVENTARIO ───────────────────────────
-- Decía «Calle 24: 17 boletos» y quedan 7. Restaba `vendidos_fuera` pero NO a
-- los viajeros que consumen boleto, y el dueño de «quién consume» es
-- `consumeBoleto` de `_lib/paquete-viaje` — que vive en JavaScript.
--
-- 🔒 LA DECISIÓN: R4 DEJA DE CONTAR AQUÍ. El SQL entrega lo que SQL sabe —qué
-- eventos se acercan y cuántos quedan ciegos— y el ENDPOINT termina la cuenta
-- con `_lib/disponibilidad`, que es el dueño de verdad
-- (`compradas − fuera − seguras − apartadas − migrados`, y su término de
-- migrados ya pasa por `consumeBoleto`).
--
-- Se descartó la otra opción —el predicado en SQL con careo estático contra
-- `consumeBoleto`— porque sería UN ESPEJO MÁS que mantener sincronizado, y esta
-- casa ya sabe cómo acaban los espejos: el del rol llevaba 7 códigos de pareja
-- diciendo «sí» y descontando $0. Un espejo que nadie tiene que escribir no
-- puede divergir.
--
-- ── R2: RECETABA CÓDIGO A EVENTOS QUE NO ESTÁN EN VENTA ────────────────────
-- Bad Bunny está `proximamente`: no hay precio que descontar, así que proponer
-- un código es un consejo imposible. Ahora R2 parte en dos por `status`:
--   · EN VENTA        → cabe una propuesta de código;
--   · PROXIMAMENTE    → la acción que SÍ existe es publicarlo, y entonces la
--                       lista de espera avisa sola (WL-1).
-- Ni omitirlos ni recetarles promo: decir lo que sí se puede hacer.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function promos_oraculo()
returns jsonb
language sql
stable
as $$
with
hoy as (select (now() at time zone 'America/Matamoros')::date as d),
f as (
  select split_part(evento_id, ':', 1) as slug,
         count(*) filter (where accion = 'main_evento_visto')        as vistas,
         count(*) filter (where accion = 'main_cotizacion_generada') as cotiz,
         count(*) filter (where accion = 'main_comprobante_enviado') as comprob
  from main_eventos_uso
  where created_at >= now() - interval '7 days' and coalesce(evento_id, '') <> ''
  group by 1
),
cod as (
  select upper(trim(codigo_aplicado)) as codigo, count(*) as intentos,
         count(*) filter (where codigo_valido) as validos
  from main_eventos_uso
  where accion = 'main_codigo_intentado' and coalesce(trim(codigo_aplicado), '') <> ''
    and created_at >= now() - interval '30 days'
  group by 1
),
wl as (
  select split_part(evento_id, ':', 1) as slug, count(*) as espera,
         count(*) filter (where notificado is not true) as sin_notif
  from eventos_waitlist group by 1
),
-- [ORACULO-FIX-1] El estado del evento entra al oráculo. `status` vacío o nulo
-- es «a la venta» —así lo escribe el catálogo—, y cualquier otro valor NO lo es.
-- 🔒 Y «con precio» se pregunta al dato, no se supone: un evento sin zonas con
-- precio no tiene de qué descontar aunque su status diga que está a la venta.
-- ── QUÉ SIGNIFICA «EN VENTA», MEDIDO EN EL INDEX ───────────────────────────
-- ⚠️ Mi primera versión bendecía SOLO el status vacío. Eso mandaba `ultimos` —un
-- evento PUBLICADO Y COMPRABLE, con su chip de últimos lugares— a la lectura de
-- «cuando lo publiques…», que para algo ya publicado es MENTIRA. Clasificar por
-- semántica en vez de medir: la receta de la casa dice al revés.
--
-- LA TABLA SALE DEL INDEX, no de mi cabeza. `index.html:3691` define la puerta
-- de la compra con todas sus letras:
--     libre = !isAg && !isSV && !isPC2 && !isProc && !isNF && !isPronto && !isProxi
-- y `index.html:3948` lo dice en prosa: «'ultimos' TAMBIÉN se vende. Excluirlo
-- sería incoherente». Son NUEVE estados, no seis:
--
--   st              ¿vende?  evidencia en el index
--   ''              SÍ       `libre` = true
--   'ultimos'       SÍ       `libre` = true · y el comentario de :3948
--   'agotado'       no       isAg
--   'solo-viaje'    no       isSV
--   'por-confirmar' no       isPC2   (y PROXIMOS en :7016)
--   'proceso'       no       isProc  · ADEMÁS :4517 REDIRIGE A WHATSAPP en vez
--                                     de abrir el wizard — no hay cotizador
--   'nueva-fecha'   no       isNF    (y CERRADOS en :7017)
--   'pronto'        no       isPronto
--   'proximamente'  no       isProxi
--
-- 🔒 Y EL AUTO-SEMÁFORO, que es la segunda puerta y casi se me va: :3690 dice
-- que un evento SIN UNA SOLA ZONA LIBRE está agotado aunque su `st` no lo diga.
-- Hoy los 49 con status vacío tienen zona libre, así que no muerde — pero es la
-- misma clase de rama dormida que R1: no muerde hoy y sigue estando mal.
--
-- En la tabla viven hoy 4 de los 9 (vacío 49 · agotado 9 · proximamente 8 ·
-- ultimos 1). Los otros cinco existen en el catálogo y aparecerían el día que
-- alguien los ponga: la regla los cubre desde ya, en vez de esperarlos.
ev as (   -- el ESTADO de cualquier evento vivo, con o sin fecha
  select slug, nombre, fecha_inicio, status,
         coalesce(nullif(btrim(status), ''), '') in ('', 'ultimos')          as st_vende,
         exists (
           select 1 from jsonb_array_elements(
             case when jsonb_typeof(zonas::jsonb) = 'array' then zonas::jsonb else '[]'::jsonb end) z
           where coalesce(z->>'ag', '') not in ('1', 'true')
         )                                                                    as tiene_zona_libre
  from esferas_eventos where not archivado
),
ev_venta as (   -- las DOS puertas juntas: el estado y el auto-semáforo
  select e.*, (e.st_vende and e.tiene_zona_libre) as en_venta,
    -- 🔒 «NO SE VENDE» SON DOS COSAS DISTINTAS, y decirlo mal es la misma
    -- mentira que Jane cazó, un piso más abajo: a un `agotado` o a un
    -- `nueva-fecha` decirle «cuando lo publiques» es falso — ya está publicado.
    --   'aun_no' → todavía no sale a la venta: publicarlo es la acción.
    --   'ya_no'  → salió y se cerró: no hay nada que publicar.
    case
      when e.st_vende and e.tiene_zona_libre then 'vende'
      when coalesce(nullif(btrim(e.status),''),'') in ('proximamente','pronto','por-confirmar') then 'aun_no'
      else 'ya_no'
    end as fase
  from ev e
),
-- ⚠️ DOS CTE Y NO UNA, y la diferencia costó a Bad Bunny. Mi primera versión
-- pedía `fecha_inicio is not null` para TODO, porque R4 la necesita. Pero
-- `badbunny` y `jisoo` NO TIENEN FECHA —justo por estar sin confirmar— así que
-- se caían de R2B enteros: los dos casos que la lectura nueva existe para
-- contar, y uno de ellos con 271 almas esperando. Omitirlos era exactamente lo
-- que había que evitar. El filtro de fecha es de R4, no del estado.
ev_fecha as (   -- solo los que R4 puede fechar
  select v.*, (v.fecha_inicio - (select d from hoy)) as dias
  from ev_venta v where v.fecha_inicio is not null
),
r1 as (
  select jsonb_agg(jsonb_build_object('slug', f.slug, 'nombre', ev.nombre, 'vistas', f.vistas,
           'cotiz', f.cotiz, 'comprob', f.comprob,
           'pct', round(100.0*f.comprob/f.vistas, 1)) order by f.vistas desc) as items,
         count(*) as n
  from f join ev_venta ev on ev.slug = f.slug
  where f.vistas >= 100 and f.comprob::numeric/f.vistas < 0.02
    and ev.en_venta
),
-- ═══ R2 · PARTIDA EN DOS POR EL ESTADO DEL EVENTO ═══
r2_venta as (
  select jsonb_agg(jsonb_build_object('slug', wl.slug, 'nombre', ev.nombre,
           'espera', wl.espera, 'sin_notif', wl.sin_notif, 'vistas', f.vistas)
           order by wl.espera desc) as items, count(*) as n
  from wl join f on f.slug = wl.slug join ev_venta ev on ev.slug = wl.slug
  where wl.espera >= 10 and f.vistas > 0 and ev.en_venta
),
r2_pronto as (
  select jsonb_agg(jsonb_build_object('slug', wl.slug, 'nombre', ev.nombre,
           'espera', wl.espera, 'sin_notif', wl.sin_notif, 'vistas', f.vistas,
           'status', ev.status, 'fase', ev.fase) order by wl.espera desc) as items, count(*) as n
  from wl join f on f.slug = wl.slug join ev_venta ev on ev.slug = wl.slug
  where wl.espera >= 10 and f.vistas > 0 and not ev.en_venta
),
r3 as (
  select jsonb_agg(jsonb_build_object('codigo', codigo, 'intentos', intentos,
           'validos', validos, 'pct', round(100.0*validos/intentos)) order by intentos desc) as items,
         count(*) as n
  from cod where intentos >= 5 and validos::numeric/intentos < 0.6
),
-- ═══ R4 · YA NO CUENTA: entrega candidatos y el endpoint termina ═══
r4_cand as (
  select jsonb_agg(jsonb_build_object('slug', ev.slug, 'nombre', ev.nombre,
           'dias', ev.dias, 'en_venta', ev.en_venta) order by ev.dias) as items,
         count(*) as n
  from ev_fecha ev where ev.dias between 0 and 21 and ev.en_venta
),
r5 as (select count(*) as n from (select distinct slug from wl) w
       join (select distinct split_part(evento_id,':',1) as slug from stock_ajustes) t using (slug)),
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
    jsonb_build_object('regla','R2','titulo','espera con vistas · en venta',
      'fuente','eventos_waitlist + main_eventos_uso 7d + esferas_eventos.status',
      'nublado', (select n from r2_venta) = 0,
      'motivo', case when (select n from r2_venta)=0
                     then 'ninguna lista de espera de un evento EN VENTA pasa de 10 con miradas recientes' end,
      'items', coalesce((select items from r2_venta), '[]'::jsonb)),
    -- 🔒 LA LECTURA HONESTA para los que aún no se venden. No es una promo: es
    -- la acción que SÍ existe.
    jsonb_build_object('regla','R2B','titulo','espera de lo que aún no se vende',
      'fuente','eventos_waitlist + esferas_eventos.status',
      'nublado', (select n from r2_pronto) = 0,
      'motivo', case when (select n from r2_pronto)=0
                     then 'ningún evento por confirmar tiene lista de espera de 10 o más' end,
      'items', coalesce((select items from r2_pronto), '[]'::jsonb)),
    jsonb_build_object('regla','R3','titulo','código que rebota',
      'fuente','main_eventos_uso · codigo_intentado · 30 días · solo con código escrito',
      'nublado', (select n from r3) = 0,
      'motivo', case when (select n from r3)=0 then 'ningún código con 5+ intentos rebota más de la cuenta' end,
      'items', coalesce((select items from r3), '[]'::jsonb)),
    -- 🔒 R4 llega SIN inventario: el endpoint lo completa con
    -- `_lib/disponibilidad`, que es el dueño de la cuenta. Aquí solo van los
    -- candidatos por fecha, que es lo que SQL sabe.
    jsonb_build_object('regla','R4','titulo','se acerca con inventario',
      'fuente','esferas_eventos.fecha_inicio + _lib/disponibilidad (el endpoint completa)',
      'pendiente_inventario', true,
      'nublado', (select n from r4_cand) = 0,
      'motivo', case when (select n from r4_cand)=0
                     then 'ningún evento en venta se acerca en los próximos 21 días' end,
      'items', coalesce((select items from r4_cand), '[]'::jsonb)),
    jsonb_build_object('regla','R5','titulo','espera con inventario parado',
      'fuente','eventos_waitlist ∩ stock_ajustes', 'nublado', true,
      'motivo', 'mis esferas están nubladas: de ' || (select count(distinct slug) from wl) ||
                ' eventos con lista de espera y ' ||
                (select count(distinct split_part(evento_id,':',1)) from stock_ajustes) ||
                ' con inventario apartado, ' || (select n from r5) || ' tienen las dos cosas',
      'items', '[]'::jsonb),
    jsonb_build_object('regla','R6','titulo','evento que no levanta cobro',
      'fuente','abonos_viajero', 'nublado', true,
      'motivo', 'mis esferas están nubladas: solo hay ' || (select n from r6) ||
                ' abonos capturados en todo el sistema',
      'items', '[]'::jsonb)
  )
)
$$;

revoke execute on function promos_oraculo() from public;
revoke execute on function promos_oraculo() from anon;
revoke execute on function promos_oraculo() from authenticated;
grant  execute on function promos_oraculo() to service_role;

-- ═══ HUMO ═══════════════════════════════════════════════════════════════════
do $$
declare j jsonb; n int; r2v jsonb; r2b jsonb; r4 jsonb;
begin
  j := promos_oraculo();
  n := jsonb_array_length(j->'lecturas');
  if n <> 7 then raise exception 'FALLA: esperaba 7 lecturas (R2 se partió en dos), hay %', n; end if;

  select x into r2v from jsonb_array_elements(j->'lecturas') x where x->>'regla'='R2';
  select x into r2b from jsonb_array_elements(j->'lecturas') x where x->>'regla'='R2B';
  select x into r4  from jsonb_array_elements(j->'lecturas') x where x->>'regla'='R4';

  -- 🔒 R2 y R2B no pueden compartir un solo evento: son particiones, no filtros.
  if exists (
    select 1 from jsonb_array_elements(r2v->'items') a
    join jsonb_array_elements(r2b->'items') b on a->>'slug' = b->>'slug') then
    raise exception 'FALLA: un evento sale en R2 y en R2B a la vez';
  end if;
  -- 🔒 EL CASO QUE PIDIÓ JANE: un `ultimos` con espera >= 10 cae en R2A, no en
  -- R2B. Se monta sintético, se mide y se deshace — la tabla queda como estaba.
  begin
    insert into esferas_eventos (slug, nombre, status, zonas, archivado)
      values ('_humo_ultimos', 'Humo Últimos Lugares', 'ultimos',
              '[{"n":"General","p":1000}]'::jsonb, false);
    -- ⚠️ LAS COLUMNAS REALES, no las que yo recordaba. `eventos_waitlist` no
    -- tiene `correo`: tiene `email`, y además `evento_nombre` y `nombre` son
    -- NOT NULL. Un INSERT con nombres inventados no falla al escribirlo — falla
    -- al correrlo, que es donde lo cazó Jane.
    insert into eventos_waitlist (evento_id, evento_nombre, nombre, email)
      select '_humo_ultimos', 'Humo Últimos Lugares', 'Humo '||g, 'humo'||g||'@x.mx'
      from generate_series(1,12) g;
    -- ⚠️ Y `main_eventos_uso.session_id` es NOT NULL. Mi versión ni lo mandaba,
    -- y el `generate_series` iba SIN ALIAS, así que tampoco había de dónde sacar
    -- un valor distinto por fila. Con su alias, cada visita sintética trae la
    -- suya — que además es lo correcto: cinco visitas de una sola sesión no son
    -- cinco visitas.
    insert into main_eventos_uso (session_id, accion, evento_id, created_at)
      select 'humo-ultimos-'||g, 'main_evento_visto', '_humo_ultimos', now()
      from generate_series(1,5) g;

    j := promos_oraculo();
    select x into r2v from jsonb_array_elements(j->'lecturas') x where x->>'regla'='R2';
    select x into r2b from jsonb_array_elements(j->'lecturas') x where x->>'regla'='R2B';
    if not exists (select 1 from jsonb_array_elements(r2v->'items') a where a->>'slug'='_humo_ultimos') then
      raise exception 'FALLA: un evento `ultimos` con espera no llegó a R2 (le cabe código: está publicado y comprable)';
    end if;
    if exists (select 1 from jsonb_array_elements(r2b->'items') a where a->>'slug'='_humo_ultimos') then
      raise exception 'FALLA: un evento `ultimos` cayó en R2B — le diría «cuando lo publiques» a algo YA publicado';
    end if;

    -- y el par negativo, del mismo montaje: con TODAS las zonas agotadas, el
    -- auto-semáforo lo saca de venta aunque el status siga en `ultimos`.
    update esferas_eventos set zonas='[{"n":"General","p":1000,"ag":1}]'::jsonb where slug='_humo_ultimos';
    j := promos_oraculo();
    select x into r2v from jsonb_array_elements(j->'lecturas') x where x->>'regla'='R2';
    select x into r2b from jsonb_array_elements(j->'lecturas') x where x->>'regla'='R2B';
    if exists (select 1 from jsonb_array_elements(r2v->'items') a where a->>'slug'='_humo_ultimos') then
      raise exception 'FALLA: sin una sola zona libre sigue en R2 — el auto-semáforo no se aplicó';
    end if;
    if not exists (select 1 from jsonb_array_elements(r2b->'items') a where a->>'slug'='_humo_ultimos') then
      raise exception 'FALLA: sin zonas libres tampoco cayó en R2B — se perdió, y perder es lo prohibido';
    end if;
  exception when others then
    delete from main_eventos_uso where evento_id='_humo_ultimos';
    delete from eventos_waitlist where evento_id='_humo_ultimos';
    delete from esferas_eventos where slug='_humo_ultimos';
    raise;
  end;
  delete from main_eventos_uso where evento_id='_humo_ultimos';
  delete from eventos_waitlist where evento_id='_humo_ultimos';
  delete from esferas_eventos where slug='_humo_ultimos';
  j := promos_oraculo();   -- se recarga sin el sintético para lo que sigue
  select x into r2v from jsonb_array_elements(j->'lecturas') x where x->>'regla'='R2';
  select x into r2b from jsonb_array_elements(j->'lecturas') x where x->>'regla'='R2B';

  -- 🔒 NINGUNA regla que proponga código puede tocar algo que no se vende.
  -- Se comprueban las DOS que proponen, no solo la que falló.
  if exists (
    select 1 from jsonb_array_elements(j->'lecturas') l
    join jsonb_array_elements(l->'items') a on true
    join esferas_eventos e on e.slug = a->>'slug'
    where l->>'regla' in ('R1','R2','R4')
      and (coalesce(nullif(btrim(e.status),''),'') not in ('', 'ultimos')
        or not exists (select 1 from jsonb_array_elements(
             case when jsonb_typeof(e.zonas::jsonb)='array' then e.zonas::jsonb else '[]'::jsonb end) z
             where coalesce(z->>'ag','') not in ('1','true')))
  ) then
    raise exception 'FALLA: una regla que PROPONE código toca un evento sin venta o sin zonas con precio';
  end if;
  -- 🔒 y ninguno de R2 puede estar fuera de venta
  if exists (select 1 from jsonb_array_elements(r2v->'items') a
             join esferas_eventos e on e.slug = a->>'slug'
             where coalesce(nullif(btrim(e.status),''),'') not in ('', 'ultimos')) then
    raise exception 'FALLA: R2 propone código a un evento que no está en venta';
  end if;
  -- 🔒 R2B NO PUEDE PERDER a los eventos SIN FECHA: son justamente los que
  -- todavía no se confirman, y `badbunny` (271 en espera) es uno.
  if exists (
    select 1 from eventos_waitlist w
    join esferas_eventos e on e.slug = split_part(w.evento_id,':',1)
    where e.fecha_inicio is null and not e.archivado
    group by e.slug having count(*) >= 10
  ) and not exists (
    select 1 from jsonb_array_elements(r2b->'items') a
    join esferas_eventos e on e.slug = a->>'slug' where e.fecha_inicio is null
  ) then
    raise exception 'FALLA: R2B perdió a los eventos SIN FECHA — son los que la lectura existe para contar';
  end if;
  -- 🔒 R4 llega marcada como pendiente y sin inventario inventado
  if (r4->>'pendiente_inventario') is distinct from 'true' then
    raise exception 'FALLA: R4 no se declara pendiente de inventario';
  end if;
  if exists (select 1 from jsonb_array_elements(r4->'items') a where a ? 'inventario') then
    raise exception 'FALLA: R4 TRAE inventario — eso lo cuenta el endpoint, no el SQL';
  end if;
  -- el candado sigue puesto
  if has_function_privilege('anon','promos_oraculo()','EXECUTE') then
    raise exception 'FALLA: anon puede ejecutar promos_oraculo()';
  end if;

  raise notice 'HUMO OK · 7 lecturas · R2 (%) y R2B (%) sin solaparse · R4 pendiente de inventario · anon fuera',
    jsonb_array_length(r2v->'items'), jsonb_array_length(r2b->'items');
end $$;
