-- ═══ CONC-2 · el candado optimista del EMBUDO DEL DINERO ═════════════════════
-- Acta para correr en la base del PORTAL (Jane). Gemela de CONC-1, otra tabla.
--
-- ⚠️ BASE: **PORTAL** (`PORTAL_SUPABASE_URL`), no KameHouse. `pagos` vive ahí y
-- los 9 endpoints que la escriben usan `PORTAL_SUPABASE_SERVICE_KEY`. El
-- inventario se hace POR BASE — una migración corrida en la base equivocada no
-- falla: crea otra tabla.
--
-- Por qué: `pagos` la escriben TRES roles. Admin y cliente directo, y el webhook
-- por un embudo compartido (`_lib/marcar-pago.js → aplicarNucleo`, que llaman
-- `admin-marcar-pago`, `admin-separo-aplicar` y `stripe-webhook`). Ninguna de
-- las 11 escrituras lleva una sola condición.
--
-- ⚠️ Y el detalle que hace falta esta acta: **`pagos.updated_at` YA EXISTE**, y
-- lo escriben A MANO 4 de los 9 endpoints. Eso es peor que no tenerla: un
-- candado montado sobre esa columna dejaría pasar tranquilamente a los cinco que
-- no la mueven —el embudo entre ellos, que es el que más escribe— y diría que
-- todo bien. El trigger la saca de las manos de quien escribe.

alter table pagos
  add column if not exists updated_at timestamptz;

update pagos set updated_at = coalesce(updated_at, created_at, now())
 where updated_at is null;

-- ⚠️ `clock_timestamp()`, NO `now()`. `now()` es la hora de la TRANSACCIÓN y no
-- se mueve dentro de ella: dos updates en la misma transacción compartirían
-- versión y el candado dejaría pasar justo el caso que viene a impedir. Lo cazó
-- el humo de CONC-1 al correr de verdad; aquí ya nace bien.
create or replace function pagos_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists trg_pagos_updated_at on pagos;
create trigger trg_pagos_updated_at
  before update on pagos
  for each row execute function pagos_touch_updated_at();

-- ── lo que este candado NO cubre, dicho para que nadie lo "arregle" ──────────
-- SIETE escrituras sobre `pagos` son DE CONJUNTO, no de una fila:
--     admin-aplicar-pago-grupo   pagos?id=in.(…)
--     admin-lugar-baja           pagos?lugar_id=eq.⟨x⟩&estado=neq.pagado
--     admin-lugar-traspasar      pagos?lugar_id=eq.⟨x⟩&estado=eq.cancelado
--     admin-lugar-traspasar      pagos?lugar_id=eq.⟨x⟩&estado=neq.pagado
--     portal-invitacion-aceptar  pagos?lugar_id=eq.⟨x⟩&estado=neq.pagado
--     portal-reclamar-cuenta     pagos?cliente_id=eq.⟨x⟩&auth_user_id=is.null
--     marcar-vencidos-diario     pagos?id=in.(…)  →  estado='vencido'   (CRON)
--
-- ⚠️ [CONC-4a] Esta lista decía SEIS y faltaba `portal-invitacion-aceptar`. El
-- SQL de arriba no cambia — corrió bien y sigue bien—, pero esta lista existe
-- para impedir que alguien las "arregle" por simetría, y una lista que existe
-- para eso no puede estar incompleta. Se contó de nuevo con el barrido por
-- ayudante Y por cadena, y el control de siempre: las que YA SÉ que están ahí
-- tienen que aparecer.
--
-- ⚠️ La SEXTA no estaba en el reporte que Jane firmó, y vale decir por qué: mi
-- inventario buscaba la cadena `rest/v1/pagos`, y ese cron arma la URL con un
-- ayudante que antepone el prefijo (`sb('pagos?id=in.(…)')`). Se encontró
-- barriendo TODOS los ayudantes de esa forma; es la única escritura escondida
-- así en las dos tablas. Con ella, `pagos` tiene un CUARTO rol escritor: el cron.
-- Una versión POR FILA no cabe en un PATCH que toca veinte: exigir `updated_at`
-- de una sola las volvería imposibles de guardar. Su candado natural es el que
-- ya usan sin nombrarlo — el filtro de estado (`estado=neq.pagado` se niega a
-- pisar lo pagado). Quedan FUERA de CONC-2 a propósito, firmado por Jane.
-- No las "completes" por simetría: romperías siete caminos vivos.
--
-- ⚠️ Consecuencia honesta del trigger, para que no sorprenda: cuando el cron de
-- medianoche marca una cuota 'vencido', le mueve la versión. Un admin que dejó
-- el plan abierto desde antes recibirá un 409 al marcarla — y está BIEN: la
-- cuota cambió de verdad, y el 409 le pide releerla en vez de escribir sobre un
-- dato de ayer. Es el candado funcionando, no un efecto colateral.

