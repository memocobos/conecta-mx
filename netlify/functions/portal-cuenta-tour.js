// =============================================================================
// portal-cuenta-tour  (Gancho 2 del machote — cuenta bancaria correcta del tour)
//
// El plan de pagos del portal se lee client-side (supabase-js + RLS), así que no
// hay una function que "alimente el plan" a la que colgarse: esta es la pieza
// mínima que calcula SERVER-SIDE la cuenta bancaria correcta según el PAQUETE de
// la solicitud, usando la FUENTE ÚNICA cuentaParaPaquete de _lib. El front la pide
// al pintar el plan y, si no llega, cae al texto de siempre (link a /pagos).
//
// Solo el TITULAR de la solicitud recibe la cuenta (mismo posture que el resto del
// portal). No expone nada más que { banco, titular, tarjeta, clabe }.
//
//   POST { solicitud_id } (Authorization: Bearer <jwt>) → { ok, cuenta|null }
//
// Best-effort ESTRICTO: cualquier fallo (catálogo caído, evento no encontrado, no
// titular) → { ok:true, cuenta:null }. Nunca 5xx que rompa el portal.
//
// Env: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY, PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const { fetchCatalogo } = require('./_lib/catalogo-index');
const { resolverCuentaDeCatalogo } = require('./_lib/cuenta-deposito');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON    = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) {
    // Config faltante: no rompemos el portal, devolvemos sin cuenta.
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, cuenta: null }) };
  }

  const nada = { statusCode: 200, headers, body: JSON.stringify({ ok: true, cuenta: null }) };

  try {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return nada; }
    const solicitudId = body && typeof body.solicitud_id === 'string' ? body.solicitud_id.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(solicitudId)) return nada;

    // 1) JWT → user
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!jwt) return nada;
    const uR = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt } });
    if (!uR.ok) return nada;
    const user = await uR.json().catch(() => null);
    if (!user || !user.id) return nada;

    const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE };

    // 2) cliente_id del usuario (CU)
    const cliR = await fetch(`${SB_URL}/rest/v1/clientes?auth_user_id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`, { headers: sb });
    if (!cliR.ok) return nada;
    const CU = ((await cliR.json().catch(() => []))[0] || {}).id;
    if (!CU) return nada;

    // 3) Solicitud (evento_id + paquete) — solo si el usuario es su TITULAR.
    const sR = await fetch(
      `${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}&select=evento_id,paquete,cliente_id,estado&limit=1`,
      { headers: sb }
    );
    if (!sR.ok) return nada;
    const sol = ((await sR.json().catch(() => []))[0]) || null;
    if (!sol || String(sol.cliente_id) !== String(CU) || sol.estado === 'cancelado') return nada;

    // 4) Cuenta por paquete (FUENTE ÚNICA). Best-effort: sin catálogo/evento → null.
    const catalogo = await fetchCatalogo();
    const c = resolverCuentaDeCatalogo(catalogo, sol.evento_id, sol.paquete);
    if (!c) return nada;

    // Mapear al shape que espera el portal: { banco, titular, tarjeta, clabe }.
    const cuenta = { banco: c.nombre || '', titular: c.titular || '', tarjeta: c.tarjeta || '', clabe: c.clabe || '' };
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, cuenta }) };
  } catch (e) {
    return nada;
  }
};
