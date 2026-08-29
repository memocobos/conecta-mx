-- ═══════════════════════════════════════════════════════════════════════════
-- UB-1 · promos_codigos — la casa de Uranai Baba
-- Base: KameHouse (npgnhsmwpcipxgvfxrho).  La corre Jane.
--
-- Hoy una promoción vive partida en tres —el cajero (`var PROMOS` del
-- index.html), el letrero (`flash_promo` en Esferas) y el badge— y solo la
-- primera cobra. Esta tabla es el cajero, gobernado desde el Palacio.
--
-- ✅ CORRIDA POR JANE EL 28-ago-2026 EN KAMEHOUSE. Humo en verde, 0 filas.
-- Este archivo es el ACTA de lo que corrió, no una propuesta.
--
-- Dos correcciones de Jane sobre mi borrador, incorporadas:
--   1. el CHECK de unidad tenía que contemplar a las promos de PAREJA — mi
--      `num_nonnulls(monto,pct)=1` a secas habría rechazado los 7 códigos de
--      pareja al traerlos del catálogo (medido: 5 de 12 pasaban);
--   2. `hide_amount` existe como columna (dormida, sin interfaz).
-- Y una corrección mía sobre la suya, que ella firmó al correrla: la unidad se
-- expresa con `num_nonnulls(monto, pct, segundo_pax) = 1`, que además cierra
-- las dos hermanas de la mordida (pareja+monto y pareja+pct).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists promos_codigos (
  -- El código ES la llave, igual que en el objeto PROMOS: dos llaves iguales no
  -- conviven y ahí gana la última EN SILENCIO. Aquí el motor lo impide.
  codigo          text primary key check (codigo ~ '^[A-Z0-9_]{2,32}$'),

  -- ── LA UNIDAD DEL DESCUENTO ────────────────────────────────────────────────
  -- 🔒 LA MORDIDA DE NATA, IMPOSIBLE DESDE EL MOTOR. Alguien escribió `pct:500`
  -- queriendo decir «$500» y el sitio prometió QUINIENTOS POR CIENTO. `monto` y
  -- `pct` son excluyentes, y un código normal SIN unidad tampoco pasa.
  monto           numeric(10,2) check (monto > 0),
  pct             numeric(5,2)  check (pct > 0 and pct <= 100),
  -- `pct_cheap`: porcentaje distinto para CHEAP. DORMIDA hoy (0 códigos) pero
  -- viva en `calcular()` del index. Sin interfaz, por firma de Jane.
  pct_cheap       numeric(5,2)  check (pct_cheap > 0 and pct_cheap <= 100),

  -- ── QUÉ VE Y QUÉ LEE EL CLIENTE ────────────────────────────────────────────
  desc_texto      text not null check (length(btrim(desc_texto)) > 0),
  custom_msg      text,
  -- `hide_amount`: oculta la cifra en pantalla. DORMIDA (0 códigos), leída por
  -- `validarPromo`. Jane pidió que existiera o muriera: EXISTE, sin interfaz.
  -- (La que SÍ muere sin columna es `expires` —la fecha como TEXTO—: es la rama
  -- peligrosa que documentó COT-FIX-3 y no se le da un usuario nuevo. El
  -- vencimiento es siempre un INSTANTE, abajo.)
  hide_amount     boolean not null default false,

  -- ── ALCANCE ────────────────────────────────────────────────────────────────
  only_events     text[],
  all_events      boolean not null default false,
  only_zones      text[],
  -- `exclude_zones`: zonas vetadas POR EVENTO → {"natanael":["Luneta A"]}.
  -- Dormida, viva en `calcular()`. Sin interfaz.
  exclude_zones   jsonb,
  exclude_pkg     text[] not null default '{}',

  -- ── VIGENCIA ───────────────────────────────────────────────────────────────
  -- Los dos NULOS son legítimos: AIT-1 no tiene vencimiento A PROPÓSITO, y un
  -- editor que obligara fecha mataría ese trato. Se teclean en hora de REYNOSA
  -- (America/Matamoros) y se guardan como INSTANTE, que quita la pregunta.
  starts_at       timestamptz,
  expires_at      timestamptz,
  max_usos        integer not null default 9999 check (max_usos > 0),
  single_use      boolean not null default false,

  -- ── EL TRATO DE PAREJA ─────────────────────────────────────────────────────
  -- `segundo_pax` es el precio FIJO del segundo viajero por paquete
  -- ({"plus":2700}) y por eso no lleva monto ni pct: no es un descuento, es un
  -- precio. `exact_personas` exige el tamaño exacto del grupo.
  segundo_pax     jsonb,
  exact_personas  smallint check (exact_personas between 2 and 9),

  archivado       boolean not null default false,
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text,

  -- ═════════ LOS CANDADOS DE FORMA ═════════
  -- 🔒 [CORRECCIÓN 1 DE JANE] La unidad del descuento contempla a las PAREJAS.
  -- Mi versión pedía `num_nonnulls(monto,pct)=1` a secas y habría RECHAZADO los
  -- 7 códigos de pareja al traerlos del catálogo —ninguno trae monto ni pct—.
  -- Un constraint que describe la expectativa en vez de la realidad se descubre
  -- el día de la migración, con los datos en la mano.
  -- 🔒 UNA SOLA UNIDAD DE DESCUENTO, y `segundo_pax` ES LA TERCERA.
  -- No es «monto XOR pct con una excepción para parejas»: son tres formas de
  -- decir cuánto se descuenta —pesos, porcentaje, o el precio fijo del segundo
  -- viajero— y un código elige EXACTAMENTE UNA. Así la mordida de NATA
  -- (`pct:500` queriendo decir «$500») es imposible desde el motor, y también
  -- lo son sus hermanas: una pareja con monto, una pareja con pct, y un código
  -- sin ninguna unidad.
  -- Careado en Postgres contra los 28 códigos REALES del index y 4 sintéticos
  -- malos: 28/28 reales pasan · 0/4 malos pasan.
  constraint una_sola_unidad check (num_nonnulls(monto, pct, segundo_pax) = 1),
  -- `pct_cheap` es un matiz de `pct`: sin porcentaje base no significa nada.
  constraint cheap_pide_pct check (pct_cheap is null or pct is not null),
  -- Alcance explícito: o nombra sus eventos o dice `all_events`. Nunca los dos,
  -- nunca ninguno — GOL usa `all_events` y por eso no puede ser obligatorio
  -- nombrar evento.
  constraint alcance_explicito check (
    (all_events and only_events is null)
    or (not all_events and coalesce(array_length(only_events, 1), 0) > 0)
  ),
  -- Un rango de fechas al revés no es una promo: es un código muerto al nacer.
  constraint vigencia_coherente check (
    starts_at is null or expires_at is null or starts_at < expires_at
  ),
  -- `exact_personas` sin `segundo_pax` diría "solo para 2" sin dar nada a
  -- cambio. Van juntas, como en los 7 códigos reales.
  constraint pareja_completa check (
    (segundo_pax is null and exact_personas is null)
    or (segundo_pax is not null and exact_personas is not null)
  )
);

