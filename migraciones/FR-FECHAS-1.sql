-- ═══════════════════════════════════════════════════════════════════════════
-- FR-FECHAS-1 · FUERZA REGIDA GANA EL 15 Y 16 DE ENERO (29-oct-2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Palabra de Memo, citada: «fuerza ergida anuncio 15 y 16 de enero tambien
-- entonces necesito que adaptes todo lo necesario de su card para activar esas
-- 2 fechas extras en multifecha y en esas dos fechas activa todas las zonas
-- nuevamente y separo de $300 igual , dale»
--
-- ⚠️ ESTA ACTA ES EL REGISTRO: los dos UPDATEs YA CORRIERON el 29-oct-2026 vía
-- MCP (execute_sql) contra KH (npgnhsmwpcipxgvfxrho), cada uno con su VALOR
-- ESPERADO en el WHERE. Correrla de nuevo escribe CERO filas (los WHERE ya no
-- casan) — es idempotente por construcción.
--
-- LO QUE NO SE TOCÓ, deliberado:
--  · Las entradas #0 (11 Enero) y #1 (12 Enero) del multifecha: byte a byte
--    (md5 careado antes/después). Sus zonas agotadas a mano por ventas REALES
--    siguen agotadas.
--  · Las zonas GLOBALES de la ficha: con multifecha el compilador las DERIVA
--    de las fechas (ESF-UX-2c) — la columna ya ni se lee; el publish la aplana.
--  · sep/sep_cheap: ya estaban en 300/300 — las fechas nuevas lo HEREDAN
--    (las entradas de multifecha no llevan sep propio).
--  · fecha_fin: se queda NULL a propósito. Un rango 11→16 metería el 13 y el
--    14 (días SIN show) a `_diasDelRango` del compilador.
--
-- LAS DOS FECHAS NUEVAS SE DERIVARON DE LA ENTRADA #0 (jsonb_set de lbl/ds +
-- todas las zonas con ag:0), NO se teclearon: 15 zonas PLUS + 15 CHEAP cada
-- una, precios idénticos a los del 11-ene zona por zona. La escritura fue
-- concatenación TEXTUAL sobre la columna (multifecha es TEXT) para conservar
-- #0/#1 byte a byte en vez de re-serializar todo el array.

-- ── [1] Las 2 entradas nuevas del multifecha (CORRIDO 29-oct, 1 fila) ──────
with ficha as (
  select multifecha from esferas_eventos where slug = 'fuerzaregida'
),
base as (select (multifecha::jsonb)->0 as e from ficha),
zonas_abiertas as (
  select jsonb_agg(z.val || '{"ag":0}'::jsonb order by z.ord) as arr
  from base, jsonb_array_elements(base.e->'zonas') with ordinality as z(val, ord)
),
cheap_abiertas as (
  select jsonb_agg(z.val || '{"ag":0}'::jsonb order by z.ord) as arr
  from base, jsonb_array_elements(base.e->'cheapZonas') with ordinality as z(val, ord)
),
nuevas as (
  select
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(base.e,
      '{lbl}', '"15 Enero"'), '{ds}', '"2027-01-15"'),
      '{zonas}', za.arr), '{cheapZonas}', ca.arr) as e15,
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(base.e,
      '{lbl}', '"16 Enero"'), '{ds}', '"2027-01-16"'),
      '{zonas}', za.arr), '{cheapZonas}', ca.arr) as e16
  from base, zonas_abiertas za, cheap_abiertas ca
)
update esferas_eventos ev
set multifecha = left(f.multifecha, length(f.multifecha) - 1)
                 || ',' || n.e15::text || ',' || n.e16::text || ']'
from ficha f, nuevas n
where ev.slug = 'fuerzaregida'
  -- 🔒 VALOR ESPERADO: el multifecha exacto de 2 fechas pre-tuerca
  and md5(ev.multifecha) = 'ed2b3186df4f9b127a203f8d63fda46a'
  and jsonb_array_length(ev.multifecha::jsonb) = 2;
-- → UPDATE 1 · careo de salida (query FRESCA): fechas 4 · #0 intacta
--   (md5 b31a9fc3ac82590f4f1e0ca50190dde9) · #1 intacta
--   (md5 8e7ea0eed2c4376d0414a041da0e3ae8) · lbl2 «15 Enero» ds 2027-01-15 ·
--   lbl3 «16 Enero» ds 2027-01-16 · z2/c2/z3/c3 = 15 c/u · agotadas 0/0/0/0 ·
--   precios derivados de #0 ✓ · satélites null ✓ · ride abierto ✓

-- ── [2] fechas_extra: el campo que alimenta `f` y `dsList` de la card ──────
-- Sin esto la card seguiría diciendo «11 y 12 ene 2027» y el selector de día
-- solo traería 2 fechas (el compilador deriva f/dsList de
-- [fecha_inicio, ...fechas_extra], línea 1073 de esferas-compile.js).
update esferas_eventos
set fechas_extra = '["2027-01-12","2027-01-15","2027-01-16"]'
where slug = 'fuerzaregida'
  -- 🔒 VALOR ESPERADO: solo traía el 12
  and fechas_extra = '["2027-01-12"]';
-- → UPDATE 1

-- ── VERIFICACIÓN POR EL DUEÑO (compilarEV real + _calcularPrecio, 29-oct) ──
-- 38 aserciones en verde, 0 en rojo (scripts/… corrido contra la ficha REAL
-- post-update + el index del árbol = byte a byte el publicado 16f46f1):
--  · f emitido: «11, 12, 15 y 16 ene 2027» · dsList con las 4 ordenadas
--  · multifecha 4 entradas; #2/#3 con 15+15 zonas TODAS ag:0, precios = #0
--  · #0/#1 emitidas FIELES a la ficha (no se movieron)
--  · global derivada (ESF-UX-2c): abierta ⇔ alguna fecha abierta, 15/15 —
--    las 9 globales ag:1 (agotadas en 11/12) salen abiertas porque 15/16
--    tienen lugar: la tarjeta ya no diría «agotado» donde hay disponible
--  · cotiza por la puerta del cliente: #2 PLUS CanchaVIP $5,900 · #2 CHEAP
--    Balcón $2,200 · #3 PLUS Platino $7,200 · #3 CHEAP Luneta $2,900 — los
--    cuatro con separo $300; Platino en #0 (agotada real) RECHAZA; zona
--    inventada RECHAZA
--
-- ⚠️ DIFFS emitido-vs-publicado AJENOS a esta tuerca, nombrados: Megacable
-- cheap de #0 y Balcón cheap de #1 traen ag:1 en la ficha y no en el index
-- publicado — cambios de Esferas POSTERIORES al último publish (ventas);
-- el próximo publish los lleva, fieles a la ficha.
--
-- 🔒 EL ENCENDIDO ES EL PUBLISH DE MEMO DESDE ESFERAS (la venta no pide push
-- de código — precedente NSQK-VENTA-1): al publicar, el index se recompila y
-- las 4 fechas salen a la venta.
-- ⚠️ LO QUE EL ENCENDIDO NO TRAE: las fechas #2/#3 quedan SIN pedido cargado
-- (ciegas, STOCK-CIEGO) — venden sin candado automático hasta que Memo dicte
-- el pedido de boletos del 15 y 16, como se hizo el 28-oct con 11/12.
