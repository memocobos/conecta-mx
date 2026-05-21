-- ============================================================================
-- supabase-stop-the-bleed.sql
-- Mitigación de vulnerabilidades críticas detectadas en la auditoría de RLS
-- (ver ~/Desktop/auditoria-rls-supabase.md — hallazgos C1-C7).
--
-- ⚠️ INSTRUCCIONES DE APLICACIÓN — leer antes de correr:
--
-- 1. APLICAR EN EL DASHBOARD DEL PROYECTO KAMEHOUSE
--    (https://supabase.com/dashboard/project/npgnhsmwpcipxgvfxrho/sql/new)
--    NO en el proyecto Portal (que ya está bien protegido).
--
-- 2. LA RAMA DE CÓDIGO `security-stop-the-bleed` DEBE ESTAR DEPLOYADA EN
--    PRODUCCIÓN ANTES de correr este SQL. Sin esto:
--      - El login de kamehouse dejará de funcionar (la rama mueve el login
--        a una Netlify Function con service_role).
--      - El rate limiting del login fallará al no existir kh_auth_attempts.
--
-- 3. El script está dividido en SECCIONES con riesgos distintos:
--      • SECCIÓN A — Tabla nueva (kh_auth_attempts). Seguro siempre.
--      • SECCIÓN B — Bloquear privilege escalation en `usuarios`. REVOKE
--        INSERT/UPDATE/DELETE. NO rompe nada porque la app ya no usa anon
--        para escribir usuarios (todo va por auth-login con service_role).
--      • SECCIÓN C — Bloquear SELECT en `usuarios` para anon. ROMPE el login
--        viejo si la rama no se deployó primero (el cliente antiguo intenta
--        leer usuarios con anon — auth-login.js usa service_role así que OK).
--      • SECCIÓN D — REVOKE en tablas con PII (viajeros_evento, etc.).
--        ⚠ ROMPE EL ADMIN UI DE KAMEHOUSE. kamehouse.html consulta esas
--        tablas DIRECTAMENTE con anon key. Aplicar SOLO tras refactor que
--        mueva esas queries a Netlify Functions con service_role.
--      • SECCIÓN E — Storage policies para `ine-creadores`. Bloquea upload
--        directo de anon. NO rompe — la subida ya pasa por
--        contrato-firmar.js con service_role.
--
-- 4. ORDEN RECOMENDADO:
--      A → B → C → E primero (Stop the Bleed mínimo, no rompe nada del
--      admin UI más allá del login viejo que la rama ya migra).
--      D dejar para después del refactor del admin UI.
-- ============================================================================


-- ============================================================================
-- SECCIÓN A — Tabla nueva para rate limiting de auth-login
-- ============================================================================

CREATE TABLE IF NOT EXISTS kh_auth_attempts (
  ip            text PRIMARY KEY,
  attempts      integer NOT NULL DEFAULT 1,
  window_start  timestamptz NOT NULL DEFAULT now(),
  last_attempt  timestamptz NOT NULL DEFAULT now()
);

-- RLS estricto: solo service_role accede (las Netlify Functions usan service).
ALTER TABLE kh_auth_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service only" ON kh_auth_attempts;
CREATE POLICY "service only"
  ON kh_auth_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON kh_auth_attempts FROM anon, authenticated;
GRANT ALL  ON kh_auth_attempts TO service_role;


-- ============================================================================
-- SECCIÓN B — Bloquear privilege escalation en `usuarios`
-- (anon ya NO puede crear/modificar/borrar usuarios — login pasa por service_role)
-- ============================================================================

-- Asegurar RLS habilitado (idempotente)
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Revocar permisos directos a anon para INSERT/UPDATE/DELETE
REVOKE INSERT, UPDATE, DELETE ON usuarios FROM anon;

-- Dejar SELECT en SECCIÓN C — primero deployar la rama, luego correr C.

-- service_role mantiene control total (sin cambios)
GRANT ALL ON usuarios TO service_role;


-- ============================================================================
-- SECCIÓN C — Bloquear SELECT de anon en `usuarios`
-- ⚠ APLICAR SOLO DESPUÉS de que la rama security-stop-the-bleed esté en producción.
-- ============================================================================

-- REVOKE SELECT ON usuarios FROM anon;
-- (descomentar cuando la rama esté deployada y verificada)


-- ============================================================================
-- SECCIÓN D — Bloquear SELECT/INSERT/UPDATE/DELETE de anon en tablas con PII
-- ⚠ ROMPE EL ADMIN UI DE KAMEHOUSE. Requiere refactor previo.
-- Estas líneas están comentadas. Memo: aplicar UNA POR UNA después de migrar
-- las queries directas de kamehouse.html a Netlify Functions con service_role.
-- ============================================================================

-- viajeros_evento — usada por Capsule Corp en kamehouse.html (líneas ~6500-7400 aprox)
-- REVOKE ALL ON viajeros_evento FROM anon;

-- tours_pasados — usada por reportes en kamehouse.html
-- REVOKE ALL ON tours_pasados FROM anon;

-- eventos_coordi — usada por Capsule Corp, Guerreros Z
-- REVOKE ALL ON eventos_coordi FROM anon;

-- contratos_creadores — usada por pestaña Contratos
-- REVOKE ALL ON contratos_creadores FROM anon;
-- ⚠ Pero `contrato.html` (público) lee la tabla con anon key vía contrato-obtener.js.
--    Esa function usa service_role así que el REVOKE no la rompe. OK aplicar.

-- deliverables_creadoras — usada por panel "Material entregado" en perfil
-- REVOKE ALL ON deliverables_creadoras FROM anon;

-- eventos_waitlist — usada por pestaña Lista de espera en kamehouse
-- ⚠ Caso especial: waitlist-subscribe.js debe poder INSERTAR sin auth (formulario público).
-- Solución: REVOKE SELECT pero MANTENER INSERT.
-- REVOKE SELECT, UPDATE, DELETE ON eventos_waitlist FROM anon;
-- GRANT INSERT ON eventos_waitlist TO anon;


-- ============================================================================
-- SECCIÓN E — Storage policies para `ine-creadores` (bloquear upload anon)
-- ⚠ EL BUCKET SE CREÓ MANUALMENTE EN EL DASHBOARD — sus policies actuales
-- podrían diferir. Estos comandos asumen una policy "permissive" por default
-- que se está sustituyendo. Verificar en dashboard antes de correr.
-- ============================================================================

-- Dropear policies actuales del bucket (todas)
-- (los nombres pueden variar — listar primero con SELECT * FROM pg_policies WHERE schemaname='storage';)
DROP POLICY IF EXISTS "anon upload ine"     ON storage.objects;
DROP POLICY IF EXISTS "anon select ine"     ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous"     ON storage.objects;

-- Solo service_role puede operar en el bucket
CREATE POLICY "ine service only — all"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'ine-creadores')
  WITH CHECK (bucket_id = 'ine-creadores');


-- ============================================================================
-- VERIFICACIÓN POST-APLICACIÓN
-- Ejecutar estas queries desde el dashboard para confirmar que todo aplicó:
-- ============================================================================

-- 1. ¿Tabla kh_auth_attempts existe con RLS?
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'kh_auth_attempts';

-- 2. ¿Qué grants tiene anon sobre usuarios?
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_name = 'usuarios' AND grantee IN ('anon','authenticated');

-- 3. ¿Las policies del bucket ine-creadores son correctas?
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
-- AND qual::text LIKE '%ine-creadores%';
