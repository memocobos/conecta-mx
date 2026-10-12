-- =============================================================================
-- REQ-B1 · FASE B del rumbo (12-oct-2026): la tabla de REQUISICIONES
--
-- El index cotiza y levanta una requisición (forma de pago + comprobante del
-- cliente) que cae a una bandeja en KameHouse. Bulma/Milk aprueban, rechazan
-- o señalan faltantes; al aprobar nace el viajero por la puerta de zonas.
--
-- 🔒 RLS deny-all: RLS encendido y CERO políticas — solo service_role entra.
--    Ningún navegador lee esta tabla directo; todo pasa por functions.
-- 🔒 El PRECIO no viene del cliente: requisicion-crear lo recalcula con
--    resolverPrecioVenta (la autoridad) y guarda total_sistema/separo_sistema.
-- 🔒 Bucket privado 'requisiciones-comprobantes': sube la function pública
--    (service key del lado del servidor, jamás en el cliente), lo ve el staff
--    por signed URL de 1 hora (patrón de admin-solicitud-comprobante).
--
-- Corrida: 12-oct-2026 contra KH (npgnhsmwpcipxgvfxrho) vía MCP, por el
-- verificador. Verificación al pie.
-- =============================================================================

create table public.requisiciones (
  id              uuid primary key default gen_random_uuid(),
  folio           text not null unique,
  evento_id       text not null,            -- slug del catálogo (con #idx si multifecha)
  evento_nombre   text,                     -- snapshot derivado del catálogo al crear
  paquete         text not null check (paquete in ('plus','stay','ride','cheap')),
  zona            text,                     -- canónica de la ficha (null en ride)
  num_personas    integer not null default 1 check (num_personas between 1 and 20),
  hotel           text,                     -- nombre del tipo de cuarto elegido (snapshot)
  nombre          text not null,
  celular         text not null,            -- 10 dígitos, sin lada de país (regla de la casa)
  correo          text,
  forma_pago      text not null check (forma_pago in ('transferencia','deposito','oxxo','link_pago')),
  total_sistema   numeric,                  -- recalculado por el SERVIDOR (resolverPrecioVenta)
  separo_sistema  numeric,                  -- idem — lo que el cliente debía pagar hoy
  cotizacion_texto text,                    -- lo que el cliente VIO (snapshot, informativo)
  comprobante_path text,                    -- bucket privado
  comprobante_tipo text,
  estado          text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  motivo_rechazo  text,
  nota_staff      text,
  viajero_id      uuid references public.viajeros_evento(id),
  revisada_por    text,
  revisada_at     timestamptz,
  creado_en       timestamptz not null default now()
);

-- (corrido aparte, mismo día): el transporte elegido viaja como snapshot
alter table public.requisiciones add column transporte text;

alter table public.requisiciones enable row level security;

create index requisiciones_estado_idx on public.requisiciones (estado, creado_en desc);
create index requisiciones_evento_idx on public.requisiciones (evento_id);

-- Bucket privado para los comprobantes. Se comprobó ANTES que no existía
-- (select de storage.buckets) — insert directo, sin on_conflict (regla de la casa).
insert into storage.buckets (id, name, public)
values ('requisiciones-comprobantes', 'requisiciones-comprobantes', false);

-- ⚰️ CORRECCIÓN EL MISMO DÍA: ese bucket quedó SIN ESTRENAR. Los comprobantes
-- van al bucket privado que YA EXISTE, `abonos-viajeros` (prefijo `req/`), a
-- propósito: al aprobar la requisición, el abono hereda el path en `foto_path`
-- y el visor de abonos existente (que firma contra abonos-viajeros) lo abre
-- sin copiar nada. El bucket nuevo no se pudo borrar (storage.protect_delete
-- lo prohíbe por SQL) — queda VACÍO y sin escritor; si estorba, se borra desde
-- el panel de Storage. Verificado: abonos-viajeros existe y es privado.

-- ── Verificación (corrida tras el acta) ─────────────────────────────────────
-- 1. La tabla existe con RLS encendido y CERO políticas:
--    select relname, relrowsecurity from pg_class where relname='requisiciones';
--    select count(*) from pg_policies where tablename='requisiciones';  -- 0
-- 2. Los CHECKs muerden:
--    insert con paquete='vip'      → 23514 ✗ (probado y revertido: nunca insertado)
--    insert con forma_pago='bitcoin' → 23514 ✗
--    insert con estado='pagada'    → 23514 ✗
-- 3. El bucket existe y es privado:
--    select id, public from storage.buckets where id='requisiciones-comprobantes';
