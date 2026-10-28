-- =============================================================================
-- PRV-EDITA-1a · 28-oct-2026 · «✓ Ya quedó»: cerrar una solicitud sin mentir
-- =============================================================================
-- PALABRA DE MEMO (28-oct): «esa notificación no se quita nunca de
-- requisiciones, siempre aparece».
--
-- 🔴 EL HUECO, medido: una solicitud de «ligar» cuyos candidatos YA están
-- ligados y publicados no tiene forma de cerrarse. Los únicos botones son
-- WhatsApp y «No procede (todo)» — y ése le manda al cliente un correo diciendo
-- que su solicitud NO procedió, que en el caso real (Frida) era mentira: su
-- caso sí procedía, le faltaba un día de viaje. Así que la tarjeta se queda
-- pegada en la bandeja para siempre, y una bandeja con un pendiente eterno
-- deja de ser una bandeja.
--
-- EL ESTADO NUEVO ES SU PROPIO ESTADO, no un `rechazada` disfrazado:
--   · 'pendiente' → nadie la ha visto
--   · 'publicada' → se le publicó su viaje
--   · 'rechazada' → NO procede, y el motivo le llega al cliente
--   · 'resuelta'  → ya se atendió (por WhatsApp, o ya estaba bien). NUEVO.
-- 🔒 Meter esto como 'rechazada' habría hecho que el Portal le dijera al cliente
--    «tu solicitud no procedió» sobre algo que sí se resolvió — el mismo defecto
--    que RECHAZO-AVISO-1 vino a curar, con otra cara.
--
-- 🔒 LOS DOS ÍNDICES ÚNICOS PARCIALES SE LIBERAN SOLOS: van `where estado =
--    'pendiente'`, así que al pasar a 'resuelta' la persona puede volver a pedir
--    revisión si hace falta. No hay que tocarlos — verificado leyendo
--    PORTAL-SOLO-1.sql líneas 57-59.
-- 🔒 Y EL CHECK DEL MOTIVO NO ESTORBA: dice `estado <> 'rechazada' or motivo…`,
--    así que 'resuelta' no queda obligada a tener motivo. La nota del staff va
--    en `nota_staff`, que es donde vive lo interno.
-- =============================================================================

-- ── [1] CANDADO DE ENTRADA: el CHECK es el que creemos ──────────────────────
select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.portal_revisiones'::regclass
  and conname = 'portal_revisiones_estado_check';
-- ESPERADO: check (estado = ANY (ARRAY['pendiente','publicada','rechazada']))

-- ── [2] EL ALTER ────────────────────────────────────────────────────────────
alter table public.portal_revisiones
  drop constraint if exists portal_revisiones_estado_check;

alter table public.portal_revisiones
  add constraint portal_revisiones_estado_check
  check (estado in ('pendiente', 'publicada', 'rechazada', 'resuelta'));

-- ── [3] CANDADO DE SALIDA: que el CHECK MUERDA de verdad ────────────────────
-- No basta con que exista: se le siembra basura y se exige el 23514.
do $$
declare
  paso_el_bueno boolean := false;
  mordio_el_malo boolean := false;
  rid uuid;
begin
  -- (a) el valor nuevo SÍ entra
  begin
    insert into public.portal_revisiones (tipo, estado, correo, evento_id, nombre_dado)
    values ('ligar', 'resuelta', 'prueba-prv-edita-1a@ejemplo.test', 'x#0', 'PRUEBA PRV-EDITA-1a')
    returning id into rid;
    paso_el_bueno := true;
    delete from public.portal_revisiones where id = rid;
  exception when others then
    paso_el_bueno := false;
  end;

  -- (b) un valor inventado NO entra
  begin
    insert into public.portal_revisiones (tipo, estado, correo, evento_id, nombre_dado)
    values ('ligar', 'masomenos', 'prueba-prv-edita-1a@ejemplo.test', 'x#0', 'PRUEBA PRV-EDITA-1a')
    returning id into rid;
    delete from public.portal_revisiones where id = rid;
    mordio_el_malo := false;
  exception when check_violation then
    mordio_el_malo := true;
  end;

  if not paso_el_bueno then raise exception 'PRV-EDITA-1a: «resuelta» NO entra — el ALTER no sirvió'; end if;
  if not mordio_el_malo then raise exception 'PRV-EDITA-1a: el CHECK NO muerde — acepta cualquier estado'; end if;
  raise notice 'PRV-EDITA-1a OK · «resuelta» entra ✓ · estado inventado rebota con 23514 ✓';
end $$;

-- ── [4] Y que no quedó basura de la prueba ──────────────────────────────────
select count(*) as filas_de_prueba_que_deben_ser_cero
from public.portal_revisiones where correo = 'prueba-prv-edita-1a@ejemplo.test';
-- ESPERADO: 0
