-- ═══════════════════════════════════════════════════════════════════════════
-- VUELO-1 · El costo del vuelo de cada viajero (5-nov-2026)
-- Palabra de Memo (pedido de Bulma y Milk), citada: «poder ingresar el costo de
-- los vuelos y que esa info se sume junto con su paquete, se divida en las
-- fechas de pago, modifique lo que ven en portal». Sus cinco respuestas:
--   1 · UN solo total (sin desglose al cliente)
--   2 · el vuelo se reparte entre las cuotas que FALTAN
--   3 · siempre uno por uno
--   4 · precargado de la Nube voladora (editable o a mano) + se guardan TODOS los
--       datos (aerolínea, horarios, clave de reservación)
--   5 · se le avisa al cliente de todo (correo cada vez)
--
-- La columna `vuelo` guarda la FICHA del vuelo; el costo VIVE además dentro de
-- `total_contrato` (un solo total). Al guardar, el servidor mueve el total por
-- la DIFERENCIA contra el costo anterior, y el trigger de PLAN-FIJO-1
-- (`viajeros_plan_pagos_resplit`) re-reparte las cuotas que aún no empiezan —
-- las que ya empezaron conservan su monto.
--   forma: { costo, aerolinea, salida, regreso, clave, notas, origen, por, at }
--
-- Tabla existente: no lleva GRANT nuevo (la regla del 30-oct es para tablas
-- nuevas). CORRIDA: 5-nov-2026 vía MCP.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.viajeros_evento add column if not exists vuelo jsonb;

alter table public.viajeros_evento drop constraint if exists viajeros_evento_vuelo_forma;
alter table public.viajeros_evento add constraint viajeros_evento_vuelo_forma check (
  vuelo is null or (
    jsonb_typeof(vuelo) = 'object'
    and jsonb_typeof(vuelo->'costo') = 'number'
    and (vuelo->>'costo')::numeric >= 0
  )
);
