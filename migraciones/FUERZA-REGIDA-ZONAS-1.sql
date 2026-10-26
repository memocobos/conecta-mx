-- ═══════════════════════════════════════════════════════════════════════════
-- FUERZA-REGIDA-ZONAS-1 · las 15 zonas de fuerzaregida (26-oct-2026)
-- Palabra de Memo: «evento fuerza regida ya lo subi me falta subir los costos
-- y zonas … revisa y dale» — él cargó la ficha (título, venue, fecha
-- 11-ene-2027, foto, mapa, inc, sep/sepCheap 500); aquí entran SOLO las zonas,
-- con los 15 pares PLUS/CHEAP que pasó (verificados: PLUS = CHEAP + $1,800 en
-- las 15, consistente).
--
-- 🔒 El molde se COPIÓ de una ficha viva gobernada por Esferas (payasonicos),
-- no se inventó: `zonas` = [{"n","p","pc"}] (p = PLUS, pc = su CHEAP) y
-- `cheap_zonas` = la forma larga con ag/prox/vip/sepEspecial/requiereViajeros.
-- Las columnas son TEXT con JSON estricto (comillas dobles — la lección de
-- AG-CERO-FALSO).
--
-- La ficha sigue publicado=false: el publish lo aprieta Memo desde Esferas.
-- CORRIDA: 26-oct-2026 vía MCP. Candado: WHERE exige zonas Y cheap_zonas en
-- NULL (no se pisa una captura de Memo) — 1 fila.
-- ═══════════════════════════════════════════════════════════════════════════

update esferas_eventos set
  zonas = '[{"n":"Cancha VIP","p":5900,"pc":4100},{"n":"Platino","p":7200,"pc":5400},{"n":"Oro","p":6500,"pc":4700},{"n":"Coke Studio","p":7200,"pc":5400},{"n":"Doritos","p":7200,"pc":5400},{"n":"McCormick","p":7200,"pc":5400},{"n":"Osel","p":7200,"pc":5400},{"n":"Banco Azteca","p":6500,"pc":4700},{"n":"Megacable","p":6500,"pc":4700},{"n":"Plus Ultra","p":6500,"pc":4700},{"n":"Barrera","p":5500,"pc":3700},{"n":"Butaca","p":5200,"pc":3400},{"n":"Preferente","p":5000,"pc":3200},{"n":"Luneta","p":4700,"pc":2900},{"n":"Balcón","p":4000,"pc":2200}]',
  cheap_zonas = '[{"n":"Cancha VIP","p":4100,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Platino","p":5400,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Oro","p":4700,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Coke Studio","p":5400,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Doritos","p":5400,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"McCormick","p":5400,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Osel","p":5400,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Banco Azteca","p":4700,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Megacable","p":4700,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Plus Ultra","p":4700,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Barrera","p":3700,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Butaca","p":3400,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Preferente","p":3200,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Luneta","p":2900,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Balcón","p":2200,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null}]'
where slug = 'fuerzaregida'
  and zonas is null
  and cheap_zonas is null;

-- Careo de salida: 15 zonas en cada lado, pares exactos a la lista de Memo.
-- select slug, zonas, cheap_zonas from esferas_eventos where slug='fuerzaregida';