-- ── humo ─────────────────────────────────────────────────────────────────────
-- El fixture arma la CADENA COMPLETA (cliente → solicitud → pago) y todo se
-- borra en la MISMA transacción.
--
-- ⚠️ Las columnas NO se adivinan, y esta vez tampoco se sacan de la memoria: la
-- lista sale de medir el INSERT real de `admin-generar-plan-pagos`, que es quien
-- crea las filas de `pagos` en producción y por construcción cubre sus NOT NULL.
-- Aun así el humo se CAREA contra `information_schema` y revienta con nombres si
-- el esquema tiene un NOT NULL sin default que el fixture no cubre — el acta de
-- CONC-1 se escribió a ojo y dijo dos veces algo que no corría.
--
-- ⚠️ NO hay `pg_sleep` y está bien así: con `clock_timestamp()` el reloj de pared
-- avanza entre statements. No lo vuelvas a agregar.
--
-- Tres preguntas, y las tres se responden con datos:
--   1. ¿no quedó una sola fila sin `updated_at`?
--   2. ¿el trigger la mueve aunque el UPDATE no la mencione?
--   3. ¿la mueve TAMBIÉN cuando el UPDATE trae un valor viejo a mano?
--      (es el caso real: cuatro endpoints todavía mandan `updated_at: nowISO`)
do $$
declare
  n int; v1 timestamptz; v2 timestamptz; v3 timestamptz;
  cli_ uuid; sol_ uuid; pag_ uuid; faltan text;
begin
  select count(*) into n from pagos where updated_at is null;
  if n <> 0 then raise exception 'CONC-2: quedaron % filas sin updated_at', n; end if;

  select id into cli_ from clientes limit 1;
  if cli_ is null then raise exception 'CONC-2: no hay un solo cliente del que colgar el humo'; end if;

  -- El careo del fixture contra el esquema, tabla por tabla.
  select string_agg(column_name, ', ') into faltan
    from information_schema.columns
   where table_schema = 'public' and table_name = 'solicitudes_tour'
     and is_nullable = 'NO' and column_default is null
     and column_name <> all (array['id','cliente_id','evento_id','evento_nombre',
                                   'paquete','zona','precio_total','monto_separo']);
  if faltan is not null then
    raise exception 'CONC-2: el fixture de solicitudes_tour no cubre NOT NULL sin default: %', faltan;
  end if;

  select string_agg(column_name, ', ') into faltan
    from information_schema.columns
   where table_schema = 'public' and table_name = 'pagos'
     and is_nullable = 'NO' and column_default is null
     and column_name <> all (array['id','solicitud_id','cliente_id','numero_pago',
                                   'concepto','monto','fecha_esperada','estado']);
  if faltan is not null then
    raise exception 'CONC-2: el fixture de pagos no cubre NOT NULL sin default: %', faltan;
  end if;

  insert into solicitudes_tour (id, cliente_id, evento_id, evento_nombre, paquete, zona, precio_total, monto_separo)
    values (gen_random_uuid(), cli_, '_humo_conc2', 'HUMO CONC-2 (se borra)', 'PLUS', 'Humo', 1, 1)
    returning id into sol_;
  insert into pagos (id, solicitud_id, cliente_id, numero_pago, concepto, monto, fecha_esperada, estado)
    values (gen_random_uuid(), sol_, cli_, 1, 'HUMO CONC-2', 1, current_date, 'pendiente')
    returning id into pag_;
  select updated_at into v1 from pagos where id = pag_;

  update pagos set referencia = coalesce(referencia,'') || '.' where id = pag_;
  select updated_at into v2 from pagos where id = pag_;
  if v2 is null or v2 <= v1 then
    raise exception 'CONC-2: el trigger NO movió updated_at en un update que no la menciona (% -> %)', v1, v2;
  end if;

  update pagos set referencia = referencia || '.', updated_at = v1 where id = pag_;
  select updated_at into v3 from pagos where id = pag_;
  if v3 <= v2 then
    raise exception 'CONC-2: un valor viejo escrito a mano GANÓ al trigger (% -> %)', v2, v3;
  end if;

  delete from pagos where id = pag_;
  delete from solicitudes_tour where id = sol_;
  raise notice 'CONC-2 OK · 0 nulos · el trigger manda sobre el valor escrito a mano';
end $$;
