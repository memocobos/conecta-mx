-- NSQK-VENTA-1 (27-oct-2026) · nsqkmty sale de PREVENTA A CIEGAS a VENTA normal.
-- Precios: palabra de Memo (chat 27-oct), PLUS y CHEAP por zona. RIDE $2,700 (regla MTY).
-- STAY = PLUS − 500 lo deriva el sitio (STAY_DESCUENTO). Separos se quedan en $300.
-- Valores esperados en el WHERE: solo escribe si la ficha sigue en modo preventa.
-- Invisible al cliente hasta que Memo PUBLIQUE desde Esferas.
update esferas_eventos set
  cheap_only = false,
  zonas = '[{"n":"General","p":5300,"pc":3600},{"n":"Platino","p":6200,"pc":4500},{"n":"Coke Studio","p":6200,"pc":4500},{"n":"Doritos","p":6200,"pc":4500},{"n":"McCormick","p":6200,"pc":4500},{"n":"Osel","p":6200,"pc":4500},{"n":"Banco Azteca","p":5500,"pc":3800},{"n":"Megacable","p":5500,"pc":3800},{"n":"Oro","p":5500,"pc":3800},{"n":"Plus Ultra","p":5500,"pc":3800},{"n":"Barrera","p":5100,"pc":3400},{"n":"Butaca","p":4900,"pc":3200},{"n":"Preferente","p":4300,"pc":2600},{"n":"Luneta","p":4000,"pc":2300},{"n":"Balcón","p":3800,"pc":2100}]',
  cheap_zonas = '[{"n":"General","p":3600,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Platino","p":4500,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Coke Studio","p":4500,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Doritos","p":4500,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"McCormick","p":4500,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Osel","p":4500,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Banco Azteca","p":3800,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Megacable","p":3800,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Oro","p":3800,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Plus Ultra","p":3800,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Barrera","p":3400,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Butaca","p":3200,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Preferente","p":2600,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Luneta","p":2300,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null},{"n":"Balcón","p":2100,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null}]',
  ride = 2700,
  inc = '["Boleto zona elegida","Transporte Reynosa-Mty","Hospedaje compartido","Kit Conecta"]',
  nota = null,
  updated_at = now()
where slug = 'nsqkmty' and cheap_only = true and zonas is null and ride is null
  and cheap_zonas like '%Preventa a ciegas%'
returning slug, cheap_only, ride, sep, sep_cheap;
