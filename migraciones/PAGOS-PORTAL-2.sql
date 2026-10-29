-- =============================================================================
-- PAGOS-PORTAL-2 (29-oct-2026) — el cliente sube su COMPROBANTE desde el Portal
-- Base: KAMEHOUSE (npgnhsmwpcipxgvfxrho) · corrida vía MCP el 29-oct-2026
-- =============================================================================
-- Palabra de Memo («Sí, constrúyela»): Fase 2 del plan de pagos — el cliente
-- sube el comprobante desde la card de su viaje, cae a la bandeja de KameHouse
-- y Bulma/Milk CAPTURAN el abono tecleando el monto con el comprobante
-- enfrente. 🔒 NADA automático decide dinero (el rumbo del 12-oct): la
-- solicitud es un AVISO con foto, jamás un abono.
--
-- La solicitud viaja por `cambios_viajero` (el buzón que PORTAL-EDIT-1 ya
-- construyó, con su bandeja, su tope de pendientes y su cierre con valor
-- esperado) — un canal nuevo serían dos buzones que todavía no divergen.
-- Entra: el tipo 'pago' al CHECK + la columna `foto_path` (el comprobante,
-- en el bucket PRIVADO `abonos-viajeros` bajo `portal/`).
-- =============================================================================

-- 1 · El tipo nuevo. El CHECK se RE-CREA (no se puede editar en sitio).
alter table public.cambios_viajero drop constraint cambios_viajero_tipo_check;
alter table public.cambios_viajero add constraint cambios_viajero_tipo_check
  check (tipo = any (array['hotel'::text, 'zona'::text, 'fecha'::text, 'otro'::text, 'paquete'::text, 'pago'::text]));

-- 2 · El comprobante. Path dentro del bucket privado `abonos-viajeros`
-- (prefijo portal/<viajero_id>/) — el MISMO bucket de los abonos, a propósito:
-- al capturar, el abono HEREDA este path (la forma del aprobar de REQ-B1) y el
-- 📎 de la lista de viajeros lo abre sin copiar nada.
alter table public.cambios_viajero add column foto_path text;

-- 3 · Un «pago» SIN comprobante no existe: la foto es el punto entero de la
-- solicitud (sin ella, Bulma no tiene nada que verificar). 🔒 Con `is not null`
-- explícito — la lección del CHECK de PREVENTA-PORTAL-1: NULL en un IN/OR da
-- NULL y el CHECK pasa.
alter table public.cambios_viajero add constraint cambios_viajero_pago_foto
  check (tipo <> 'pago' or foto_path is not null);

-- =============================================================================
-- CANDADOS (corridos el 29-oct-2026, los tres MORDIDOS con error visible):
-- 1. insert tipo 'pago' SIN foto_path → rebota 23514 (cambios_viajero_pago_foto) ✓
-- 2. insert tipo inventado 'regalo' → rebota 23514 (tipo_check re-creado) ✓
-- 3. insert tipo 'pago' CON foto_path (viajero REAL) → entra ✓ y se borró
--    con query FRESCA — cero basura (verificado: 0 pagos vivos, 5 filas).
-- Las filas existentes NO se tocaron (foto_path nace NULL para todas: ninguna
-- es tipo 'pago', así que el CHECK nuevo no las muerde).
--
-- ⚠️ DOS HALLAZGOS del candado, dichos para el que siga:
-- · `cambios_viajero.viajero_id` TIENE FK a viajeros_evento (23503 con un uuid
--   inventado) — el candado 3 se corrió con un viajero real.
-- · El DELETE en la MISMA sentencia que el INSERT (CTE modificante) NO ve la
--   fila recién nacida — la fila quedó viva y se barrió con una query aparte.
--   Es la ley del snapshot de PAGOS-MATRIZ-3b, en su cara de DELETE.
-- =============================================================================
