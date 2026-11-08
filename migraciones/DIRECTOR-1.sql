-- =============================================================================
-- DIRECTOR-1 · 7-nov-2026 — El rol de SOLO LECTURA para la dirección, el modo
-- de NOMBRES PROFESIONALES por usuario y la plantilla «Ejecutivo» (clara).
--
-- Palabra de Memo: «Mi jefe quiere ver el kamehouse, puedes hacerme un usuario y
-- contraseña provisional para él, también cámbiale el template a algo más
-- profesional para él y los nombres ponlos como debe de ser». Sus tres
-- respuestas: acceso «ver todo, sin poder cambiar nada» · nombres normales SOLO
-- para él (el equipo sigue viendo los de Dragon Ball) · tema «Ejecutivo» claro.
--
-- Base: KameHouse (npgnhsmwpcipxgvfxrho). Tres cambios, los tres en `usuarios`
-- (tabla que ya existe: sus GRANTs no cambian).
--
-- 🔒 La PUERTA del rol NO vive aquí: vive en `_lib/verify-admin.js`
-- (LECTURAS_DIRECTOR). La base solo acepta el valor; qué puede hacer lo decide
-- el servidor, acción por acción, fail-closed.
-- =============================================================================

-- 1) El rol entra al CHECK (8 roles). Careado contra ROLES_VALIDOS de
--    admin-usuarios.js y contra PERMISOS_TABS / GZ_TABS_PERMITIDAS de kamehouse.js.
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol = any (array['maestro_roshi','bulma','mister_popo','coordinador','cc','milk','yajirobe','director']));

-- 2) La plantilla clara «Ejecutivo» entra al CHECK de tema_plantilla (misma
--    lista que PLANTILLAS_KH en kamehouse.js + la clase en kamehouse.css).
alter table public.usuarios drop constraint if exists usuarios_tema_plantilla_check;
alter table public.usuarios add constraint usuarios_tema_plantilla_check
  check (tema_plantilla is null or tema_plantilla = any (array[
    'clasico','tema-ximena','tema-america','tema-reginna','tema-luis','tema-laura','tema-brittany','tema-axel',
    'tema-ki','tema-mutante','tema-lunar','tema-campeon','tema-tiempo','tema-flamenca','tema-disco','tema-bohemia',
    'tema-verano','tema-laboratorio','tema-codigo','tema-ejecutivo']));

-- 3) El modo de nombres profesionales: apagado para todos los que ya existen
--    (nadie del equipo nota nada); se prende por usuario desde Montaña Pai.
alter table public.usuarios add column if not exists nombres_pro boolean not null default false;
comment on column public.usuarios.nombres_pro is
  '[DIRECTOR-1] true = la pantalla le enseña nombres profesionales (Panel de control, Viajeros, Equipo, Eventos…) en vez de los de Dragon Ball. Solo cambia etiquetas; no cambia permisos.';

-- Candados, para morderlos (deben REBOTAR):
--   insert into usuarios (correo,nombre,rol) values ('x@x','x','gerente');          -- 23514
--   update usuarios set tema_plantilla='tema-corporativo' where false;              -- (sintaxis ok; con una fila real → 23514)

-- =============================================================================
-- REGISTRO (7-nov-2026): YA CORRIDA en KH. CHECK de rol leído de pg_constraint
-- con 8 valores; `tema-ejecutivo` en el CHECK de plantilla; `nombres_pro`
-- existe con default false (0 usuarios en true antes del alta del director).
-- =============================================================================
