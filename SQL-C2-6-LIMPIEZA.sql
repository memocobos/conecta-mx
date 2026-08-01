-- ═══════════════════════════════════════════════════════════════════════════
-- C2-6 · LIMPIEZA DE DATOS DE PRUEBA — proyecto PORTAL (muvvrstnkxsxfpkhbntq)
-- Reportado por Claude Code · lo revisa y lo corre Cowork · 29-jul-2026
--
-- QUÉ SE BORRA: solo las 8 solicitudes de prueba de C2/ST y todo lo que
-- colgaron — incluido el DINERO que el sello de Natanael metió al Palacio.
-- QUÉ NO SE TOCA: el cliente #1026 (es Memo, es real), ni ninguna fila que no
-- cuelgue de esas 8 solicitudes.
--
-- CANDADOS: cada paso declara cuántas filas espera. Si el conteo no cuadra,
-- el bloque LANZA EXCEPCIÓN y la transacción entera se deshace: no se borra
-- nada a medias. Cero barridos por tabla completa. Cero on_conflict.
--
-- ORDEN: hijos → padres, según las FK reales del esquema.
--
-- ESTADO: PASO 1 CORRIDO Y VERIFICADO por Cowork el 29-jul-2026 (COMMIT limpio;
-- Resumen del Palacio de vuelta a $0 caja / $0 BBVA / $0 por cobrar / 0 viajeros).
-- PASO 2 (fixture de Rosalía) TAMBIÉN CORRIDO el 29-jul: el candado pasó en
-- silencio y el Portal quedó VIRGEN (0 solicitudes / 0 sesiones / 0 webhooks).
-- El orden de 1.7/1.8 lleva la corrección que Cowork aplicó al ejecutar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- PASO 0 · FOTO ANTES (correr solo, leer, comparar con lo esperado)
-- ───────────────────────────────────────────────────────────────────────────
WITH test AS (SELECT unnest(ARRAY[
  '870d977c-98d6-4fc8-8930-c28d8e8777d6',  -- Natanael · Zona Tumbada
  'e2805593-d0d7-4ecc-9ace-b99b002ab57d',  -- Natanael · Jardín Derecho
  '0ecbeec0-6df8-4fdc-86e9-544989eebdc8',  -- Natanael · Jardín Izq (caso 1, débito)
  '4abfaf00-ea7f-47a1-9489-dc3080aa3f45',  -- Bad Gyal · OXXO abandonado
  '4c1c05b7-f0de-4373-b274-3ef283c4715b',  -- Festival Arre · crédito abandonado
  '0f6c7133-a8b2-4621-828a-c17fe895fe39',  -- Melanie · caso 11 (rechazo)
  '2245a9ac-4c6c-4a1f-9a88-f50caee7078a',  -- Natanael · caso 2 OXXO, ACEPTADA
  '7bfc589b-bb6b-4daa-a2fd-b30c8bd7b04c'   -- Rosalía · fixture (SE BORRA APARTE)
]::uuid[]) AS id)
SELECT 'solicitudes_tour'         t, count(*) n FROM solicitudes_tour       WHERE id          IN (SELECT id FROM test)
UNION ALL SELECT 'pagos',              count(*) FROM pagos                  WHERE solicitud_id IN (SELECT id FROM test)
UNION ALL SELECT 'pagos_auditoria',    count(*) FROM pagos_auditoria        WHERE solicitud_id IN (SELECT id FROM test)
UNION ALL SELECT 'contratos_viajeros', count(*) FROM contratos_viajeros     WHERE solicitud_id IN (SELECT id FROM test)
UNION ALL SELECT 'lugares',            count(*) FROM lugares                WHERE solicitud_id IN (SELECT id FROM test)
UNION ALL SELECT 'habitaciones_grupo', count(*) FROM habitaciones_grupo     WHERE solicitud_id IN (SELECT id FROM test)
UNION ALL SELECT 'stripe_sesiones',    count(*) FROM stripe_checkout_sesiones WHERE solicitud_id IN (SELECT id FROM test)
UNION ALL SELECT 'stripe_webhooks',    count(*) FROM stripe_webhook_eventos WHERE solicitud_id IN (SELECT id FROM test)
UNION ALL SELECT 'avisos_cobranza',    count(*) FROM avisos_cobranza
   WHERE pago_id IN (SELECT id FROM pagos WHERE solicitud_id IN (SELECT id FROM test))
