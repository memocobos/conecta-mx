-- ═══════════════════════════════════════════════════════════════════════════
-- NSQK-PREVENTA-1 · nsqkmty pasa a PREVENTA A CIEGAS $300 (26-oct-2026)
-- Palabra de Memo, citada: «que tal si nsqkmty lo activamos como Pal Norte
-- con preventa de $300 … ya tengo que anunciar nsqk ya me andan preguntando»
-- + su elección firmada vía pregunta: «Sí, preventa a ciegas».
--
-- La ficha copia el MOLDE de palnorte (el que ya funciona, byte a byte en la
-- forma del JSON de cheap_zonas): concierto VIVO cheapOnly con UNA zona
-- «Preventa a ciegas» $300. sep/sep_cheap YA estaban en 300. A diferencia de
-- palnorte, la FECHA ES PÚBLICA (9-abr-2027): f_texto se queda NULL a
-- propósito — no hay nada que tapar.
--
-- ⚠️ EL COPY de `inc` (los beneficios del card) y `nota` son ADAPTACIÓN
-- conservadora de los de palnorte (sin inventar regalos que Memo no firmó:
-- la gorra y el gafete eran de Pa'l Norte). Memo los puede afinar en Esferas
-- ANTES del publish — el publish es suyo.
--
-- 🔒 ORDEN DEL ENCENDIDO (la regla de PN27): PUSH PRIMERO, PUBLISH DESPUÉS.
-- Esta ficha NO publica sola; si se publicara con el código viejo, nsqkmty
-- saldría como CHEAP normal sin el paquete único ni la requisición (el error
-- PN27-PAQ-1 repetido). El publish además avisa a su waitlist (1 anotado).
--
-- CORRIDA: 26-oct-2026 vía MCP. Candado: valores esperados en el WHERE
-- (status='proximamente', cheap_only=false, cheap_zonas NULL) — 1 fila.
-- ═══════════════════════════════════════════════════════════════════════════

update esferas_eventos set
  status      = '',
  cheap_only  = true,
  cheap_zonas = '[{"n":"Preventa a ciegas","p":300,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null}]',
  inc         = '["Costo preferencial en nuestra fase más baja","Prioridad para elegir tu zona y paquete al publicarse los costos","Tu separo de $300 se abona al paquete que elijas"]',
  nota        = 'PREVENTA A CIEGAS · Aparta tu lugar con solo $300. Zonas y costos por anunciarse — tu separo asegura el costo preferencial de la fase más baja.'
where slug = 'nsqkmty'
  and status = 'proximamente'
  and cheap_only = false
  and cheap_zonas is null;

-- Careo de salida (debe dar 1 fila con status='' y la zona de preventa):
-- select slug, status, cheap_only, cheap_zonas, inc, nota
--   from esferas_eventos where slug = 'nsqkmty';
