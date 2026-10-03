-- =============================================================================
-- CORR-DOBLE-1 · EL ALTER QUE PERMITE ANULAR UN ABONO DUPLICADO
-- 2-oct-2026 · lo verifica y lo corre JANE · acta de Claude Code
-- =============================================================================
-- Palabra de Memo (2-oct), opción B: el abono duplicado se ANULA poniéndolo en
-- $0 y anexando el motivo a su nota. NUNCA se borra la fila — la historia se
-- conserva: su fecha, su nota original y el monto que tenía quedan escritos.
--
-- 🔴 POR QUÉ HACE FALTA UN ALTER: `abonos_viajero` tiene
--       CHECK ((monto > (0)::numeric))
-- o sea que **$0 también está prohibido**, no solo los negativos. Medido: hay
-- CERO abonos con monto <= 0 en toda la base, así que este CHECK nunca ha
-- rechazado nada real — pero bloquea la corrección que Memo firmó.
--
-- 🔒 SE ABRE AL CERO, NO AL NEGATIVO, Y LA RAZÓN ES EL CLIENTE.
-- `portal-mi-plan-migrado` **LISTA** los abonos en la pantalla del cliente
-- (`abonos: [{monto, fecha}]`) y **NO manda la nota**. Con un contra-asiento
-- negativo, 34 clientes verían una línea «-$2,000» sin una sola palabra que la
-- explique. Con la fila en $0 ven un renglón en cero, que no alarma y que el
-- Portal puede filtrar en su propia tuerca.
-- ⚠️ Y el cero NO es una afirmación falsa aquí: ese abono de verdad no movió
-- dinero — fue un reflejo de la pestaña que el careo contó de más.
--
-- LO QUE SE MIDIÓ ANTES DE PEDIRLO:
--   · 10 lectores de `abonos_viajero` en el árbol. El dueño del dinero
--     (`_lib/cuenta-evento`) suma `monto`, así que un $0 simplemente no suma.
--   · El duplicado NO vive en `abonado_previo`: en **33 de 34** el monto a
--     retirar es EXACTAMENTE la suma de los abonos de esa persona, y en el
--     caso 34 (Demian) es UNA fila identificable de $2,000 del 20-sep. O sea
--     que no hay que inventar una transacción: ya existe la que sobra.
--
-- DESPUÉS DEL ALTER, lo que aplica Claude Code (34 filas, releídas una por una):
--   update abonos_viajero
--      set monto = 0,
--          nota  = coalesce(nota,'') || ' · ANULADO 2-oct-2026: duplicado de
--                  CUADRE-FUENTE-1, este abono de $<X> era reflejo de la
--                  pestaña; el pago completo vive en el libro'
--    where id = '<id de la fila duplicada>';
-- Candado de salida: ninguno de los 34 queda por debajo de su contrato, ninguno
-- queda con cobrado en CERO, y la suma de lo retirado imprime exacta -$71,286.
--
-- ⏸️ Y CINCO QUEDAN FUERA A PROPÓSITO (Allan Abalos, Delmi Yaneth, Roberto
-- Venner, Ernersto Hinojosa, Elvia Guadalupe): en ellos el libro trae MENOS que
-- su propio contrato, así que la premisa de la regla —«el libro lleva los pagos
-- completos»— no se cumple y aplicarla los dejaría DEBIENDO dinero que sí
-- pagaron. Su arreglo es completar Numerología, no tocar la base.

begin;

alter table abonos_viajero
  drop constraint abonos_viajero_monto_check;

alter table abonos_viajero
  add constraint abonos_viajero_monto_check check (monto >= 0);

commit;

-- ── CÓMO SE COMPRUEBA QUE EL CANDADO SIGUE MORDIENDO ────────────────────────
-- 🔒 No basta con que el ALTER corra: hay que ver que el NEGATIVO siga prohibido.
-- Las dos pruebas, y las dos tienen que dar lo que dice el comentario:
--
--   -- (1) el cero AHORA pasa:
--   --     insert ... (viajero_id, monto) values ('<un id real>', 0);  → OK
--   --     (deshacer con rollback; es solo la prueba del candado)
--   -- (2) el negativo SIGUE rechazado:
--   --     insert ... (viajero_id, monto) values ('<un id real>', -1);
--   --     → ERROR 23514 violates check constraint "abonos_viajero_monto_check"
--
-- select pg_get_constraintdef(con.oid)
--   from pg_constraint con join pg_class c on c.oid = con.conrelid
--  where c.relname = 'abonos_viajero' and con.conname = 'abonos_viajero_monto_check';
-- → debe decir: CHECK ((monto >= (0)::numeric))
