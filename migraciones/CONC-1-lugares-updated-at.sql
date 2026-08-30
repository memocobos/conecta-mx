-- ═══ CONC-1 · el candado optimista de `lugares` ══════════════════════════════
-- ACTA de lo que corrió en la base del PORTAL el 30-ago-2026 (Jane).
--
-- ⚠️ BASE: **PORTAL** (`PORTAL_SUPABASE_URL`), no KameHouse. `lugares` vive ahí
-- y los 14 endpoints que la tocan usan `PORTAL_SUPABASE_SERVICE_KEY`. La lección
-- de VEN-BORRA sigue viva: el inventario se hace POR BASE, y una migración
-- corrida en la base equivocada no falla — crea otra tabla.
--
-- Por qué: de 63 endpoints con PATCH, 17 hacen leer-modificar-escribir sobre
-- datos que dos personas editan, y 14 sin una sola condición. `lugares` es la
-- peor: la escriben los dos mundos —7 endpoints de admin y 6 del Portal— y
-- ninguno pregunta si alguien más la tocó. El caso clásico es
-- `admin-lugar-boleto`: relee `notas`, le agrega un renglón de auditoría y
-- reescribe el campo entero. Dos admins a la vez = una nota que desaparece.
--
-- ⏳ Y una honestidad sobre el CUÁNDO: hoy `lugares` tiene CERO filas, porque el
-- puente index→Portal (`RESERVA_PORTAL`) sigue apagado. El escenario del piloto
-- es de futuro inmediato, no de hoy. El candado llega ANTES que el riesgo, que
-- es exactamente como deben llegar los candados: después, ya hay datos perdidos
-- que nadie sabe reconstruir.
--
-- El candado va a ser `updated_at` como condición del PATCH. La columna ya
-- existe y los endpoints la escriben... A MANO, cada uno por su cuenta
-- (`updated_at: nowISO`). Eso deja el candado ciego en cuanto un endpoint se
-- olvide, y hay catorce. Este trigger lo quita de las manos de quien escribe.

alter table lugares
  add column if not exists updated_at timestamptz;

update lugares set updated_at = coalesce(updated_at, created_at, now())
 where updated_at is null;

-- ⚠️ `clock_timestamp()`, NO `now()`. `now()` es la hora de la TRANSACCIÓN y no
-- se mueve dentro de ella: dos updates en la misma transacción compartirían
-- versión, y el candado dejaría pasar justo el caso que viene a impedir. Lo
-- cazó el humo de abajo al correr de verdad —con `now()`, v1 y v2 salían
-- idénticos aunque hubiera un `pg_sleep` en medio.
create or replace function lugares_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists trg_lugares_updated_at on lugares;
create trigger trg_lugares_updated_at
  before update on lugares
  for each row execute function lugares_touch_updated_at();

-- ── humo ─────────────────────────────────────────────────────────────────────
-- El fixture arma la CADENA COMPLETA porque el esquema real lo exige y porque
-- hoy no hay de dónde prestar: `lugares` tiene DOS columnas NOT NULL sin default
-- —`solicitud_id` y `numero`— y `solicitudes_tour` tiene SIETE. Las dos están
-- VACÍAS hoy, así que no hay solicitud que prestar: se toma el único cliente
-- real, se inserta una solicitud de humo, y sobre ella el lugar. Todo se borra
-- en la MISMA transacción.
--
-- ⚠️ Y las columnas NO se adivinan: antes de insertar, el humo se CAREA contra
-- `information_schema` y revienta si el esquema tiene un NOT NULL sin default
-- que el fixture no cubre. La primera versión de esta acta se escribió a ojo y
-- decía algo que no corría —dos veces, una por tabla—: un fixture inventado es
-- la misma familia que una lista a mano al lado de la realidad.
--
-- ⚠️ NO hay `pg_sleep` y está bien así: con `clock_timestamp()` el reloj de
-- pared avanza entre statements, así que dos updates seguidos ya traen versiones
-- distintas. Los `pg_sleep` de la primera versión existían para tapar el hueco
-- de `now()` y ya no hacen falta — no los vuelvas a agregar.
--
-- Tres preguntas, y las tres se responden con datos:
--   1. ¿no quedó una sola fila sin `updated_at`?
--   2. ¿el trigger la mueve aunque el UPDATE no la mencione?
--   3. ¿la mueve TAMBIÉN cuando el UPDATE trae un valor viejo a mano?
--      (es el caso real: los endpoints todavía mandan `updated_at: nowISO`)
do $$
declare
  n int; v1 timestamptz; v2 timestamptz; v3 timestamptz;
  cli_ uuid; sol_ uuid; lug_ uuid; faltan text;
begin
  select count(*) into n from lugares where updated_at is null;
  if n <> 0 then raise exception 'CONC-1: quedaron % filas sin updated_at', n; end if;

  select id into cli_ from clientes limit 1;
  if cli_ is null then raise exception 'CONC-1: no hay un solo cliente del que colgar el humo'; end if;

  -- El careo del fixture contra el esquema, tabla por tabla.
  select string_agg(column_name, ', ') into faltan
    from information_schema.columns
   where table_schema = 'public' and table_name = 'solicitudes_tour'
     and is_nullable = 'NO' and column_default is null
     and column_name <> all (array['id','cliente_id','evento_id','evento_nombre',
                                   'paquete','zona','precio_total','monto_separo']);
  if faltan is not null then
    raise exception 'CONC-1: el fixture de solicitudes_tour no cubre NOT NULL sin default: %', faltan;
  end if;

  select string_agg(column_name, ', ') into faltan
    from information_schema.columns
   where table_schema = 'public' and table_name = 'lugares'
     and is_nullable = 'NO' and column_default is null
     and column_name <> all (array['id','solicitud_id','numero']);
  if faltan is not null then
    raise exception 'CONC-1: el fixture de lugares no cubre NOT NULL sin default: %', faltan;
  end if;

  insert into solicitudes_tour (id, cliente_id, evento_id, evento_nombre, paquete, zona, precio_total, monto_separo)
    values (gen_random_uuid(), cli_, '_humo_conc1', 'HUMO CONC-1 (se borra)', 'PLUS', 'Humo', 1, 1)
    returning id into sol_;
  insert into lugares (id, solicitud_id, numero)
    values (gen_random_uuid(), sol_, 999) returning id into lug_;
  select updated_at into v1 from lugares where id = lug_;

  update lugares set notas = coalesce(notas,'') || '.' where id = lug_;
  select updated_at into v2 from lugares where id = lug_;
  if v2 is null or v2 <= v1 then
    raise exception 'CONC-1: el trigger NO movió updated_at en un update que no la menciona (% -> %)', v1, v2;
  end if;

  update lugares set notas = notas || '.', updated_at = v1 where id = lug_;
  select updated_at into v3 from lugares where id = lug_;
  if v3 <= v2 then
    raise exception 'CONC-1: un valor viejo escrito a mano GANÓ al trigger (% -> %)', v2, v3;
  end if;

  delete from lugares where id = lug_;
  delete from solicitudes_tour where id = sol_;
  raise notice 'CONC-1 OK · 0 nulos · el trigger manda sobre el valor escrito a mano';
end $$;
