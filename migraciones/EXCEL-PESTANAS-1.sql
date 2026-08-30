-- ═══ EXCEL-PESTANAS-1 · el mapeo pestaña → evento ════════════════════════════
-- Acta para correr en la base de **KAMEHOUSE** (Jane). 1b la espera.
--
-- ⚠️ BASE: **KAMEHOUSE** (`SUPABASE_URL_KAMEHOUSE`), NO el Portal. Aquí vive
-- `esferas_eventos`, que es la ficha que va a mostrar y editar este mapeo, y
-- aquí viven los `evento_id`. Las actas de la serie CONC eran del PORTAL: el
-- inventario se hace POR BASE, y una migración corrida en la base equivocada no
-- falla — crea otra tabla.
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA EN LA FICHA. La propuesta original era una
-- columna en `esferas_eventos`. La medición dijo que no alcanza, y con nombres
-- de los careos de Jane:
--
--   · UNA pestaña puede ser VARIOS eventos. Corona Capital: una sola pestaña,
--     tres evento_id (#0/#1/#5), repartidos por el TEXTO de la zona.
--   · UN evento puede ser VARIAS pestañas. Tecate Pa'l Norte: la normal y la
--     VIP, 225 + 7 viajeros al mismo slug.
--   · Hay eventos CON pestaña y SIN ficha. `melanie` se borró a propósito y
--     P!nk no tiene slug: una columna en la ficha no puede representar lo que
--     no tiene ficha.
--
-- Una columna es un mapeo 1:1 y el dato real es N:N.

create table if not exists excel_pestanas (
  id          uuid primary key default gen_random_uuid(),
  -- El nombre humano TAL CUAL está en el Excel, con sus mayúsculas y sus
  -- guiones: "Stray Kids - 25 de septiembre". No se normaliza aquí — el Apps
  -- Script pide la pestaña por su nombre exacto, y normalizarla la haría
  -- imposible de encontrar.
  pestana     text not null,
  evento_id   text not null,
  -- El texto de zona que REPARTE una pestaña entre varios eventos (Corona
  -- Capital). NULL = la pestaña entera es de ese evento, que es el caso normal.
  regla_zona  text,
  activa      boolean not null default true,
  -- Para los casos raros que hay que recordar ("la VIP de Pa'l Norte",
  -- "melanie no tiene ficha"). Es para humanos; el código no la lee.
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- ⚠️ SIN LLAVE FORÁNEA A `esferas_eventos`, Y ES A PROPÓSITO. Es lo primero que
-- va a querer agregar el próximo que lea esto, y rompería justo los casos que
-- esta tabla existe para cubrir: `melanie` no tiene ficha (se borró) y P!nk no
-- tiene slug. Una FK aquí haría imposible mapear sus pestañas — que es
-- exactamente el trabajo. Si algún día TODOS los eventos tienen ficha, se
-- reconsidera; hoy no la tienen.

-- ⚠️ LA UNICIDAD VA CON `coalesce`, NO A SECAS. Un índice único sobre
-- (pestana, evento_id, regla_zona) con `regla_zona` NULLABLE **deja pasar todos
-- los duplicados**: en Postgres `NULL != NULL`, así que dos filas con NULL no
-- chocan nunca. Ya mordió antes en esta casa. La forma correcta es el índice
-- sobre la EXPRESIÓN, con el NULL colapsado a cadena vacía.
create unique index if not exists excel_pestanas_uq
  on excel_pestanas (pestana, evento_id, coalesce(regla_zona, ''));

-- Buscar por evento (la ficha) y por pestaña (la cosecha) son los dos caminos.
create index if not exists excel_pestanas_evento_idx on excel_pestanas (evento_id) where activa;
create index if not exists excel_pestanas_pestana_idx on excel_pestanas (pestana)   where activa;

-- La versión, con su trigger desde que nace. No hace falta HOY —la ficha es el
-- único editor—, pero la serie CONC dejó clara la lección: una columna de
-- versión que solo a veces se mueve es peor que no tenerla, y el candado llega
-- antes que el riesgo o llega tarde. `clock_timestamp()`, NO `now()`: `now()` es
-- la hora de la transacción y no se mueve dentro de ella.
create or replace function excel_pestanas_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists trg_excel_pestanas_updated_at on excel_pestanas;
create trigger trg_excel_pestanas_updated_at
  before update on excel_pestanas
  for each row execute function excel_pestanas_touch_updated_at();

-- Nadie llega a esta tabla desde `anon`: todo pasa por Netlify Functions con
-- service_role, que salta RLS. Sin políticas = deny-all, mismo patrón que
-- `sistema_config`.
alter table excel_pestanas enable row level security;

-- ── humo ─────────────────────────────────────────────────────────────────────
-- Todo se borra en la MISMA transacción. Cuatro preguntas, y las cuatro se
-- responden con datos — las tres primeras son los tres casos medidos que
-- obligaron a que esto fuera una tabla y no una columna:
--   1. ¿UNA pestaña puede apuntar a VARIOS eventos?            (Corona Capital)
--   2. ¿UN evento puede venir de VARIAS pestañas?              (Pa'l Norte)
--   3. ¿el índice único DE VERDAD frena un duplicado con regla_zona NULL?
--   4. ¿el trigger mueve `updated_at`?
do $$
declare
  n int; v1 timestamptz; v2 timestamptz; choco boolean := false;
  faltan text;
begin
  -- El careo del esquema contra sí mismo: que la tabla haya quedado como dice
  -- el acta, no como creo que quedó.
  select string_agg(c, ', ') into faltan from unnest(
      array['id','pestana','evento_id','regla_zona','activa','notas','created_at','updated_at']) as c
   where c not in (select column_name from information_schema.columns
                    where table_schema = 'public' and table_name = 'excel_pestanas');
  if faltan is not null then
    raise exception 'EXCEL-PESTANAS-1: a la tabla le faltan columnas: %', faltan;
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'excel_pestanas_uq') then
    raise exception 'EXCEL-PESTANAS-1: no se creó el índice único';
  end if;

  -- 1. Corona Capital: una pestaña, tres eventos, repartidos por zona.
  insert into excel_pestanas (pestana, evento_id, regla_zona, notas) values
    ('_HUMO Corona Capital', 'coronacapital#0', 'General Viernes', 'humo'),
    ('_HUMO Corona Capital', 'coronacapital#1', 'General Sabado',  'humo'),
    ('_HUMO Corona Capital', 'coronacapital#5', 'General',         'humo');
  select count(*) into n from excel_pestanas where pestana = '_HUMO Corona Capital';
  if n <> 3 then raise exception 'EXCEL-PESTANAS-1: una pestaña no pudo apuntar a 3 eventos (quedaron %)', n; end if;

  -- 2. Pa'l Norte: dos pestañas, un evento.
  insert into excel_pestanas (pestana, evento_id, notas) values
    ('_HUMO Pal Norte',     'palnorte', 'humo'),
    ('_HUMO Pal Norte VIP', 'palnorte', 'humo');
  select count(*) into n from excel_pestanas where evento_id = 'palnorte' and notas = 'humo';
  if n <> 2 then raise exception 'EXCEL-PESTANAS-1: un evento no pudo venir de 2 pestañas (quedaron %)', n; end if;

  -- 3. El duplicado con regla_zona NULL. Con un índice único a secas esto
  --    ENTRARÍA sin chistar, que es justo el defecto que se viene a impedir.
  begin
    insert into excel_pestanas (pestana, evento_id, notas)
      values ('_HUMO Pal Norte', 'palnorte', 'humo duplicado');
  exception when unique_violation then choco := true;
  end;
  if not choco then
    raise exception 'EXCEL-PESTANAS-1: el índice único DEJÓ PASAR un duplicado con regla_zona NULL';
  end if;

  -- 4. El trigger.
  select updated_at into v1 from excel_pestanas where pestana = '_HUMO Pal Norte VIP';
  update excel_pestanas set notas = 'humo tocado' where pestana = '_HUMO Pal Norte VIP';
  select updated_at into v2 from excel_pestanas where pestana = '_HUMO Pal Norte VIP';
  if v2 is null or (v1 is not null and v2 <= v1) then
    raise exception 'EXCEL-PESTANAS-1: el trigger no movió updated_at (% -> %)', v1, v2;
  end if;

  -- Borrado EXACTO, sin comodines. `like 'humo%'` habría barrido cualquier fila
  -- real cuya nota empiece con esa palabra, y `like '_HUMO %'` es peor todavía:
  -- en LIKE el guion bajo es un comodín de un carácter, así que casaría también
  -- con «XHUMO ». Un borrado se escribe con la lista, no con un patrón.
  delete from excel_pestanas
   where pestana in ('_HUMO Corona Capital', '_HUMO Pal Norte', '_HUMO Pal Norte VIP');
  select count(*) into n from excel_pestanas
   where pestana in ('_HUMO Corona Capital', '_HUMO Pal Norte', '_HUMO Pal Norte VIP');
  if n <> 0 then raise exception 'EXCEL-PESTANAS-1: el humo dejó % filas sin borrar', n; end if;
  raise notice 'EXCEL-PESTANAS-1 OK · N:N en los dos sentidos · el único frena el duplicado con NULL · el trigger mueve';
end $$;
