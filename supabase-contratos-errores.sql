-- Tabla: telemetría de errores en el flujo de subida de INE en contrato.html.
-- Se llena desde netlify/functions/contrato-debug-log.js cuando el decoder chain
-- agota intentos (HEIC sin createImageBitmap) o cuando la cascada de re-compresión
-- no logra bajar el payload. Sirve para dimensionar cuántas creadoras tropiezan
-- con qué tipo de error.
--
-- Correr en: Supabase de kamehouse (npgnhsmwpcipxgvfxrho).

CREATE TABLE IF NOT EXISTS contratos_errores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  error_type text NOT NULL CHECK (error_type IN (
    'heic_decode_failed',
    'decoder_chain_failed',
    'cascade_exhausted'
  )),
  user_agent text,
  file_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  decoder_path text[] NOT NULL DEFAULT ARRAY[]::text[],
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_errores_token ON contratos_errores(token);
CREATE INDEX IF NOT EXISTS idx_contratos_errores_created_at ON contratos_errores(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contratos_errores_type ON contratos_errores(error_type);

-- RLS: nadie lee desde el cliente; el insert lo hace la function con service_role
-- (que bypassa RLS). Mantenemos RLS activo + cero políticas como defensa en
-- profundidad — si alguien filtrara la anon key, no podría leer estos logs.
ALTER TABLE contratos_errores ENABLE ROW LEVEL SECURITY;
