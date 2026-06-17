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
// SEGURIDAD (es pública): la respuesta expone SOLO nombres de zonas agotadas.
// NUNCA stock, vendidos, costos ni totales. Forma exacta:
//   { ok:true, evento_id, gestionado:<bool>, zonas_agotadas:[ "<nombre>", ... ] }
//   gestionado = el evento tiene al menos una compra registrada.
//
// Sin auth (NO verifyAdminAuth). Env vars: SUPABASE_*_KAMEHOUSE (KH) +
// PORTAL_SUPABASE_* (Portal). Read-only en ambos proyectos.
// =============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EVENTO_RE = /^[A-Za-z0-9_.#-]+$/;                       // slug del EV
const ESTADOS_CUENTAN = ['pendiente', 'en_pagos', 'pagado']; // cancelado libera

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
    // stock (KH legacy) + vendidos (Portal) en paralelo.
    const khHeaders = { apikey: env.KH_SB_SERVICE, Authorization: `Bearer ${env.KH_SB_SERVICE}` };
    const portalHeaders = { apikey: env.PORTAL_SB_SERVICE, Authorization: `Bearer ${env.PORTAL_SB_SERVICE}` };

    const compraParams = new URLSearchParams();
    compraParams.set('select', 'zona,cantidad');
    compraParams.append('evento_id', `eq.${evento_id}`);
    compraParams.set('limit', '10000');

    const ventaParams = new URLSearchParams();
    ventaParams.set('select', 'zona,num_personas,estado');
    ventaParams.append('evento_id', `eq.${evento_id}`);
    ventaParams.append('estado', `in.(${ESTADOS_CUENTAN.join(',')})`);
    ventaParams.set('limit', '10000');

    const [cRes, vRes] = await Promise.all([
      fetch(`${env.KH_SB_URL}/rest/v1/compras?${compraParams.toString()}`, { headers: khHeaders }),
      fetch(`${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?${ventaParams.toString()}`, { headers: portalHeaders }),
    ]);

    // Conservador: si CUALQUIERA falla, no devolvemos un resultado parcial (un
    // parcial podría sub-reportar "agotado" y causar sobreventa). 502 → el index
    // cae a sus flags manuales.
    if (!cRes.ok || !vRes.ok) return jsonRes(502, { ok: false, error: 'No se pudo calcular la disponibilidad' });

    const compras = await cRes.json();
    const ventas = await vRes.json();

    // stock por zona (KH). gestionado = hay al menos una compra registrada.
    const stockPorZona = {};
    (Array.isArray(compras) ? compras : []).forEach((c) => {
      const zona = (c && c.zona != null) ? String(c.zona).trim() : '';
      if (!zona) return;
      stockPorZona[zona] = (stockPorZona[zona] || 0) + (parseInt(c.cantidad, 10) || 0);
    });
    const gestionado = Array.isArray(compras) && compras.length > 0;

    // vendidos por zona (Portal), claves con trim.
    const vendidosPorZona = {};
    (Array.isArray(ventas) ? ventas : []).forEach((s) => {
      const zona = (s && s.zona != null) ? String(s.zona).trim() : '';
      if (!zona) return;
      const n = parseInt(s.num_personas, 10);
      if (!Number.isInteger(n) || n <= 0) return;
      vendidosPorZona[zona] = (vendidosPorZona[zona] || 0) + n;
    });

    // Agotada: zona con stock registrado y stock − vendidos <= 0. Solo nombres.
    const zonas_agotadas = Object.keys(stockPorZona).filter(
      (zona) => (stockPorZona[zona] - (vendidosPorZona[zona] || 0)) <= 0
    );

    return jsonRes(200, { ok: true, evento_id, gestionado, zonas_agotadas });
  } catch (e) {
    return jsonRes(502, { ok: false, error: 'No se pudo calcular la disponibilidad' });
  }
};

// ----- helpers -----

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) return { error: 'Faltan env vars Portal (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  return { KH_SB_URL, KH_SB_SERVICE, PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
