-- ═══════════════════════════════════════════════════════════════════════════
-- VIVELATINO-VENTA-1 · Vive Latino 2027 sale a la venta (7-nov-2026)
-- Palabra de Memo: festival a CDMX, vuelos aparte «como Flow o Corona».
--   PLUS  2 días $6,200 · Sábado $4,500 · Domingo $4,500
--   CHEAP 2 días $4,300 · Sábado $2,600 · Domingo $2,600
-- Sus respuestas: RIDE igual que Flow (1 día $2,900 · 2 días $4,800) · hotel
-- igual que Flow (Triple +$300 · Doble +$800 · Individual +$2,400 por noche,
-- x2 en 2 días) · separo $300 PLUS y CHEAP · se aparta por requisición.
-- Molde: flowfest (tipo concierto + multifecha). El objeto `festival` sin
-- paquetes ya se compilaba por el camino de concierto; se conserva tal cual.
-- El lineup pasa a la columna `lineup` (la URL que vivía en festival.lineup).
-- Sin pedido de boletos: vende a ciegas hasta cargarlo en Kamisama.
-- Valor esperado en el WHERE: status proximamente, sin zonas ni multifecha.
-- CORRIDA: 7-nov-2026 vía MCP.
-- ═══════════════════════════════════════════════════════════════════════════

update public.esferas_eventos set
  tipo = 'concierto',
  status = '',
  sep = 300,
  sep_cheap = 300,
  zonas = '[{"n":"General","p":4500,"pc":2600,"ag":0,"prox":0,"vip":0,"requiereViajeros":0}]',
  cheap_zonas = '[{"n":"General","p":2600,"ag":0,"prox":0,"vip":0}]',
  multifecha = '[{"lbl":"Sábado","sublbl":"13 mar","ds":"2027-03-13","noches":1,"zonas":[{"n":"General","p":4500}],"cheapZonas":[{"n":"General","p":2600}],"ride":2900,"hotel":[{"k":"compartida","n":"Compartida (4)","e":0,"pp":0,"viaj":[1,2,3,4],"desc":"Compartes cuarto con otros viajeros"},{"k":"triple","n":"Triple","e":300,"pp":300,"viaj":[3],"desc":"Tu parte del cuarto triple"},{"k":"doble","n":"Doble","e":800,"pp":800,"viaj":[2],"desc":"Tu parte del cuarto doble"},{"k":"individual","n":"Individual","e":2400,"pp":2400,"viaj":[1],"desc":"Cuarto solo para ti"}]},{"lbl":"Domingo","sublbl":"14 mar","ds":"2027-03-14","noches":1,"zonas":[{"n":"General","p":4500}],"cheapZonas":[{"n":"General","p":2600}],"ride":2900,"hotel":[{"k":"compartida","n":"Compartida (4)","e":0,"pp":0,"viaj":[1,2,3,4],"desc":"Compartes cuarto con otros viajeros"},{"k":"triple","n":"Triple","e":300,"pp":300,"viaj":[3],"desc":"Tu parte del cuarto triple"},{"k":"doble","n":"Doble","e":800,"pp":800,"viaj":[2],"desc":"Tu parte del cuarto doble"},{"k":"individual","n":"Individual","e":2400,"pp":2400,"viaj":[1],"desc":"Cuarto solo para ti"}]},{"lbl":"2 Días","sublbl":"13 y 14 mar","ds":"2027-03-13","noches":2,"zonas":[{"n":"General","p":6200}],"cheapZonas":[{"n":"General","p":4300}],"ride":4800,"hotel":[{"k":"compartida","n":"Compartida (4)","e":0,"pp":0,"viaj":[1,2,3,4],"desc":"Compartes cuarto con otros viajeros · 2 noches"},{"k":"triple","n":"Triple","e":600,"pp":600,"viaj":[3],"desc":"Tu parte del cuarto triple · 2 noches"},{"k":"doble","n":"Doble","e":1600,"pp":1600,"viaj":[2],"desc":"Tu parte del cuarto doble · 2 noches"},{"k":"individual","n":"Individual","e":4800,"pp":4800,"viaj":[1],"desc":"Cuarto solo para ti · 2 noches"}]}]',
  hotel = '{"custom":true,"pp":true,"override":false,"items":[{"k":"compartida","n":"Compartida (4)","e":0,"pp":0,"viaj":[1,2,3,4],"desc":"Compartes cuarto con otros viajeros"},{"k":"triple","n":"Triple","e":300,"pp":300,"viaj":[3],"desc":"Tu parte del cuarto triple"},{"k":"doble","n":"Doble","e":800,"pp":800,"viaj":[2],"desc":"Tu parte del cuarto doble"},{"k":"individual","n":"Individual","e":2400,"pp":2400,"viaj":[1],"desc":"Cuarto solo para ti"}]}',
  lineup = 'https://npgnhsmwpcipxgvfxrho.supabase.co/storage/v1/object/public/mapas-eventos/vivelatino-lineup.webp',
  updated_at = now()
where slug = 'vivelatino'
  and status = 'proximamente'
  and tipo = 'festival'
  and zonas is null
  and multifecha is null
  and sep = 500;

-- ── VIVELATINO-VENTA-1b (7-nov-2026, palabra de Memo: «primero 2 días luego
-- sábado y domingo en el selector del día»). Se reordena el multifecha:
-- #0 = 2 Días · #1 = Sábado · #2 = Domingo. Medido antes: 0 viajeros,
-- 0 requisiciones, 0 compras/ajustes/historial con vivelatino#N — ningún
-- índice de fecha colgaba de nadie. Valor esperado: el md5 del orden viejo.
-- CORRIDA: 7-nov-2026 vía MCP (md5 nuevo d25eda1faa05ae03279ace1d1ab9ce77).
update public.esferas_eventos
set multifecha = (select jsonb_build_array(m->2, m->0, m->1)::text from (select multifecha::jsonb m) x),
    updated_at = now()
where slug = 'vivelatino' and md5(multifecha) = 'de3d01cb43e19d0bdac9820aef687511';

-- ── VIVELATINO-VENTA-1c (7-nov-2026, 15:55 UTC). Un guardado de Esferas con
-- la pantalla abierta desde ANTES del 1b (15:43 UTC) regresó el orden viejo
-- (Sábado · Domingo · 2 Días) y así se publicó. Se repite el reordenamiento.
-- Medido antes: 0 viajeros, requisiciones, compras, ajustes, historial,
-- solicitudes del Más Allá y recordatorios con vivelatino#N.
-- CORRIDA: 7-nov-2026 vía MCP (md5 nuevo e53460ec4ced13d8797201624ff63cf1).
update public.esferas_eventos
set multifecha = (select jsonb_build_array(m->2, m->0, m->1)::text from (select multifecha::jsonb m) x),
    updated_at = now()
where slug = 'vivelatino' and md5(multifecha) = '81a44407538e9d86ecf3a7b1dc9e43fe';
