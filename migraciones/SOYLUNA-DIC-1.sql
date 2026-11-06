-- ═══════════════════════════════════════════════════════════════════════════
-- SOYLUNA-DIC-1 · Soy Luna «El último show» NUEVA FECHA 8-dic-2026 (5-nov-2026)
-- Palabra de Memo, citada: «necesitamos sacar la venta para soy luna la última
-- fecha ahora sí · a los costos le vas a subir $2200 para saber el costo del
-- paquete plus y a los cheap a esos costos le subes $600».
--
-- Ficha NUEVA (slug soylunadic), no una fecha más de `soyluna`: la ficha vieja
-- (21-oct, pasada) tiene viajeros, contratos y careo propios — mezclarla con un
-- multifecha movería su historia. Nace por INSERT…SELECT del molde `soyluna`
-- (mismo venue, mapa, portada, música, inc, sep/sep_cheap 300, ride 2700).
--   · PLUS (zonas.p)  = costo + 2200 · CHEAP (cheap_zonas.p) = costo + 600
--   · 23 zonas ABIERTAS, con la ortografía de la tabla de costos de Memo
--     (VIP y Platino con vip:1). Sin pedido cargado: venden a ciegas hasta que
--     se cargue el pedido en Kamisama.
-- Verificado antes de publicar: compilarEV real (128→129 eventos, los dos
-- parsers OK, MEDIA-GUARD callado) y _calcularPrecio: PLUS VIP 6,800 · PLUS
-- Balcón 3,000 · CHEAP VIP 5,200 · CHEAP Balcón Vist Lim 1,400 · STAY Oro
-- 4,680 · RIDE 2,700 · separo 300.
--
-- 🔒 ORDEN: push PRIMERO (REQUISICION_EVENTOS + EVENTOS_CORREO ganaron
-- soylunadic) → publish de Esferas DESPUÉS.
-- CORRIDA: 5-nov-2026 vía MCP, NOT EXISTS — 1 fila.
-- ═══════════════════════════════════════════════════════════════════════════

with c(ord,n,costo,vip) as (values
 (1,'VIP',4600,1),(2,'Platino',3950,1),(3,'Coke Studio',3490,0),(4,'Doritos',3490,0),(5,'Plata',3490,0),(6,'Plata VL',3490,0),(7,'Superpalco',3490,0),
 (8,'McCormick',2980,0),(9,'Oro',2980,0),(10,'Oro VL',2980,0),(11,'Osel',2980,0),(12,'Banco Azteca',2550,0),(13,'Barrera',2550,0),(14,'Megacable',2550,0),
 (15,'Butaca',2200,0),(16,'Butaca VL',2200,0),(17,'Plus Ultra',1850,0),(18,'Pref Especial',1850,0),(19,'Pref Especial VL',1850,0),(20,'Preferente',1500,0),
 (21,'Luneta',1150,0),(22,'Balcón',800,0),(23,'Balcón Vist Lim',800,0)),
zj as (select jsonb_agg(jsonb_build_object('n',n,'p',costo+2200,'pc',costo+600,'vip',vip) order by ord)::text z,
              jsonb_agg(jsonb_build_object('n',n,'p',costo+600,'ag',0,'prox',0,'vip',vip,'sepEspecial',null,'requiereViajeros',null) order by ord)::text cz from c)
insert into esferas_eventos
select (jsonb_populate_record(null::esferas_eventos, to_jsonb(p) || jsonb_build_object(
  'slug','soylunadic','nombre','Soy Luna - El Último Show','titulo','Soy Luna - El Último Show · Nueva fecha',
  'status','','fecha_inicio','2026-12-08','fecha_fin',null,'fechas_extra',null,'f_texto',null,
  'zonas',(select z from zj),'cheap_zonas',(select cz from zj),
  'publicado',true,'archivado',false,'created_at',now(),'updated_at',now()))).*
from esferas_eventos p where p.slug='soyluna' and not exists (select 1 from esferas_eventos where slug='soylunadic');
