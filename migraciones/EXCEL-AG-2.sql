-- =============================================================================
-- EXCEL-AG-2 · LA PALOMITA POR EVENTO-FECHA
-- 2-oct-2026 · lo verifica y lo corre JANE, **ANTES** del merge de la tuerca
-- =============================================================================
-- Regla firmada de Memo (1-oct) y sus tres respuestas de la fase 2 (2-oct):
--   «La columna Pedido son los boletos que SÍ tenemos. Cuando Restan llega a 0,
--    esa zona se agota y listo. Si agrego boletos al Pedido, la zona se reactiva.»
--
-- 🔒 POR QUÉ VIVE EN `excel_pestanas` Y NO EN UNA TABLA NUEVA: esa tabla YA tiene
-- exactamente la granularidad que Memo pidió —UNA FILA POR EVENTO-FECHA—, ya
-- gobierna la relación Excel↔evento y ya trae `activa` y `regla_zona`. Una tabla
-- aparte sería una SEGUNDA lista de «qué pestaña manda», y esta casa ya sabe cómo
-- acaban las dos listas que todavía no divergen.
--
-- 🔒 DEFAULT `false`: NINGUNA nace prendida. Memo las prende una por una, con el
-- reporte de ese evento enfrente, y el primer evento lo elige él. Un default en
-- `true` sería prender 71 palomitas que nadie eligió — el defecto de `kmt-prov`
-- a escala de catálogo.
--
-- ⚠️ LO QUE ESTA COLUMNA **NO** HACE, y conviene decirlo aquí porque es donde
-- alguien va a venir a leer: prenderla NO aplica nada. Palabra de Memo (2-oct),
-- opción (a): **el careo PROPONE y un humano APLICA** con el botón y la vista
-- previa que ya existen. La palomita solo decide si ese evento-fecha ENTRA a la
-- propuesta.

begin;

alter table excel_pestanas
  add column if not exists ag_activa boolean not null default false;

comment on column excel_pestanas.ag_activa is
  'EXCEL-AG-2: si es true, el careo PROPONE cerrar/reactivar zonas de este '
  'evento-fecha según el bloque «Disponibilidad» del Excel (Pedido/Restan). '
  'NUNCA aplica sola: el humano aplica con la vista previa. Default false.';

commit;

-- ── CÓMO SE COMPRUEBA ───────────────────────────────────────────────────────
-- 🔒 No basta con que el ALTER corra: hay que ver que NINGUNA quedó prendida.
--
-- select count(*) filter (where ag_activa) as prendidas_debe_ser_0,
--        count(*) filter (where not ag_activa) as apagadas_debe_ser_115,
--        count(*) as total_debe_ser_115
--   from excel_pestanas;
--
-- Y que el default muerde en una fila NUEVA:
-- (en una transacción con rollback; es la prueba del candado, no una siembra)
--   begin;
--     insert into excel_pestanas (evento_id, pestana, activa)
--     values ('__prueba__', '__prueba__', false);
--     select ag_activa from excel_pestanas where evento_id = '__prueba__';  -- → false
--   rollback;

-- ── EL UNIVERSO, MEDIDO (2-oct-2026) ────────────────────────────────────────
-- `excel_pestanas`: 115 filas · 71 ACTIVAS · 44 inactivas · 112 pestañas distintas.
-- ⚠️ EL «123» QUE CIRCULÓ NO EXISTE: era una cifra heredada que solté yo en un
-- mensaje del 1-oct y que todos repetimos sin medirla. Queda escrito aquí para
-- que nadie vaya a buscar las 52 que faltan.
--
-- 🔒 Y UNA PESTAÑA PUEDE SERVIR A VARIAS FECHAS: coronacapital tiene CUATRO filas
-- activas compartiendo UNA pestaña, repartidas por `regla_zona` («General
-- Viernes» / «Sabado» / «Domingo» / «General»). Medido: cada regla casa con
-- EXACTAMENTE 1 zona del bloque, sin ambigüedad. Por eso la palomita por
-- evento-fecha sí mapea, y por eso vive en esta tabla y no en `esferas_eventos`.
