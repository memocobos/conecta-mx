-- =============================================================================
-- FR-VENTA-1 (30-oct-2026) · FUERZA REGIDA 15/16-ENE SALEN A LA VENTA
-- Palabra de Memo, citada: «carga el pedido de 15 y 16 agota las zonas que no
-- mencione y salgamos a venta — 15 de enero: 30 oro, 10 cancha vip, 4 butaca,
-- 4 Luneta · 16 de enero: 30 Oro, 10 Cancha Vip, 8 butaca · todo lo demas
-- agotado en esas fechas y salgamos a venta».
--
-- ⚠️ ESTA ACTA ES REGISTRO: los dos bloques YA CORRIERON el 30-oct-2026 contra
-- la base viva de KH (npgnhsmwpcipxgvfxrho). Re-correrla escribe CERO filas:
-- el UPDATE lleva el md5 PRE-tuerca como valor esperado (ya no casa) y el
-- INSERT lleva NOT EXISTS sobre fuerzaregida#2/#3 (ya existen).
--
-- Lo que esto SUPERA: el «15/16 en PRÓXIMAMENTE» de FR-PROX-1 (29-oct) muere
-- por palabra nueva de Memo — las dos fechas pasan de prox a VENDIENDO con
-- las zonas del pedido abiertas y el resto agotado a mano.
-- =============================================================================

-- ── BLOQUE 1 · LA FICHA: #2 (15-ene) y #3 (16-ene) sin prox, abiertas SOLO
--    las del pedido, el resto ag:1 — en zonas Y cheapZonas de cada fecha. ──
-- Forma: por cada fecha, zona abierta = (z - 'ag' - 'prox'); zona agotada =
-- ((z - 'prox') || '{"ag":1}'); la ENTRADA pierde su prox = (f - 'prox').
-- Candado: md5(multifecha) = '8e4238da0ea84179f83a4e80f37524ff' (el estado que
-- dejó FR-PROX-1) AND jsonb_array_length = 4. Corrió: 1 fila.
-- RETURNING md5 nuevo: '215174cfe1dbdae5f904b30bbc27040a'.
--
-- Abiertas del 15-ene (#2): Oro · Cancha VIP · Butaca · Luneta  (4)
-- Abiertas del 16-ene (#3): Oro · Cancha VIP · Butaca           (3)
-- Agotadas a mano: las otras 11/12 zonas de cada lista (15 por lista).
--
-- (El UPDATE completo vivió en la sesión; no se re-transcribe aquí para no
--  dejar un SQL re-corrible sobre un candado que ya no casa. El estado final
--  se re-carea con la query de abajo.)

-- ── BLOQUE 2 · EL PEDIDO: 7 compras nuevas, proveedor MATRIZ, costo $0 ──
-- insert into compras (evento_id, zona, cantidad, costo_unitario, proveedor_id, nota)
-- select * from (values
--   ('fuerzaregida#2','Oro',       30, 0, 'c66b6e63-f035-4dc8-a096-c3dfbb650e9b'::uuid, '<nota FR-VENTA-1>'),
--   ('fuerzaregida#2','Cancha VIP',10, 0, ..., ...),
--   ('fuerzaregida#2','Butaca',     4, 0, ..., ...),
--   ('fuerzaregida#2','Luneta',     4, 0, ..., ...),
--   ('fuerzaregida#3','Oro',       30, 0, ..., ...),
--   ('fuerzaregida#3','Cancha VIP',10, 0, ..., ...),
--   ('fuerzaregida#3','Butaca',     8, 0, ..., ...)
-- ) v
-- where not exists (select 1 from compras where evento_id in ('fuerzaregida#2','fuerzaregida#3'));
-- Corrió: RETURNING 7 filas. Nota por fila: «FR-VENTA-1 30-oct-2026 · pedido
-- dictado por Memo (15/16-ene). COSTO PENDIENTE: costo_unitario=0 a propósito
-- (MER-1: sin costo queda fuera del promedio y de la inversión — no se inventa
-- un número); al confirmar Memo se escribe con WHERE costo_unitario=0.
-- Proveedor Matriz (palabra 28-oct).»
-- 🔒 costo $0 = MER-1: fuera de inversión y promedio; la deuda a Matriz NO
-- sube hasta que Memo confirme el costo (patrón STOCK-CIEGO-1b).

-- ── CAREO DE SALIDA (query fresca — correr para re-verificar) ──
-- 1) La ficha:
select md5(multifecha) = '215174cfe1dbdae5f904b30bbc27040a' as ficha_ok
from esferas_eventos where slug = 'fuerzaregida';
-- 2) Simetría pedido↔ficha (toda zona abierta de #2/#3 tiene pedido y viceversa):
with abiertas as (
  select 'fuerzaregida#'||(ord-1) as evento_id, z->>'n' as zona
  from esferas_eventos ev,
  lateral jsonb_array_elements(ev.multifecha::jsonb) with ordinality f(val, ord),
  lateral jsonb_array_elements(f.val->'zonas') z
  where ev.slug='fuerzaregida' and ord in (3,4)
    and coalesce((z->>'ag')::int,0)=0 and coalesce((z->>'prox')::int,0)=0
), pedido as (
  select evento_id, zona, cantidad from compras
  where evento_id in ('fuerzaregida#2','fuerzaregida#3')
)
select coalesce(a.evento_id,p.evento_id) ev, coalesce(a.zona,p.zona) zona,
       p.cantidad, (a.zona is not null and p.zona is not null) as simetria_ok
from abiertas a full outer join pedido p using (evento_id, zona)
order by 1, 2;
-- Esperado: 7 renglones, todos simetria_ok = true, cantidades 30·10·4·4 / 30·10·8.
