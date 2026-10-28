-- ════════════════════════════════════════════════════════════════════════════
-- RECHAZO-AVISO-1 · 28-oct-2026 · base KH (npgnhsmwpcipxgvfxrho)
--
-- Palabra de Memo: «si dale al correo primero que nada y que tengan esa info ya
-- establecida para futuros rechazos en todos los eventos, eso es urgente».
--
-- QUÉ MOTIVÓ ESTO, medido antes de escribir una línea:
--   La acción `rechazar` de admin-requisiciones SOLO hacía un PATCH. Cero
--   correos. El motivo que escribía Bulma se guardaba y no lo leía nadie más.
--   Y de las 12 rechazadas, CUATRO traían comprobante — gente que YA transfirió
--   (separos de $300 a $1,000), rechazada el 27 y 28 de octubre, sin un aviso.
--
-- TRES COLUMNAS. Ninguna toca dinero.
--   motivo_clave     cuál de los motivos del catálogo eligió quien rechazó.
--                    El TEXTO que leyó el cliente sigue viviendo en
--                    `motivo_rechazo` (editable a mano — palabra de Memo), así
--                    que la clave es para CONTAR, no para re-render: «12
--                    rechazos por zona agotada este mes» es justo la señal de
--                    qué pedido hay que cargar en Kamisama.
--   aviso_at         cuándo le salió el correo. 🔒 Se sella DESPUÉS del envío,
--                    jamás antes: sellar antes deja a alguien marcado como
--                    avisado sin haber recibido nada, y nadie vuelve a mirarlo.
--   aviso_email_id   el id de Resend, para poder rastrear uno que se perdió.
--
-- 🔒 SIN DEFAULT y SIN NOT NULL a propósito: las 45 filas que ya existen NO
--    fueron avisadas, y `aviso_at = NULL` es justamente esa verdad. Un default
--    las marcaría como avisadas — un cero falso con fecha.
--
-- 🔒 CHECK sobre motivo_clave: la lista vive en `_lib/correo-rechazo` y la base
--    la repite a propósito. Son dos listas, sí — y el careo las carea
--    (bloque [M]). Vale la pena: sin el CHECK, un dedazo en el front mete una
--    clave que ninguna cuenta futura va a encontrar, en silencio.
--
-- GRANT: `requisiciones` ya existe desde REQ-B1 con su RLS deny-all y su GRANT
-- a service_role — una columna nueva hereda los permisos de la tabla, así que
-- aquí NO hace falta GRANT nuevo. (La regla del 30-oct es para tablas NUEVAS.)
-- ════════════════════════════════════════════════════════════════════════════

alter table public.requisiciones
  add column if not exists motivo_clave    text,
  add column if not exists aviso_at        timestamptz,
  add column if not exists aviso_email_id  text;

alter table public.requisiciones
  drop constraint if exists requisiciones_motivo_clave_check;

alter table public.requisiciones
  add constraint requisiciones_motivo_clave_check
  check (motivo_clave is null or motivo_clave in
    ('zona_agotada','fecha_agotada','comprobante','datos','whatsapp','otro'));

-- ── CANDADOS: que MUERDAN, no que existan ───────────────────────────────────
-- 1) las columnas están y nacen en NULL (las 45 de antes siguen «sin avisar»)
--      select count(*) total,
--             count(aviso_at) avisadas,
--             count(motivo_clave) con_clave
--        from requisiciones;
--      → esperado hoy: total 45 · avisadas 0 · con_clave 0
--
-- 2) el CHECK rebota una clave inventada (tiene que dar 23514):
--      update requisiciones set motivo_clave = 'porque_si'
--       where folio = 'R-QEDVM';
--      → ERROR: new row ... violates check constraint
--
-- 3) y deja pasar una buena:
--      update requisiciones set motivo_clave = 'zona_agotada'
--       where folio = 'R-QEDVM' and motivo_clave is null;
--      → UPDATE 1   (se revierte solo al correr el aviso de verdad)
