-- ═══════════════════════════════════════════════════════════════════════════
-- YAJIROBE-1 · Un rol nuevo en el Palacio (6-nov-2026)
-- Palabra de Memo, citada: «un perfil similar a bulma o milk pero para un
-- personaje llamado Yajirobe, para que se dedique a ayudar a milk a ingresar
-- viajeros, revisar capsule corps más que nada y requisiciones en su mayoría».
-- Sus respuestas: aprueba y rechaza requisiciones (como Milk) · en Capsule
-- registra abonos, corrige el viaje, cancela lugares y elimina viajeros.
-- SIN gastos, ingresos, saldos, resumen, inventario, reportes ni números.
--
-- Solo se abre el CHECK de `usuarios.rol`. Tabla existente: sin GRANT nuevo.
-- CORRIDA: 6-nov-2026 vía MCP.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check check (
  rol = any (array['maestro_roshi','bulma','mister_popo','coordinador','cc','milk','yajirobe']::text[])
);
