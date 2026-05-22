-- ============================================================================
-- supabase-sistema-config-rls.sql
--
-- Bloquea acceso directo a sistema_config desde la anon key. Todo el acceso
-- (lectura y escritura) pasa ahora por dos Netlify Functions:
--   - sistema-config-get   (cualquier rol autenticado → filtra columnas por rol)
--   - sistema-config-save  (solo maestro_roshi → UPSERT con service_role)
--
-- Patrón equivalente al de kh_auth_attempts y usuarios: "service only".
--
-- Correr en el proyecto Supabase de Kamehouse:
--   https://supabase.com/dashboard/project/npgnhsmwpcipxgvfxrho/sql/new
-- ============================================================================

ALTER TABLE sistema_config ENABLE ROW LEVEL SECURITY;

-- Limpiar policies existentes (idempotente — si no existen, no pasa nada).
DROP POLICY IF EXISTS "sistema_config_select_public" ON sistema_config;
DROP POLICY IF EXISTS "sistema_config_select_anon"   ON sistema_config;
DROP POLICY IF EXISTS "sistema_config_all"           ON sistema_config;
DROP POLICY IF EXISTS "sistema_config_anon_rw"       ON sistema_config;
DROP POLICY IF EXISTS "Enable read access for all users" ON sistema_config;
DROP POLICY IF EXISTS "Enable insert for all users"      ON sistema_config;
DROP POLICY IF EXISTS "Enable update for all users"      ON sistema_config;

-- Sin policies = deny-all para anon y authenticated.
-- service_role bypassa RLS por diseño, así que las Functions siguen funcionando.

-- Defensa en profundidad: quitar también GRANTs directos por si existían.
REVOKE ALL ON sistema_config FROM anon, authenticated, PUBLIC;
GRANT  ALL ON sistema_config TO service_role;

-- Verificación rápida tras correr:
--   SELECT polname, cmd FROM pg_policies WHERE tablename = 'sistema_config';
--   → debería devolver 0 filas (cero policies = deny por defecto con RLS on)
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'sistema_config';
--   → solo service_role debería tener privilegios
