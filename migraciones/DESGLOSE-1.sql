-- =============================================================================
-- DESGLOSE-1 (13-oct-2026) · Cuánto pagó cada quien.
-- Palabra de Memo: «cuando Karina mande el pago … aparezca la opción de
-- desglose y poder desglosar cada uno y así Bulma revisa; si hay error regresa
-- o habla por WhatsApp, ajusta y queda».
--   · `desglose`: arreglo de N montos en pesos (titular primero, luego los
--     acompañantes en orden). Lo DECLARA el cliente; es informativo hasta que
--     Bulma/Milk lo confirman (o corrigen) al aprobar — ahí sí se vuelve un
--     abono por persona. NULL = requisición vieja o de 1 persona.
-- =============================================================================
alter table public.requisiciones add column if not exists desglose jsonb
  check (desglose is null or jsonb_typeof(desglose) = 'array');
