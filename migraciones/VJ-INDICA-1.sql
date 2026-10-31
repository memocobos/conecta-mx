-- VJ-INDICA-1 (30-oct-2026) — Indicaciones por viajero (palabra de Memo:
-- «poder poner datos o notas a los clientes si tiene habitaciones especiales
-- o algo en específico»). Campo PROPIO, distinto de `notas` (que guarda la
-- procedencia/migración y el rastro de ediciones, y no se pisa).
-- Lo escriben Bulma/Milk con ✏️ Corregir; lo ven la lista de viajeros, el
-- rooming y la Torre de la coordinadora.
-- REGISTRO: YA CORRIÓ (30-oct). CHECK mordido con 23514 (501 caracteres).
alter table public.viajeros_evento add column if not exists indicaciones text;
alter table public.viajeros_evento drop constraint if exists viajeros_evento_indicaciones_largo;
alter table public.viajeros_evento add constraint viajeros_evento_indicaciones_largo
  check (indicaciones is null or char_length(indicaciones) <= 500);
-- Sin GRANT nuevo: es una columna de una tabla que ya existía.
