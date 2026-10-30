-- ════════════════════════════════════════════════════════════════════════════
-- GENERO-1 · El género del viajero entra como DATO (30-oct-2026)
-- ════════════════════════════════════════════════════════════════════════════
-- REGISTRO: YA CORRIÓ el 30-oct-2026. Nace para ROOMING-AUTO-1 (regla firmada
-- por Memo 30-oct: «siempre separar por género las Compartidas — hombres con
-- hombres, mujeres con mujeres; excepción: parejas hombre-mujer que se sepa
-- que van juntos pero que no pagaron doble»).
--
-- 🔒 La columna nace VACÍA (0 de 2,860 filas) y así se queda hasta que un
-- HUMANO la llene: el armador del rooming SUGIERE género por nombre (rotulado
-- «sugerido») y solo se guarda lo que Bulma/Milk confirman en los chips, por
-- `genero_guardar` (admin-rooming) o el ✏️ Corregir (viajero_editar_full).
-- Una inferencia jamás decide — palabra de Memo, citada en el acta de
-- CAPSULE-UX-2.
--
-- No es tabla nueva: la regla del GRANT (30-oct) no aplica — viajeros_evento
-- ya tiene los permisos de siempre.
--
-- CANDADO MORDIDO al correr: UPDATE con genero='X' rebotó con 23514 ✓.

alter table viajeros_evento
  add column if not exists genero text
  constraint viajeros_evento_genero_check check (genero in ('H','M'));
