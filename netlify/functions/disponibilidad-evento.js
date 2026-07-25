// =============================================================================
// disponibilidad-evento.js — Función PÚBLICA de disponibilidad (Capa 2, Tuerca
// 2c-i del Palacio de Kamisama). La consume el index (sitio público, SIN login)
// para apagar solo las zonas agotadas según el inventario real.
//
// Cruza DOS proyectos (read-only en ambos):
//   - stock    = suma de `cantidad` en `compras` (KH legacy), por zona.
//   - vendidos = suma de `num_personas` en `solicitudes_tour` (Portal) con
//                estado en (pendiente,en_pagos,pagado), por zona (match por
//                nombre con .trim()).
// Una zona está AGOTADA si tiene stock registrado (aparece en compras) y
// stock − vendidos <= 0.
//
// SEGURIDAD (es pública): la respuesta expone SOLO nombres de zonas (gestionadas
// y agotadas) y, para urgencia, cuántas quedan cuando son POCAS (≤5). NUNCA el
// stock total, vendidos, costos ni totales. Forma exacta:
//   { ok:true, evento_id, gestionado:<bool>,
//     zonas_gestionadas:[ "<nombre>", ... ], zonas_agotadas:[ "<nombre>", ... ],
//     zonas_pocas:{ "<nombre>": <restante 1..5> } }
//   gestionado          = el evento tiene al menos una compra registrada.
//   zonas_gestionadas   = zonas con stock registrado (cualquier compra, aunque
//                         el disponible siga > 0). Las que el Palacio controla.
//   zonas_agotadas      = subconjunto de zonas_gestionadas con disponible <= 0.
//   zonas_pocas         = subconjunto con 0 < restante ≤ 5 (para "¡quedan N!").
//                         Solo se exponen números chicos (urgencia), nunca el total.
//
// FASE B: usa _lib/disponibilidad (fuente única) → resta vendidos_fuera del
// stock_ajustes y aplica la regla de conteo con reloj de 15 min. Extiende, no
// duplica: la lib es la misma que usan el candado y Vendedores F2.
//
// Sin auth (NO verifyAdminAuth). Env vars: SUPABASE_*_KAMEHOUSE (KH) +
// PORTAL_SUPABASE_* (Portal). Read-only en ambos proyectos.
// =============================================================================

const { cargarDisponibilidad, evaluarZona } = require('./_lib/disponibilidad');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EVENTO_RE = /^[A-Za-z0-9_.#-]+$/;                       // slug del EV
const POCAS_UMBRAL = 5;                                       // "¡quedan N!" si restante ≤ 5

function jsonRes(statusCode, body) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return jsonRes(405, { ok: false, error: 'Method not allowed' });

  const env = readEnv();
  if (env.error) return jsonRes(500, { ok: false, error: env.error });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return jsonRes(400, { ok: false, error: 'JSON inválido' }); }

  const evento_id = String(body.evento_id || '').trim();
  if (!evento_id || !EVENTO_RE.test(evento_id) || evento_id.length > 120) {
    return jsonRes(400, { ok: false, error: 'evento_id inválido' });
  }

  try {
    // Fuente única: _lib/disponibilidad (compras + stock_ajustes en KH, ventas en
    // Portal, con la regla de conteo de reloj de 15 min).
    const disp = await cargarDisponibilidad({
      khUrl: env.KH_SB_URL, khKey: env.KH_SB_SERVICE,
      portalUrl: env.PORTAL_SB_URL, portalKey: env.PORTAL_SB_SERVICE,
      evento_id,
    });
    // Conservador: si no se pudo calcular (cualquier fetch falló), NO devolvemos un
    // parcial (sub-reportaría "agotado" → sobreventa). 502 → el index cae a sus
    // flags manuales.
    if (disp.error) return jsonRes(502, { ok: false, error: 'No se pudo calcular la disponibilidad' });

    // Gestionadas: zonas con stock registrado (las que el Palacio controla).
    const zonas_gestionadas = Object.keys(disp.stockPorZona || {});
    const zonas_agotadas = [];
    const zonas_pocas = {};
    zonas_gestionadas.forEach((zona) => {
      const ev = evaluarZona(disp, zona, 1);
      if (ev.restante <= 0) zonas_agotadas.push(zona);
      else if (ev.restante <= POCAS_UMBRAL) zonas_pocas[zona] = ev.restante; // urgencia: solo números chicos
    });

    return jsonRes(200, {
      ok: true, evento_id, gestionado: !!disp.gestionado,
      zonas_gestionadas, zonas_agotadas, zonas_pocas,
    });
  } catch (e) {
    return jsonRes(502, { ok: false, error: 'No se pudo calcular la disponibilidad' });
  }
};

// ----- helpers -----

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) return { error: 'Faltan env vars Portal (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  return { KH_SB_URL, KH_SB_SERVICE, PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