-- HUÉRFANAS: filas de Stripe sin solicitud (no debería haber; si hay, se revisan
-- A MANO antes de correr nada — una sesión sin dueño puede no ser de prueba).
UNION ALL SELECT '⚠ sesiones SIN solicitud', count(*) FROM stripe_checkout_sesiones WHERE solicitud_id IS NULL
UNION ALL SELECT '⚠ webhooks SIN solicitud', count(*) FROM stripe_webhook_eventos  WHERE solicitud_id IS NULL;

-- Y el dinero que hay que ver volver a cero:
SELECT numero, monto, estado, metodo, pagado_en
  FROM pagos WHERE solicitud_id = '2245a9ac-4c6c-4a1f-9a88-f50caee7078a' ORDER BY numero;


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 1 · LAS 7 DE PRUEBA (todo menos el fixture de Rosalía)
--          Una sola transacción. Si un conteo no cuadra, no se borra NADA.
-- ───────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _c26_test (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _c26_test (id) VALUES
  ('870d977c-98d6-4fc8-8930-c28d8e8777d6'),
  ('e2805593-d0d7-4ecc-9ace-b99b002ab57d'),
  ('0ecbeec0-6df8-4fdc-86e9-544989eebdc8'),
  ('4abfaf00-ea7f-47a1-9489-dc3080aa3f45'),
  ('4c1c05b7-f0de-4373-b274-3ef283c4715b'),
  ('0f6c7133-a8b2-4621-828a-c17fe895fe39'),
  ('2245a9ac-4c6c-4a1f-9a88-f50caee7078a');

-- CANDADO A · las 7 existen y TODAS son del cliente de prueba.
-- Si una no existe, o si alguna cuelga de OTRO cliente, se aborta: significa
-- que la lista de IDs ya no describe la realidad.
DO $$
DECLARE n int; ajenas int; cli uuid;
BEGIN
  SELECT count(*) INTO n FROM solicitudes_tour WHERE id IN (SELECT id FROM _c26_test);
  IF n <> 7 THEN RAISE EXCEPTION 'CANDADO A: esperaba 7 solicitudes, encontré %', n; END IF;

  SELECT id INTO cli FROM clientes WHERE correo ILIKE '%hcgcobos%' LIMIT 1;
  IF cli IS NULL THEN RAISE EXCEPTION 'CANDADO A: no encontré al cliente de prueba'; END IF;

  SELECT count(*) INTO ajenas FROM solicitudes_tour
   WHERE id IN (SELECT id FROM _c26_test) AND cliente_id <> cli;
  IF ajenas > 0 THEN RAISE EXCEPTION 'CANDADO A: % solicitudes NO son del cliente de prueba', ajenas; END IF;
END $$;

-- CANDADO B · el dinero es EXACTAMENTE el que reportó Cowork: 4 cuotas del
-- plan de Natanael, una sola pagada, de $300 (no $312) y por la vía de Stripe.
-- Si el monto o el método cambiaron, algo pasó desde el corte: se aborta.
DO $$
DECLARE cuotas int; pagadas int; suma numeric; met text;
BEGIN
  SELECT count(*) INTO cuotas FROM pagos WHERE solicitud_id IN (SELECT id FROM _c26_test);
  IF cuotas <> 4 THEN RAISE EXCEPTION 'CANDADO B: esperaba 4 cuotas, encontré %', cuotas; END IF;

  SELECT count(*), coalesce(sum(monto),0), max(metodo) INTO pagadas, suma, met
    FROM pagos WHERE solicitud_id IN (SELECT id FROM _c26_test) AND estado = 'pagado';
  IF pagadas <> 1 THEN RAISE EXCEPTION 'CANDADO B: esperaba 1 cuota pagada, encontré %', pagadas; END IF;
  IF suma <> 300 THEN RAISE EXCEPTION 'CANDADO B: esperaba $300 pagados, encontré %', suma; END IF;
  IF met IS DISTINCT FROM 'stripe_oxxo' THEN RAISE EXCEPTION 'CANDADO B: método inesperado %', met; END IF;
END $$;

-- 1.1 · la bitácora del dinero (cuelga de pagos)          esperado: 1
DELETE FROM pagos_auditoria WHERE solicitud_id IN (SELECT id FROM _c26_test);

-- 1.2 · avisos de cobranza que apunten a esas cuotas       esperado: 0
--       (pago_id es uuid libre SIN FK: hay que borrarlo a mano o queda basura)
DELETE FROM avisos_cobranza
 WHERE pago_id IN (SELECT id FROM pagos WHERE solicitud_id IN (SELECT id FROM _c26_test));

-- 1.3 · rastro de Stripe                        esperado: ~5 webhooks, ~6 sesiones
DELETE FROM stripe_webhook_eventos    WHERE solicitud_id IN (SELECT id FROM _c26_test);
DELETE FROM stripe_checkout_sesiones  WHERE solicitud_id IN (SELECT id FROM _c26_test);

-- 1.4 · el contrato que encadenó el sello                   esperado: 1 contrato
DELETE FROM contratos_viajeros WHERE solicitud_id IN (SELECT id FROM _c26_test);

-- 1.5 · soltar el candado de C2-3 ANTES de borrar las cuotas.
--       solicitudes_tour.separo_aplicado_pago_id apunta a pagos: si no se
--       suelta primero, el DELETE de abajo choca contra la FK.
UPDATE solicitudes_tour SET separo_aplicado_pago_id = NULL
 WHERE id IN (SELECT id FROM _c26_test) AND separo_aplicado_pago_id IS NOT NULL;

-- 1.6 · EL DINERO. Esto es lo que devuelve la caja del Resumen a ceros: los
--       $300 en BBVA y los $3,500 por cobrar salen de estas 4 filas.
DELETE FROM pagos WHERE solicitud_id IN (SELECT id FROM _c26_test);

-- ⚠ CORREGIDO POR COWORK AL CORRER (29-jul). Este orden NO es de adorno: son
--   dos FK NO ACTION que el borrado tiene que respetar hacia arriba.
--     · pagos.lugar_id → lugares            (las 4 cuotas TENÍAN lugar_id)
--     · lugares.habitacion_grupo_id → habitaciones_grupo
--   Mi versión original borraba lugares y habitaciones ANTES que pagos: habría
--   abortado en seco (con ROLLBACK, sin daño, pero sin correr). Lo de arriba es
--   lo que de verdad se ejecutó — el archivo no debe contar otra historia.
--   habitaciones_grupo dio 0 filas hoy; el orden se deja escrito para el día
--   que no dé 0.
-- 1.7 · lugares (después de pagos)                                 esperado: 1
DELETE FROM lugares WHERE solicitud_id IN (SELECT id FROM _c26_test);

-- 1.8 · habitaciones (después de lugares)                          esperado: 0
DELETE FROM habitaciones_grupo WHERE solicitud_id IN (SELECT id FROM _c26_test);

-- 1.9 · y por fin las solicitudes                                  esperado: 7
DELETE FROM solicitudes_tour WHERE id IN (SELECT id FROM _c26_test);

-- CANDADO C · nada quedó colgando. Si algo sobrevive, se deshace todo.
DO $$
DECLARE resto int;
BEGIN
  SELECT
    (SELECT count(*) FROM solicitudes_tour       WHERE id           IN (SELECT id FROM _c26_test))
  + (SELECT count(*) FROM pagos                  WHERE solicitud_id IN (SELECT id FROM _c26_test))
  + (SELECT count(*) FROM pagos_auditoria        WHERE solicitud_id IN (SELECT id FROM _c26_test))
  + (SELECT count(*) FROM contratos_viajeros     WHERE solicitud_id IN (SELECT id FROM _c26_test))
  + (SELECT count(*) FROM lugares                WHERE solicitud_id IN (SELECT id FROM _c26_test))
  + (SELECT count(*) FROM habitaciones_grupo     WHERE solicitud_id IN (SELECT id FROM _c26_test))
  + (SELECT count(*) FROM stripe_checkout_sesiones WHERE solicitud_id IN (SELECT id FROM _c26_test))
  + (SELECT count(*) FROM stripe_webhook_eventos WHERE solicitud_id IN (SELECT id FROM _c26_test))
  INTO resto;
  IF resto <> 0 THEN RAISE EXCEPTION 'CANDADO C: quedaron % filas colgando', resto; END IF;
END $$;

COMMIT;
-- Si algo falló: ROLLBACK; y a revisar. La base queda como estaba.


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 2 · EL FIXTURE DE ROSALÍA — al final, en su propio paso.
--          Correr SOLO cuando Memo confirme que ya no lo necesita.
--          (Rosalía quedó pagada-SIN-aceptar: no tiene plan ni contrato.)
-- ───────────────────────────────────────────────────────────────────────────
BEGIN;

DO $$
DECLARE n int; cuotas int;
BEGIN
  SELECT count(*) INTO n FROM solicitudes_tour WHERE id = '7bfc589b-bb6b-4daa-a2fd-b30c8bd7b04c';
  IF n <> 1 THEN RAISE EXCEPTION 'CANDADO ROSALÍA: esperaba 1 solicitud, encontré %', n; END IF;
  -- Si le nació un plan, es que alguien la aceptó: ya no es el fixture que creo
  -- que es, y hay que mirarla antes de borrar dinero.
  SELECT count(*) INTO cuotas FROM pagos WHERE solicitud_id = '7bfc589b-bb6b-4daa-a2fd-b30c8bd7b04c';
  IF cuotas <> 0 THEN RAISE EXCEPTION 'CANDADO ROSALÍA: tiene % cuotas — fue aceptada, revisar a mano', cuotas; END IF;
END $$;

DELETE FROM stripe_webhook_eventos   WHERE solicitud_id = '7bfc589b-bb6b-4daa-a2fd-b30c8bd7b04c';
DELETE FROM stripe_checkout_sesiones WHERE solicitud_id = '7bfc589b-bb6b-4daa-a2fd-b30c8bd7b04c';
DELETE FROM contratos_viajeros       WHERE solicitud_id = '7bfc589b-bb6b-4daa-a2fd-b30c8bd7b04c';
-- mismo orden que el paso 1: lugares ANTES que habitaciones, y las dos después
-- de pagos (aquí no hay pagos: el candado de arriba exige 0 cuotas).
DELETE FROM lugares                  WHERE solicitud_id = '7bfc589b-bb6b-4daa-a2fd-b30c8bd7b04c';
DELETE FROM habitaciones_grupo       WHERE solicitud_id = '7bfc589b-bb6b-4daa-a2fd-b30c8bd7b04c';
DELETE FROM solicitudes_tour         WHERE id           = '7bfc589b-bb6b-4daa-a2fd-b30c8bd7b04c';

COMMIT;


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 3 · VERIFICACIÓN — todo en CERO, y la caja de vuelta a ceros.
-- ───────────────────────────────────────────────────────────────────────────
SELECT 'solicitudes del cliente de prueba' t, count(*) n FROM solicitudes_tour
  WHERE cliente_id IN (SELECT id FROM clientes WHERE correo ILIKE '%hcgcobos%')
UNION ALL SELECT 'sesiones Stripe (toda la tabla)',  count(*) FROM stripe_checkout_sesiones
UNION ALL SELECT 'eventos webhook (toda la tabla)',  count(*) FROM stripe_webhook_eventos
UNION ALL SELECT 'pagos del cliente de prueba',      count(*) FROM pagos
  WHERE cliente_id IN (SELECT id FROM clientes WHERE correo ILIKE '%hcgcobos%')
UNION ALL SELECT 'bitácora (toda la tabla)',         count(*) FROM pagos_auditoria
UNION ALL SELECT 'contratos viajeros (toda)',        count(*) FROM contratos_viajeros;
-- Las 6 deben dar 0. Si alguna no da 0, NO es error de este script: hay datos
-- que no venían del corte de Cowork y hay que mirarlos antes de tocar nada.

-- Y a ojo, en el Palacio: el Resumen debe volver a $0 en caja/BBVA y $0 por
-- cobrar. Ese es el verdadero "quedó limpio" — la tabla en cero es el medio.
