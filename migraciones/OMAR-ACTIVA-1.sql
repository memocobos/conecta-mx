-- ════════════════════════════════════════════════════════════════════════════
-- OMAR-ACTIVA-1 · Omar Courtz se prepara para REACTIVAR la venta (30-oct-2026)
-- ════════════════════════════════════════════════════════════════════════════
-- REGISTRO: todo lo de abajo YA CORRIÓ el 30-oct-2026 con valor esperado en
-- cada WHERE (re-correrlo escribe cero filas). Palabra de Memo, citada:
-- «si dale con 1, 2 y 4, no se que paso co reyna luz dejalo en pendientes a
--  investigar quitale su boleto por el momento y el costo es el mismo».
--
-- EL HALLAZGO: el Excel subió el pedido de Beyond Pit del 7-nov de 20 a 27
-- (+7 boletos nuevos) y, al carear nombre por nombre contra las dos pestañas,
-- TRES personas tenían fila en la FECHA EQUIVOCADA (la familia de Corona:
-- CAREO-DUP-FECHA-1 / MUDANZA-CORONA-SABADO-1):
--   · Paolette Adriana Reyes — el Excel trae sus 2 Platino en el 6-nov y 0 en
--     el 7; su fila de omar#1 era un alta por careo del 20-oct (a la fecha que
--     la pestaña traía entonces). SE MUDÓ a omar#0. Quedan sus 2 filas en #0
--     (1+1 = 2 boletos Platino = el Excel). ⚠️ Sus pagos huelen a DOBLE
--     CONTEO: las dos filas traían $8,666 pagados CADA UNA, idéntico — careo
--     contra el libro de Numerología PENDIENTE antes de tocar un peso.
--   · oscar jared martinez diaz — el Excel solo lo trae en el 7-nov (2
--     boletos; su fila de omar#1 liquidada $7,600). Su fila de omar#0
--     (1 boleto, mismo contrato $7,600) era duplicado: boletos 1→0, zona NULL.
--     El dinero de esa fila ($6,600 previo) queda INTACTO pendiente de careo.
--   · Ana Cristina Romero Limón — ídem: el Excel solo la trae en el 7-nov (2
--     boletos; su fila de omar#1 liquidada $7,400). Su fila de omar#0
--     (1 boleto, mismo contrato $7,400): boletos 1→0, zona NULL. Dinero
--     ($6,050) INTACTO pendiente de careo.
--   · Reyna Luz Prado Monterrosas — DESAPARECIÓ de las dos pestañas del
--     Excel. NO es cancelación confirmada: boletos 2→0 y zona NULL POR AHORA
--     (palabra de Memo), con dinero ($2,550) y contrato ($6,800) INTACTOS.
--     ⏳ PENDIENTE INVESTIGAR qué pasó con ella — no se aplicó la regla de
--     saldo-0 porque esa es de cancelados CONFIRMADOS.
--
-- LA COMPRA NUEVA: +7 Beyond Pit omar#1 a $2,327 c/u (palabra de Memo:
-- «el costo es el mismo») = $16,289 más de deuda a Matriz. INSERT ... SELECT
-- de la compra existente (a3dafb11…, 20 × 2327) para no teclear proveedor.
--
-- CAREO DE SALIDA (query fresca, 30-oct): el inventario quedó AL PESO contra
-- el Excel — #0: BeyondPit 0 · Platino 1 · PlatinoB 1 · Perfil 0 · PerfilC 0;
-- #1: BeyondPit 3 · PlatinoB 2 · Platino sin filas. ÚNICO desnivel: Perfil #1
-- KH 1 libre vs Excel 0 (falta 1 venta del Excel por capturar en KH, o un
-- vendidos_fuera de más) — la zona está agotada en la ficha, no muerde.
--
-- ⚠️ DOS HALLAZGOS NOMBRADOS SIN TOCAR:
-- (a) El careo por evento de omar#1 propone el alta «Anahí Álvarez Báez» —
--     ES DUPLICADO de «Álvarez Báez Anahí» (migrada 30-ago, Platino B #1):
--     el nombre está INVERTIDO (apellidos primero) y el dedup del careo casa
--     por nombre normalizado completo, así que no la ve. NO APLICARLA.
-- (b) Los 3 abonos que el careo trae pendientes NO se aplicaron aquí (no
--     estaban en el encargo): Rosie Rios $775 (#0) · Esmeralda Elizabeth
--     Maldonado $1,100 (#1) · Miroslava Dalith Galván $2,050 (#1) — se
--     capturan por careo/➕ Abono por Bulma/Milk.
--
-- EL ENCENDIDO ES DE MEMO, EN ESFERAS (tras esto):
--   1. omar: quitar st 'agotado' (el evento vuelve a la vitrina).
--   2. 6-nov: REABRIR Platino (1 lugar) — y Platino B si quiere (1 lugar).
--      ⚠️ Perfil C del 6-nov está ABIERTA en la ficha con restan 0 (las
--      ganadoras de la promo de Yami): hay que AGOTARLA antes del publish,
--      PLUS y CHEAP — si se reactiva el evento sin cerrarla, vende lo que
--      no hay.
--   3. 7-nov: REABRIR Beyond Pit (3 lugares). Platino B ya está abierta.
--   4. Publish. Con el pedido cargado y ag_activa=true, el Palacio gobierna:
--      chips de «últimos» salen solos (≤5) y cierra al llegar a 0.
-- ════════════════════════════════════════════════════════════════════════════

-- 1 · Paolette: omar#1 → omar#0 (dinero intacto; abonos llavean por viajero_id)
update viajeros_evento set evento_id='omar#0',
  notas = coalesce(notas,'') || ' · [OMAR-ACTIVA-1 30-oct-2026] mudada de omar#1 a omar#0: el Excel trae sus 2 Platino en el 6-nov y 0 en el 7 (el alta por careo del 20-oct fue a la fecha que la pestaña traía entonces). Dinero intacto; careo de sus pagos vs libro pendiente.'
where id='2912255a-f8fa-4052-bd5b-327e85bffe16' and evento_id='omar#1' and zona_boleto='Platino' and boletos=1;

-- 2a · oscar jared: duplicado del 6-nov, boleto retirado (dinero intacto)
update viajeros_evento set boletos=0, zona_boleto=null,
  notas = coalesce(notas,'') || ' · [OMAR-ACTIVA-1 30-oct-2026] boleto retirado: duplicado entre fechas — el Excel solo lo trae en el 7-nov (2 boletos, su fila de omar#1 liquidada $7,600). El dinero de ESTA fila ($6,600 previo) queda intacto pendiente de careo contra el libro.'
where id='cfa7b6df-4cc7-4326-a473-46b8c18ff752' and evento_id='omar#0' and zona_boleto='Beyond Pit' and boletos=1;

-- 2b · Ana Cristina: duplicado del 6-nov, boleto retirado (dinero intacto)
update viajeros_evento set boletos=0, zona_boleto=null,
  notas = coalesce(notas,'') || ' · [OMAR-ACTIVA-1 30-oct-2026] boleto retirado: duplicado entre fechas — el Excel solo la trae en el 7-nov (2 boletos, su fila de omar#1 liquidada $7,400). El dinero de ESTA fila ($6,050) queda intacto pendiente de careo contra el libro.'
where id='d5addc5e-c333-44b8-acbd-8adc04b2fd47' and evento_id='omar#0' and zona_boleto='Platino B' and boletos=1;

-- 3 · Reyna Luz: boletos retirados POR AHORA — pendiente investigar
update viajeros_evento set boletos=0, zona_boleto=null,
  notas = coalesce(notas,'') || ' · [OMAR-ACTIVA-1 30-oct-2026] boletos retirados POR AHORA (palabra de Memo): desapareció de las pestañas del Excel en las dos fechas — PENDIENTE INVESTIGAR qué pasó con ella. Dinero ($2,550) y contrato ($6,800) intactos hasta saberlo.'
where id='543c6f21-3b05-477c-8206-56dd86e25ef8' and evento_id='omar#0' and zona_boleto='Beyond Pit' and boletos=2;

-- 4 · La compra: +7 Beyond Pit omar#1, mismo costo y proveedor que la de 20
insert into compras (evento_id, zona, cantidad, costo_unitario, proveedor_id, nota)
select evento_id, zona, 7, costo_unitario, proveedor_id,
  '[OMAR-ACTIVA-1 30-oct-2026] +7 boletos nuevos: el Excel subió el pedido de 20 a 27 (palabra de Memo: mismo costo que los 20 originales).'
from compras where id='a3dafb11-b7e9-4cbb-9506-66ee26df7137' and cantidad=20 and costo_unitario=2327;
