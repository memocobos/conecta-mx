-- ═══ CONC-4b · el candado de `solicitudes_tour`, la tabla más ancha ══════════
-- Acta para correr en la base del PORTAL (Jane). Gemela de CONC-1 y CONC-2.
--
-- ⚠️ BASE: **PORTAL** (`PORTAL_SUPABASE_URL`), no KameHouse.
--
-- Por qué: `solicitudes_tour` la escriben CINCO roles en CATORCE endpoints —
-- admin, cliente, webhook, cron y el embudo del dinero—. Es la tabla más ancha
-- del Portal y la última de la serie CONC.
--
-- ✅ Y aquí la columna llega LIMPIA, que es lo contrario de `pagos`: se midió y
-- **ninguno de los 14 endpoints escribe `updated_at`**. Está virgen, así que el
-- trigger no le quita la columna a nadie ni pelea con un valor puesto a mano.
-- En `pagos` cuatro de nueve la movían por su cuenta y ese era justo el peligro.

alter table solicitudes_tour
  add column if not exists updated_at timestamptz;

update solicitudes_tour set updated_at = coalesce(updated_at, created_at, now())
 where updated_at is null;

-- ⚠️ `clock_timestamp()`, NO `now()`. `now()` es la hora de la TRANSACCIÓN y no
-- se mueve dentro de ella: dos updates en la misma transacción compartirían
-- versión y el candado dejaría pasar justo el caso que viene a impedir.
create or replace function solicitudes_tour_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists trg_solicitudes_tour_updated_at on solicitudes_tour;
create trigger trg_solicitudes_tour_updated_at
  before update on solicitudes_tour
  for each row execute function solicitudes_tour_touch_updated_at();

-- ── lo que este candado NO cubre, dicho para que nadie lo "arregle" ──────────
-- El candado de VERSIÓN va en UNA sola escritura: `admin-solicitud-update-estado`,
-- la persiana manual — la única donde un humano tuvo la ficha abierta un rato y
-- puede pisar el cambio de otro sin enterarse. Las demás quedan fuera con razón
-- propia, y conviene que esté escrito:
--
--   · las CUATRO que reconcilian el estado (el embudo, aplicar-pago-grupo,
--     lugar-baja, lugar-traspasar) ya no deciden sobre una lectura vieja: desde
--     CONC-4a comparten `_lib/reconciliar-solicitud`, que lleva su guarda de
--     ESTADO en la URL y una pasada de verificación. Ponerles ADEMÁS una versión
--     las haría fallar contra sí mismas — la primera escritura mueve la versión
--     que la segunda todavía trae.
--   · las TRES del separo (los dos webhooks y el sello del admin) llevan candado
--     de ESTADO desde CONC-3: quien escribe ahí nunca vio una pantalla, así que
--     no tiene versión que mandar, pero sí sabe qué espera encontrar.
--   · `portal-nueva-solicitud` escribe sobre una fila que acaba de crear en el
--     mismo request: no hay contrincante posible.
--   · `admin-cancelar-evento` escribe un estado TERMINAL e idempotente en lote.
--   · `stripe-separo-crear` es de un camino descartado.
--
-- ⚠️ Consecuencia honesta del trigger, para que no sorprenda: ahora CUALQUIER
-- escritura sobre la solicitud —una reconciliación, un webhook, el cron de
-- apartados— mueve su versión. Un admin que dejó la ficha abierta y luego cambia
-- el estado recibirá un 409. Está BIEN: la solicitud cambió de verdad, y el 409
-- le pide releerla en vez de escribir sobre un dato viejo. Es el candado
-- funcionando, no un efecto colateral.

-- ── humo ─────────────────────────────────────────────────────────────────────
-- El fixture arma la cadena mínima (cliente → solicitud) y se borra en la MISMA
-- transacción. Las columnas NO se adivinan: son las mismas que CONC-1 y CONC-2
-- ya corrieron verdes en esta base, y aun así el humo se CAREA contra
-- `information_schema` y revienta con nombres si aparece un NOT NULL sin default
-- que el fixture no cubra.
--
-- ⚠️ EL POKE ES `zona`, Y NO ES UN CAPRICHO. La primera versión de este humo
-- empujaba `notas_admin` y MORDIÓ al correrse: esta tabla tiene un guardián
-- propio de la casa —el trigger **`solicitudes_bloquear_columnas_sensibles`**—
-- que rechaza la escritura de CINCO columnas para todo rol que no sea
-- `service_role`:
--
--     cliente_id · auth_user_id · estado · notas_admin · created_at
--
-- El acta tiene que poder correrla cualquiera, así que el poke usa una columna
-- que el guardián no vigila. Queda escrito por dos razones: es lo primero que va
-- a necesitar el próximo que escriba un humo sobre `solicitudes_tour`, y de paso
-- este rojo fue la PRUEBA de que ese guardián sigue vivo y mordiendo.
--
-- ⚠️ NO hay `pg_sleep` y está bien así: con `clock_timestamp()` el reloj de pared
-- avanza entre statements. No lo vuelvas a agregar.
--
-- Tres preguntas, y las tres se responden con datos:
--   1. ¿no quedó una sola fila sin `updated_at`?
--   2. ¿el trigger la mueve aunque el UPDATE no la mencione?
--   3. ¿la mueve TAMBIÉN cuando el UPDATE trae un valor viejo a mano?
--      (hoy ningún endpoint lo hace, pero el candado no puede depender de eso)
do $$
declare
  n int; v1 timestamptz; v2 timestamptz; v3 timestamptz;
  cli_ uuid; sol_ uuid; faltan text;
begin
  select count(*) into n from solicitudes_tour where updated_at is null;
  if n <> 0 then raise exception 'CONC-4b: quedaron % filas sin updated_at', n; end if;

  select id into cli_ from clientes limit 1;
  if cli_ is null then raise exception 'CONC-4b: no hay un solo cliente del que colgar el humo'; end if;

  select string_agg(column_name, ', ') into faltan
    from information_schema.columns
   where table_schema = 'public' and table_name = 'solicitudes_tour'
     and is_nullable = 'NO' and column_default is null
     and column_name <> all (array['id','cliente_id','evento_id','evento_nombre',
                                   'paquete','zona','precio_total','monto_separo']);
  if faltan is not null then
    raise exception 'CONC-4b: el fixture de solicitudes_tour no cubre NOT NULL sin default: %', faltan;
  end if;

  insert into solicitudes_tour (id, cliente_id, evento_id, evento_nombre, paquete, zona, precio_total, monto_separo)
    values (gen_random_uuid(), cli_, '_humo_conc4b', 'HUMO CONC-4b (se borra)', 'PLUS', 'Humo', 1, 1)
    returning id into sol_;
  select updated_at into v1 from solicitudes_tour where id = sol_;

  update solicitudes_tour set zona = coalesce(zona,'') || '.' where id = sol_;
  select updated_at into v2 from solicitudes_tour where id = sol_;
  if v2 is null or v2 <= v1 then
    raise exception 'CONC-4b: el trigger NO movió updated_at en un update que no la menciona (% -> %)', v1, v2;
  end if;

  update solicitudes_tour set zona = zona || '.', updated_at = v1 where id = sol_;
  select updated_at into v3 from solicitudes_tour where id = sol_;
  if v3 <= v2 then
    raise exception 'CONC-4b: un valor viejo escrito a mano GANÓ al trigger (% -> %)', v2, v3;
  end if;

  delete from solicitudes_tour where id = sol_;
  raise notice 'CONC-4b OK · 0 nulos · el trigger manda sobre el valor escrito a mano';
end $$;
