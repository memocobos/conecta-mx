-- ============================================================================
-- CARD-ITIN-1 · el itinerario en la ficha de Esferas
-- ============================================================================
-- Lo corre MEMO (o Jane) en el proyecto de KameHouse (npgnhsmwpcipxgvfxrho).
--
-- ⚠️ NO ES OPCIONAL, Y HAY QUE CORRERLO ANTES DE PUBLICAR DESDE ESFERAS.
-- El compilador declara `itinerario` como campo suyo y lo vigila contra el
-- borrado silencioso (el candado de MEDIA-GUARD). Los dos eventos que ya
-- traen itinerario en el index —pulsoquetaro y tecatecomuna— lo tendrían en el
-- catálogo y NO en su ficha, así que el siguiente publish se REHUSARÍA (409)
-- nombrándolos, en vez de borrárselos. El paso 2 de abajo es justo lo que
-- cierra ese hueco: mueve el texto de `extras.promoModal` a su columna.
--
-- 🔒 EL TEXTO NO SE VUELVE A TECLEAR. Se MUEVE desde donde ya vive
-- (`extras -> promoModal -> desc`), que es la única forma de garantizar que el
-- itinerario que ve el cliente hoy es byte por byte el que verá mañana.
-- ============================================================================

-- ── 1. LAS TRES COLUMNAS ────────────────────────────────────────────────────
-- `itinerario`      el texto propio del evento. Es un OVERRIDE: cuando está
--                   vacío, el index pinta la PLANTILLA de la casa. Su ausencia
--                   NO significa «este evento no tiene itinerario».
-- `itinerario_null` la salida explícita, igual que `mapa_null`: «este evento
--                   NO lleva itinerario propio, y es una decisión». Sin ella,
--                   quitar un itinerario propio sería indistinguible de
--                   perderlo, y el candado se rehusaría para siempre.
-- `hora_show`       la hora del concierto. Existe porque la plantilla de CDMX
--                   la nombra y el catálogo NO la tiene: medido, ninguna de
--                   las 49 llaves del EV es una hora. Vacía, el index no pinta
--                   la frase — antes que inventar «9:00 p. m.», un hueco.
alter table esferas_eventos
  add column if not exists itinerario      text,
  add column if not exists itinerario_null boolean not null default false,
  add column if not exists hora_show       text;

comment on column esferas_eventos.itinerario is
  'CARD-ITIN-1: itinerario propio del evento. Vacio = usa la plantilla del index (Monterrey, o las dos variantes de CDMX). Para quitarlo a proposito va itinerario_null.';
comment on column esferas_eventos.itinerario_null is
  'CARD-ITIN-1: este evento NO lleva itinerario propio, dicho a proposito. Molde de mapa_null.';
comment on column esferas_eventos.hora_show is
  'CARD-ITIN-1: hora del concierto ("9:00 p. m."). La plantilla de CDMX la nombra y el catalogo no la tenia. Vacia = la frase no se pinta.';

-- ── 2. EL MOVIMIENTO · de `extras.promoModal` a su columna ──────────────────
-- `extras` es TEXT con JSON dentro, así que se castea para leerlo y se vuelve
-- a guardar como texto. Se toca SOLO a quien de verdad trae la llave prestada.
--
-- ⚠️ `promoModal` NO se elimina del mecanismo: dalemix lo sigue usando para lo
-- que es —«¡ESTE EVENTO INCLUYE COMIDA GRATIS!»— y no tiene fila en Esferas.
-- Lo que se quita es el PRÉSTAMO en los dos que lo usaban de itinerario.
update esferas_eventos
   set itinerario = (extras::jsonb -> 'promoModal' ->> 'desc'),
       extras     = case
                      when (extras::jsonb - 'promoModal') = '{}'::jsonb then null
                      else (extras::jsonb - 'promoModal')::text
                    end
 where slug in ('pulsoquetaro', 'tecatecomuna')
   and extras is not null
   and jsonb_typeof(extras::jsonb) = 'object'
   and extras::jsonb ? 'promoModal'
   and coalesce((extras::jsonb -> 'promoModal' ->> 'desc'), '') <> '';

-- ── 3. EL CAREO, para leerlo con los ojos antes de publicar ──────────────────
-- Los dos tienen que salir con `itinerario` lleno y SIN promoModal en extras.
select slug,
       length(itinerario)                             as largo_itinerario,
       left(itinerario, 40)                           as arranca_con,
       coalesce(extras, '(vacio)')                    as extras_ahora,
       ciudad, venue
  from esferas_eventos
 where slug in ('pulsoquetaro', 'tecatecomuna')
 order by slug;

-- ── 4. Y LA FOTO DE LOS QUE NO SON NI MONTERREY NI CDMX ─────────────────────
-- No hay nada que correr aquí: es para que Memo VEA a quiénes les toca
-- capturar su itinerario a mano, porque ninguna plantilla les sirve. Medido el
-- 23-sep: cinco eventos, y `ciudad` contradice al venue en tres de ellos.
select slug, ciudad, venue, status,
       case when coalesce(itinerario,'') <> '' then 'ya tiene' else 'LE FALTA' end as itinerario
  from esferas_eventos
 where coalesce(venue,'') !~* '(mty|monterrey|nuevo le|n\.l|guadalupe|showcenter|san nicol|fundidora|apodaca|santa catarina|cdmx|ciudad de m)'
   and coalesce(ciudad,'') <> 'CDMX'
 order by fecha_inicio nulls last;

-- ═══ CIERRE · CORRIDO POR JANE (23-sep-2026, tras el deploy de #759) ═════════
-- Coreografía respetada: merge → deploy → SQL. Correrlo ANTES del deploy abría
-- la ventana donde un publish con el compilador viejo borraba el itinerario de
-- los dos en silencio; después, la única ventana era el 409 con nombre.
-- (Una publicación de 77 eventos de Memo cayó EN MEDIO del merge — antes de
-- este SQL — y no rompió nada: CC careó el index auto-fusionado byte a byte.)
--
-- · Premisa leída ANTES de tocar: los dos traían `promoModal.desc` (385 y 401
--   caracteres) y las tres columnas NO existían (cols_ya = 0).
-- · Transacción única con DO de candados, los dos verdes: exactamente 2 filas
--   movidas limpias (itinerario lleno + extras sin promoModal) y CERO filas
--   ajenas con itinerario.
-- · Leído de vuelta: pulsoquetaro 385 · tecatecomuna 401, mismos arranques que
--   la premisa, `extras` en NULL en los dos — dalemix no se tocó (el WHERE
--   solo nombra a los dos, y su promo no es un itinerario).
-- · La foto del paso 4, HOY: 8 filas (la premisa decía 5 porque contaba solo
--   fichas con venue; hoy salen también 3 `proximamente` SIN venue — muse,
--   luismiguel, sabrina — que caen aquí porque un venue vacío no es ni MTY ni
--   CDMX, y se resuelven solos al capturarles el venue). LES FALTA itinerario
--   propio: julionrodep (Expo Coahuila, EN VENTA — el único urgente),
--   bahidora y bahidora2027 (Las Estacas, proximamente).
--
-- Desde aquí, publicar desde Esferas es libre: la ficha ya emite `itinerario`.
