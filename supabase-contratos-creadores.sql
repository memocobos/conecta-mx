-- Tabla: contratos de colaboración con creadores de contenido.
-- Cada contrato tiene un token único; la creadora firma desde /contrato?t=TOKEN.
-- INE se guarda en el bucket privado `ine-creadores` y aquí solo las URLs (frente + reverso).

CREATE TABLE IF NOT EXISTS contratos_creadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  creador_nombre text NOT NULL,
  creador_email text NOT NULL,
  evento_nombre text NOT NULL,
  evento_fecha date NOT NULL,
  contrato_fecha date NOT NULL DEFAULT CURRENT_DATE,
  ofrecimiento jsonb NOT NULL,
  expectativas jsonb NOT NULL,
  estado text DEFAULT 'pendiente',
  firma_data text,
  ine jsonb,
  enviado_at timestamp DEFAULT now(),
  firmado_at timestamp,
  ip_firma text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_token ON contratos_creadores(token);
CREATE INDEX IF NOT EXISTS idx_contratos_email ON contratos_creadores(creador_email);

ALTER TABLE contratos_creadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select by token" ON contratos_creadores;
CREATE POLICY "Public select by token" ON contratos_creadores FOR SELECT USING (true);
