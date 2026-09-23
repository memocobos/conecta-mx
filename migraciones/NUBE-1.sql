-- ============================================================================
-- NUBE-1 · nube_cotizaciones · la cotización semanal de transporte a CDMX
-- ============================================================================
-- Lo corre JANE en el proyecto de KameHouse (npgnhsmwpcipxgvfxrho).
--
-- QUÉ ES: Bulma y Milk cotizan cada lunes el transporte a CDMX —bus y avión— y
-- suben el costo por persona. El sitio lo bebe de aquí en vez de llevar un
-- `2500` tecleado.
--
-- 🔒 INSERT-ONLY. Una captura nueva es una FILA NUEVA, jamás un UPDATE del
-- precio: LA TABLA ES EL HISTORIAL. El trigger de abajo lo hace cumplir, con
-- el mismo molde que `giveaway_rondas_inmutables` — y por la misma razón: un
-- dato que alguien va a citar en una disputa («a mí me dijeron $X») no puede
-- poder cambiar debajo.
--
-- 🔒 LA CICATRIZ DE OMAR COURTZ VA ADENTRO DESDE EL DÍA UNO. `precios_historial`
-- graba CAMBIOS, así que «nunca cambió» y «yo todavía no existía» se ven igual
-- desde la tabla — y eso hizo que /rol cotizara EL PRECIO DE HOY para un separo
-- pasado. Aquí no puede pasar: la PRIMERA fila de un modo es su NACIMIENTO, y
-- la consulta histórica contesta con la fila cuya VIGENCIA cubría el día
-- preguntado. Si el día es anterior al nacimiento, la respuesta es «la nube aún
-- no existía» — nunca «nunca cambió», y nunca el precio de hoy con etiqueta de
-- ayer.
--
-- 🔒 RLS HABILITADO Y SIN POLÍTICAS = DENY-ALL. El navegador JAMÁS la lee
-- directo: la leen `nube-vigente` (público, solo filas vigentes) y `admin-nube`
-- (con rol), las dos con la service key. Mismo patrón que `invitaciones_portal`
-- y `numerologia_eventos`.
-- ============================================================================

create table if not exists public.nube_cotizaciones (
  id             uuid primary key default gen_random_uuid(),
  -- Los dos modos del transporte a CDMX. Lista CERRADA: un modo desconocido
  -- sería un precio que nadie sabe a qué corresponde.
  modo           text        not null check (modo in ('bus','avion')),
  -- POR PERSONA. El total lo hace quien ya multiplica por viajeros; aquí no
  -- vive ninguna aritmética.
  precio_pp      numeric     not null check (precio_pp > 0),
  -- Vigencia OBLIGATORIA, guardada como INSTANTE (ley ESF: lo que se teclea se
  -- lee en hora de Reynosa y se guarda resuelto, para que no haya literal que
  -- escribir mal).
  vigente_desde  timestamptz not null default now(),
  vigente_hasta  timestamptz not null,
  nota           text,
  capturado_por  text        not null,
  creado_en      timestamptz not null default now(),
  -- Una vigencia al revés es un dato imposible, y se rechaza EN LA PUERTA.
  constraint nube_vigencia_coherente check (vigente_hasta > vigente_desde)
);

-- Para «¿qué regía el día X?» y para «¿cuál es la vigente ahora?»: las dos
-- preguntas van por modo y por vigencia.
create index if not exists nube_cot_modo_desde_idx
  on public.nube_cotizaciones (modo, vigente_desde desc);
create index if not exists nube_cot_modo_hasta_idx
  on public.nube_cotizaciones (modo, vigente_hasta desc);

-- ── EL TRIGGER DE INMUTABILIDAD ─────────────────────────────────────────────
-- Molde de `giveaway_rondas_inmutables`. Se prohíbe TODO UPDATE de las columnas
-- que son el hecho —modo, precio y vigencia— y también el DELETE: el historial
-- no se corrige, se le agrega una fila nueva. `nota` queda editable a propósito
-- (es el margen del capturador, no el dato).
create or replace function public.nube_cotizaciones_inmutables()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'nube_cotizaciones es INSERT-ONLY: el historial no se borra (fila %)', old.id;
  end if;
  if new.modo is distinct from old.modo
     or new.precio_pp is distinct from old.precio_pp
     or new.vigente_desde is distinct from old.vigente_desde
     or new.vigente_hasta is distinct from old.vigente_hasta
     or new.capturado_por is distinct from old.capturado_por
     or new.creado_en is distinct from old.creado_en then
    raise exception 'nube_cotizaciones es INSERT-ONLY: para cambiar un precio se captura una fila NUEVA (fila %)', old.id;
  end if;
  return new;
end $$;

drop trigger if exists nube_cotizaciones_inmutables_trg on public.nube_cotizaciones;
create trigger nube_cotizaciones_inmutables_trg
  before update or delete on public.nube_cotizaciones
  for each row execute function public.nube_cotizaciones_inmutables();

-- ── RLS: deny-all ───────────────────────────────────────────────────────────
alter table public.nube_cotizaciones enable row level security;
-- Sin políticas a propósito. Solo la service key entra.