-- Los vigentes primero: es la pregunta que la pantalla hace siempre.
create index if not exists promos_codigos_vigentes_idx
  on promos_codigos (expires_at desc nulls first) where not archivado;
create index if not exists promos_codigos_eventos_idx
  on promos_codigos using gin (only_events) where not archivado;

comment on table promos_codigos is
  'UB-1 · el CAJERO de las promociones. Se compila a `var PROMOS` del index.html. '
  'El código es la llave. monto XOR pct, salvo las promos de pareja (segundo_pax).';

alter table promos_codigos enable row level security;
-- Sin políticas: solo el service_role escribe, desde la función del Palacio.
-- Es el mismo patrón de `esferas_eventos`.

-- ═══ HUMO, para correr en la misma sesión ═══════════════════════════════════
-- Los cuatro casos que el constraint tiene que distinguir. Si alguno se comporta
-- distinto, la tabla NO se queda.
do $$
begin
  -- (1) un código en PESOS: pasa
  insert into promos_codigos (codigo, monto, desc_texto, only_events)
    values ('_HUMO_PESOS', 500, 'humo', array['natanael']);
  -- (2) un código de PAREJA sin monto ni pct: pasa (la corrección de Jane)
  insert into promos_codigos (codigo, desc_texto, only_events, segundo_pax, exact_personas)
    values ('_HUMO_PAREJA', 'humo', array['calle24'], '{"plus":2700}'::jsonb, 2);
  -- (3) pesos Y porcentaje juntos: DEBE reventar (la mordida de NATA)
  begin
    insert into promos_codigos (codigo, monto, pct, desc_texto, all_events)
      values ('_HUMO_MAL', 500, 500, 'humo', true);
    raise exception 'FALLA: el constraint dejó pasar monto Y pct juntos';
  exception when check_violation then null;
  end;
  -- (4) un código normal SIN unidad: DEBE reventar
  begin
    insert into promos_codigos (codigo, desc_texto, all_events)
      values ('_HUMO_VACIO', 'humo', true);
    raise exception 'FALLA: el constraint dejó pasar un código sin unidad';
  exception when check_violation then null;
  end;
  -- (5) los 7 códigos de pareja REALES, tal cual están hoy en el index: los 7
  --     tienen que entrar. Es la prueba que pidió Jane de que el constraint
  --     describe la REALIDAD y no mi expectativa.
  insert into promos_codigos (codigo, desc_texto, only_events, segundo_pax, exact_personas, expires_at)
  values
    ('_HUMO_AITANA',   'humo', array['aitana'],        '{"plus":2000,"cheap":0}'::jsonb, 2, to_timestamp(1786597200)),
    ('_HUMO_TINI',     'humo', array['tini'],          '{"plus":2700}'::jsonb, 2, to_timestamp(1787634000)),
    ('_HUMO_CALLE24',  'humo', array['calle24'],       '{"plus":2700}'::jsonb, 2, to_timestamp(1787634000)),
    ('_HUMO_SANZ',     'humo', array['alejandrosanz'], '{"plus":2700}'::jsonb, 2, to_timestamp(1787634000)),
    ('_HUMO_ENJAMBRE', 'humo', array['enjambre'],      '{"plus":2700}'::jsonb, 2, to_timestamp(1787634000)),
    ('_HUMO_BADGYAL',  'humo', array['badgyal'],       '{"plus":2700}'::jsonb, 2, to_timestamp(1787634000)),
    ('_HUMO_SCORP',    'humo', array['scorpions'],     '{"plus":2700}'::jsonb, 2, to_timestamp(1787634000));
  -- (5b) PAREJA CON MONTO: DEBE reventar. Es EL caso que distingue este
  --      constraint del anterior —aquél la dejaba pasar— y por eso lleva sonda
  --      propia: dos unidades de descuento en un código, y `calcular()`
  --      tendría que adivinar cuál manda.
  begin
    insert into promos_codigos (codigo, monto, desc_texto, only_events, segundo_pax, exact_personas)
      values ('_HUMO_PAREJA_MONTO', 500, 'humo', array['calle24'], '{"plus":2700}'::jsonb, 2);
    raise exception 'FALLA: el constraint dejó pasar una PAREJA CON MONTO';
  exception when check_violation then null;
  end;
  -- (5c) y una PAREJA CON PCT, la hermana del caso de arriba
  begin
    insert into promos_codigos (codigo, pct, desc_texto, only_events, segundo_pax, exact_personas)
      values ('_HUMO_PAREJA_PCT', 10, 'humo', array['calle24'], '{"plus":2700}'::jsonb, 2);
    raise exception 'FALLA: el constraint dejó pasar una PAREJA CON PCT';
  exception when check_violation then null;
  end;

  -- (6) GOL, el único `all_events`, y AIT-1/MEMODALE, los únicos SIN vencimiento
  insert into promos_codigos (codigo, monto, desc_texto, all_events, starts_at, expires_at)
    values ('_HUMO_GOL', 500, 'humo', true, to_timestamp(1782882000), to_timestamp(1782968400));
  insert into promos_codigos (codigo, pct, desc_texto, only_events)
    values ('_HUMO_SINFECHA', 10, 'humo', array['dalemix']);

  delete from promos_codigos where codigo like '\_HUMO\_%';
  raise notice 'HUMO OK · pesos pasa · pareja pasa · los 7 de pareja reales entran · GOL (all_events) entra · un codigo SIN vencimiento entra · REVIENTAN: monto+pct, sin unidad, pareja+monto, pareja+pct';
end $$;
