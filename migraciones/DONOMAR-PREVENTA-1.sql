-- ═══════════════════════════════════════════════════════════════════════════
-- DONOMAR-PREVENTA-1 · Don Omar entra a la PREVENTA A CIEGAS $300 (4-nov-2026)
-- Palabra de Memo, citada: «activemos una preventa como la de NSQK o Pal norte
-- para DON OMAR en Mexico · aun no se si viene a mexico, monterrey o donde ·
-- Separo de $300 · beneficios los mismos de nsqk pero incluyele aparte un
-- boleto laminado y una gorra conmemorativa Don Omar x Conecta Reynosa ·
-- es evento 2027».
--
-- La ficha NACE copiando el molde de palnorte (INSERT…SELECT, jamás tecleada
-- campo por campo) con estas diferencias, todas deliberadas:
--   · SIN FECHA (fecha_inicio NULL) y SIN VENUE: no se sabe ni la ciudad. En el
--     sitio cae en la sección «Por confirmar» del catálogo — una fecha tentativa
--     habría pintado el encabezado de un MES que nadie anunció.
--     El sistema la sigue contando como época nueva (_lib/epoca: una ficha
--     nacida después del corte es nueva aunque no tenga fecha) y el contador
--     de la portada la pone en 2027 (ANIO_A_MANO, palabra de Memo).
--   · ciudad NULL, festival NULL, sin portada propia: la foto la busca el sitio
--     por el nombre del artista (img), como a cualquier evento sin portada.
--   · inc = los 3 beneficios de NSQK + boleto laminado + gorra (palabra de Memo).
--
-- 🔒 ORDEN DEL ENCENDIDO (la regla de PN27): PUSH PRIMERO, PUBLISH DESPUÉS.
-- Publicar con el código viejo sacaría a donomar como CHEAP normal sin el
-- paquete único ni la requisición.
--
-- CORRIDA: 4-nov-2026 vía MCP. Candado: WHERE NOT EXISTS (re-correrla no
-- duplica) — 1 fila.
-- ═══════════════════════════════════════════════════════════════════════════

insert into esferas_eventos
select (jsonb_populate_record(null::esferas_eventos, to_jsonb(p) || jsonb_build_object(
  'slug',        'donomar',
  'nombre',      'Don Omar',
  'titulo',      'Don Omar en México 2027',
  'tipo',        'concierto',
  'status',      '',
  'venue',       '',
  'ciudad',      null,
  'fecha_inicio', null,
  'fecha_fin',   null,
  'fechas_extra', null,
  'f_texto',     'Por confirmar',
  'sep',         300,
  'sep_cheap',   300,
  'cheap_only',  true,
  'cheap_zonas', '[{"n":"Preventa a ciegas","p":300,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null}]',
  'zonas',       null,
  'inc',         '["Costo preferencial en nuestra fase más baja","Prioridad para elegir tu zona y paquete al publicarse los costos","Tu separo de $300 se abona al paquete que elijas","Boleto laminado conmemorativo","Gorra conmemorativa Don Omar x Conecta Reynosa"]',
  'nota',        'PREVENTA A CIEGAS · Aparta tu lugar con solo $300. Ciudad, fecha, zonas y costos por anunciarse — tu separo asegura el costo preferencial de la fase más baja.',
  'foto',        '',
  'static_img',  null,
  'mapa',        '',
  'mapa_null',   true,
  'festival',    null,
  'music',       null,
  'publicado',   true,
  'archivado',   false,
  'created_at',  now(),
  'updated_at',  now()
))).*
from esferas_eventos p
where p.slug = 'palnorte'
  and not exists (select 1 from esferas_eventos where slug = 'donomar');

-- Careo de salida (1 fila):
-- select slug, status, cheap_only, cheap_zonas, sep, sep_cheap, fecha_inicio, f_texto, inc
--   from esferas_eventos where slug = 'donomar';

-- ── DONOMAR-FECHA-1 (7-nov-2026, palabra de Memo: «ponle fecha de 9 de
-- noviembre al evento de don omar»). La fecha (2027-11-09) y el venue
-- (Walmart Park, Mty) ya los había puesto Memo en Esferas; f_texto seguía en
-- 'Por confirmar' y TAPABA la fecha. Se quita, y la nota deja de decir que
-- ciudad y fecha están por anunciarse. Compilado: f:'9 nov 2027'.
-- CORRIDA: 7-nov-2026 vía MCP.
update public.esferas_eventos
set f_texto = null,
    nota = 'PREVENTA A CIEGAS · Aparta tu lugar con solo $300. Zonas y costos por anunciarse — tu separo asegura el costo preferencial de la fase más baja.',
    updated_at = now()
where slug = 'donomar' and f_texto = 'Por confirmar' and fecha_inicio = '2027-11-09';
