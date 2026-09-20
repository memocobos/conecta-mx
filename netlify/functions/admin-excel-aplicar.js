// =============================================================================
// admin-excel-aplicar — EL BOTÓN QUE APLICA EL CAREO (CUADRE-1b)
// =============================================================================
// Body: { evento_id, confirmar?:true, solo?:'abonos'|'totales'|'altas', claves?:[] }
// → sin `confirmar`: { ok, plan:{abonos,totales,altas,negativas,saltados} }
// → con `confirmar`: { ok, plan, resultado:{abonos,totales,altas,errores} }
//
// Es lo que Jane hacía a mano con SQL cada noche. Roles maestro_roshi y bulma,
// mismo molde que el careo.
//
// ═══ LA REGLA DE ORO: EL SERVIDOR RECALCULA ═══════════════════════════════
// El navegador manda `evento_id` y QUÉ aplicar. NUNCA montos. Aquí se corre el
// careo COMPLETO otra vez —cosecha fresca del Excel, base fresca— y se escribe
// sobre ESE resultado. Un JSON viejo del cliente diciendo «págale $5,000 a
// Fulano» es la mentira perfecta: llega firmada por un admin de verdad y no
// hay forma de distinguirla de la buena.
//
// 🔒 Y DE AHÍ SALE LA IDEMPOTENCIA, que NO es un candado de UNIQUE: tras la
// primera pasada el careo fresco ya no encuentra esas diferencias, así que el
// segundo clic no tiene nada que escribir. Aplicar dos veces es inofensivo
// porque la pregunta se vuelve a hacer, no porque la base rechace la repetida.
//
// ⚠️ EL PRESUPUESTO DE TIEMPO ES REAL. Medido el 20-sep contra producción: la
// cosecha del Apps Script tarda ~2 s (7 s en frío) y Netlify corta a los 10.
// Por eso los abonos van en UN SOLO INSERT de arreglo y los totales en PATCHes
// en paralelo por tandas — no por elegancia, por el reloj.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { correrCareo, SB_URL } = require('./_lib/excel-careo-correr');
const { planear, MONTONES_APLICABLES, ejecutarPlan } = require('./_lib/excel-aplicar');

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin', 'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const eventoId = (typeof body.evento_id === 'string') ? body.evento_id.trim() : '';
  if (!eventoId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta evento_id' }) };

  // 🔒 LA LISTA BLANCA, ANTES DE TOCAR NADA. `solo:'bajas'` y `solo:'ambiguos'`
  // se rehúsan aquí: no es que no encuentren filas, es que NO TIENEN PUERTA.
  // Una baja es una persona y sigue pidiendo firma; elegir entre dos homónimos
  // es inventar el dato que falta.
  const solo = body.solo == null ? null : String(body.solo);
  if (solo && !MONTONES_APLICABLES.includes(solo)) {
    return { statusCode: 400, headers, body: JSON.stringify({
      error: `«${solo}» no se aplica desde aquí. Se puede: ${MONTONES_APLICABLES.join(', ')}.`
           + ' Las BAJAS y los AMBIGUOS no se aplican nunca: una baja es una persona y espera firma,'
           + ' y elegir entre dos homónimos sería inventar el dato que falta.',
      codigo: 'MONTON_NO_APLICABLE' }) };
  }
  const claves = Array.isArray(body.claves) ? body.claves.map(String).slice(0, 2000) : null;

  // ── EL CAREO, FRESCO ──────────────────────────────────────────────────────
  const careo = await correrCareo(eventoId);
  if (careo.error) {
    const e = careo.error;
    return { statusCode: e.status || 502, headers, body: JSON.stringify({
      error: e.mensaje, codigo: e.codigo, detail: e.detail, pestana: e.pestana, pestanas: e.pestanas }) };
  }

  const plan = planear(careo, { solo, claves });
  const pestanaNombre = (careo.pestanas || []).map((p) => p.pestana).join(' + ');

  // ── VISTA PREVIA OBLIGATORIA ──────────────────────────────────────────────
  // Sin `confirmar`, NO SE ESCRIBE NADA. El patrón del puente al Portal: se
  // enseñan NOMBRES y MONTOS y un segundo clic confirma. Un número pelón no se
  // confirma.
  if (body.confirmar !== true) {
    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true, evento_id: eventoId, pestanas: pestanaNombre, confirmado: false, plan,
      resumen: { abonos: plan.abonos.length, monto_abonos: plan.abonos.reduce((a, x) => a + x.monto, 0),
                 totales: plan.totales.length, altas: plan.altas.length,
                 negativas: plan.negativas.length, saltados: plan.saltados.length } }) };
  }

  const resultado = await ejecutarPlan({
    plan, eventoId, pestanaNombre,
    quien: (auth.user && (auth.user.nombre || auth.user.username || auth.user.correo)) || (auth.user && auth.user.id) || 'careo',
    origin: __origin,
    authHeader: (event.headers && (event.headers.authorization || event.headers.Authorization)) || '',
    SB_URL,
  });
  return { statusCode: 200, headers, body: JSON.stringify({
    ok: true, evento_id: eventoId, pestanas: pestanaNombre, confirmado: true, plan, resultado,
    resumen: { abonos: resultado.abonos.length, monto_abonos: resultado.abonos.reduce((a, x) => a + x.monto, 0),
               totales: resultado.totales.length, altas: resultado.altas.length,
               negativas: plan.negativas.length, saltados: plan.saltados.length,
               errores: resultado.errores.length } }) };
};
