-- CONTRATO-CLIENTE-2 (27-oct-2026) · la firma del contrato del cliente se muda
-- al PORTAL. Palabra de Memo: «si les das la opción de elegir quién firma pueden
-- empezar a falsificarnos» → quién firma lo DECIDE la fecha de nacimiento, no
-- un selector, y se sube la INE del que firma.
--
-- 1 · viajeros_evento.fecha_nacimiento — se captura UNA vez por viajero en el
--     Portal (el dueño de la cuenta la escribe para cada viajero de su correo).
--     Una vez puesta, el cliente ya no la cambia (PATCH con `is.null` en el
--     filtro); solo Bulma/Milk la corrigen. No hay default (DEFAULTS-1).
-- 2 · contratos_cliente gana lo de la firma real: INE frente/reverso (paths
--     del bucket privado), la fecha y la edad con que se decidió, el correo
--     VERIFICADO de la sesión que firmó, y la verificación humana de la INE.
--     El CHECK de «firmado» se re-crea: ahora exige las DOS fotos de INE.
-- 3 · bucket PRIVADO contratos-cliente-ine (sin policies: solo service_role).
-- RLS/GRANT de contratos_cliente ya vienen de CONTRATO-CLIENTE-1.

alter table public.viajeros_evento add column if not exists fecha_nacimiento date
  check (fecha_nacimiento is null or (fecha_nacimiento > date '1900-01-01' and fecha_nacimiento <= current_date));

alter table public.contratos_cliente
  add column if not exists ine_frente_path text,
  add column if not exists ine_reverso_path text,
  add column if not exists fecha_nacimiento_usada date,
  add column if not exists edad_al_firmar integer,
  add column if not exists firmado_por_correo text,
  add column if not exists ine_verificada_at timestamptz,
  add column if not exists ine_verificada_por text;

-- El rol ya no lo elige el cliente: titular (adulto) o madre/padre/tutor (menor).
alter table public.contratos_cliente drop constraint if exists contratos_cliente_check;
alter table public.contratos_cliente add constraint contratos_cliente_firma_completa check (
  estado <> 'firmado' or (
    firmado_at is not null and firmante_nombre is not null and firmante_rol is not null
    and ine_frente_path is not null and ine_reverso_path is not null
    and fecha_nacimiento_usada is not null and edad_al_firmar is not null
    and firmado_por_correo is not null
    and ((edad_al_firmar >= 18 and firmante_rol = 'titular') or (edad_al_firmar < 18 and firmante_rol in ('madre','padre','tutor')))
  )
);

insert into storage.buckets (id, name, public)
select 'contratos-cliente-ine', 'contratos-cliente-ine', false
where not exists (select 1 from storage.buckets where id = 'contratos-cliente-ine');