comment on table public.nube_cotizaciones is
  'NUBE-1: cotizacion semanal del transporte a CDMX (bus|avion), por persona. '
  'INSERT-ONLY con trigger: la tabla ES el historial. La primera fila de un modo '
  'es su NACIMIENTO, y una consulta por un dia anterior contesta «la nube aun no '
  'existia» — nunca el precio de hoy con etiqueta de ayer (la cicatriz de Omar).';
comment on column public.nube_cotizaciones.precio_pp is
  'POR PERSONA. El total se hace donde ya vive la multiplicacion del bus; aqui no '
  'hay aritmetica.';
comment on column public.nube_cotizaciones.vigente_hasta is
  'Instante en que deja de regir. VENCIDA = NO HAY PRECIO: el sitio cae a su '
  'WhatsApp y JAMAS pinta un precio vencido (la mentira de NATA, en transporte).';
comment on column public.nube_cotizaciones.capturado_por is
  'Quien la subio, para que una disputa se resuelva LEYENDO y no recordando.';

-- ── EL CAREO, para leerlo con los ojos ──────────────────────────────────────
-- 1) La tabla nace VACÍA a propósito: sin fila vigente, el sitio se comporta
--    EXACTAMENTE como hoy (WhatsApp). El camino actual es el respaldo y no se
--    borra, así que la nube puede estrenarse sin prisa.
select 'filas' as que, count(*)::text as valor from public.nube_cotizaciones
union all
select 'rls_activo', (select case when relrowsecurity then 'si' else 'NO' end
                        from pg_class where oid = 'public.nube_cotizaciones'::regclass)
union all
select 'politicas', (select count(*)::text from pg_policies
                      where schemaname='public' and tablename='nube_cotizaciones')
union all
select 'trigger', (select count(*)::text from pg_trigger
                    where tgrelid='public.nube_cotizaciones'::regclass and not tgisinternal);

-- 2) Y LA PRUEBA DEL TRIGGER, que conviene correr una vez y leer el error:
--    begin;
--      insert into public.nube_cotizaciones (modo, precio_pp, vigente_hasta, capturado_por)
--        values ('bus', 2500, now() + interval '7 days', 'prueba-jane');
--      -- las dos de abajo TIENEN que tronar:
--      update public.nube_cotizaciones set precio_pp = 9999 where capturado_por = 'prueba-jane';
--      delete from public.nube_cotizaciones where capturado_por = 'prueba-jane';
--    rollback;

-- ═══════════════════════════════════════════════════════════════════════════
-- CIERRE · CORRIDO POR JANE EL 23-SEP-2026, **ANTES DEL MERGE**
-- ═══════════════════════════════════════════════════════════════════════════
-- El orden importa y quedó así a propósito: el endpoint JAMÁS pisó producción
-- sin su tabla. Un `nube-vigente` desplegado contra una tabla que no existe
-- habría contestado su fail-soft —«no hay precio»— y eso se ve EXACTAMENTE
-- igual que «nadie ha cotizado esta semana»: el hueco se habría escondido
-- detrás de su propia red.
--
-- VERIFICADO POR JANE, punto por punto:
--   · tabla creada · 8 columnas · 3 CHECK (modo, precio>0, vigencia)      ✓
--   · el trigger de inmutabilidad, cubriendo UPDATE **y** DELETE           ✓
--     ⚠️ OJO AL NÚMERO, para que quien re-verifique no crea que falta algo:
--     `pg_trigger` cuenta **1**, no 2. Es UN trigger (`before update or
--     delete`) con DOS eventos, y así lo dice la base — medido el 23-sep:
--     nube_cotizaciones_inmutables_trg · before · for each row ·
--     update ✓ delete ✓ **insert ✗** (los INSERT tienen que pasar: la tabla
--     es INSERT-only, no read-only).
--     El reporte hablaba de «2 triggers» leyendo los dos eventos; el dato de
--     la base es 1 objeto. Se deja el número REAL porque un acta que no
--     reproduce lo que la consulta contesta manda a buscar un hueco que no
--     existe.
--   · RLS = true con 0 políticas (deny-all de verdad, no prometido)       ✓
--   · 0 filas y 0 capturas con «prueba» en `capturado_por`                ✓
--   · la prueba del trigger se DISPARÓ en transacción: mordió con su
--     mensaje exacto, y el rollback dejó la tabla en 0 filas —
--     SIN NACIMIENTO FALSO                                                ✓
--   · la fila de prueba NO existe                                         ✓
--
-- 🔒 Y ESE ÚLTIMO PUNTO NO ES PAPELEO: la PRIMERA fila de un modo es su
-- NACIMIENTO, y el historial contesta «la nube aún no existía» para cualquier
-- día anterior. Una fila de prueba olvidada le habría inventado a la nube una
-- fecha de nacimiento en septiembre, y la consulta histórica habría empezado a
-- contestar «vencida» donde la verdad es «todavía no existía». Se probó el
-- candado sin ensuciar el dato que el candado protege.
