-- ═══════════════════════════════════════════════════════════════════════════
-- FR-PROX-1 · EL 15 Y 16 DE ENERO PASAN DE AGOTADO A PRÓXIMAMENTE (29-oct-2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Palabra de Memo, citada: «puedes poner opcion de que las fechas en el
-- multifecha en esferas se puedan poner en lugar de agotado tambien opcion de
-- Proximamente, como ahorita en fuerza regida que aun no puedo abrir las
-- fechas 15 y 16 y las puse en agotado pero quiero mejor ponerlas como
-- proximamente».
--
-- ⚠️ ESTA ACTA ES EL REGISTRO: el UPDATE YA CORRIÓ el 29-oct-2026 vía MCP
-- contra KH, con VALOR ESPERADO en el WHERE (el md5 del multifecha de ese
-- momento — 4 fechas con el 15/16 agotados a mano por Memo). Re-correrla
-- escribe CERO filas.
--
-- LA FORMA (dos niveles, y los dos hacen falta):
--  · `"prox": 1` en la ENTRADA de la fecha → es lo que lee buildFechaButtons
--    del index: el botón del día sale DESHABILITADO con «↻ Próximamente».
--  · `prox:1` (sin ag) en TODAS las zonas de esa fecha → es lo que frena al
--    SERVIDOR (_calcularPrecio: «zona aún no disponible (próximamente)») y lo
--    que la derivación del global (ESF-UX-2c) ya sabe leer: una zona viva solo
--    en fechas prox sale PRÓXIMAMENTE en la tarjeta, ni abierta ni agotada.
-- El código que faltaba (el prox de ENTRADA lo tiraba el compilador — un
-- lector sin escritor) entró en el MISMO commit: parseMultifecha lo conserva,
-- multifechaTexto lo emite al final (sin prox = byte-igual que antes, careado
-- por round-trip), y Esferas gana el botón «↻ Próximamente» por fecha.

-- ── El UPDATE (CORRIDO 29-oct, 1 fila) ──────────────────────────────────────
with ficha as (select multifecha::jsonb as mf from esferas_eventos where slug = 'fuerzaregida'),
rearmada as (
  select jsonb_agg(
    case when f.ord - 1 in (2, 3) then
      jsonb_set(jsonb_set(jsonb_set(f.val, '{prox}', '1'::jsonb),
        '{zonas}', (select jsonb_agg(z.val || '{"ag": 0, "prox": 1}'::jsonb order by z.ord)
                    from jsonb_array_elements(f.val->'zonas') with ordinality as z(val, ord))),
        '{cheapZonas}', (select jsonb_agg(z.val || '{"ag": 0, "prox": 1}'::jsonb order by z.ord)
                    from jsonb_array_elements(f.val->'cheapZonas') with ordinality as z(val, ord)))
    else f.val end
    order by f.ord) as mf_nuevo
  from ficha, jsonb_array_elements(ficha.mf) with ordinality as f(val, ord)
)
update esferas_eventos ev
set multifecha = r.mf_nuevo::text
from rearmada r
where ev.slug = 'fuerzaregida'
  -- 🔒 VALOR ESPERADO: la foto exacta pre-tuerca (15/16 con 60 zonas ag:1 a mano)
  and md5(ev.multifecha) = '81241dea5eb7aabe70f421eca3db99c4'
  and jsonb_array_length(ev.multifecha::jsonb) = 4;
-- → UPDATE 1 · careo de salida (query FRESCA):
--   #0 «11 Enero» sin prox · 10 ag (intacta) · #1 «12 Enero» ídem
--   #2 «15 Enero» prox_entrada 1 · 15+15 zonas prox:1 · 0 ag
--   #3 «16 Enero» prox_entrada 1 · 15+15 zonas prox:1 · 0 ag

-- ── VERIFICADO POR EL DUEÑO (mide:fr-prox-1 — 46 verdes, 0 rojos, 29-oct) ──
--  · round-trip del compilador: una entrada SIN prox emite byte-igual al index
--  · compilarEV con la ficha real: #2/#3 emiten prox:1 (entrada y zonas),
--    f dice «11, 12, 15 y 16 ene 2027», global Platino deriva PRÓXIMAMENTE
--    (ag en 11/12 + prox en 15/16) y Cancha VIP sigue abierta
--  · buildFechaButtons REAL del index: botones del 15/16 DESHABILITADOS con
--    «Próximamente»; 11/12 vivos
--  · _calcularPrecio: fecha_idx 2/3 REBOTAN; #0 sigue cotizando ($5,900/$300)
--  · los 3 verbos del editor: Próximamente escribe entrada+zonas · Agotar
--    quita el prox · Reabrir quita ag Y prox (entrada y zonas)
--  · MF_ADMINISTRADAS ganó 'prox' (sin eso la preservación re-insertaría el
--    prox quitado) · sabotaje a la emisión mordido y restaurado byte a byte
--
-- 🔒 EL ENCENDIDO ES EL PUBLISH DE MEMO DESDE ESFERAS (el código del
-- compilador/editor SÍ pide push primero: el publish corre en Netlify con el
-- compilador desplegado — ORDEN: push → publish, la regla de PN27).
