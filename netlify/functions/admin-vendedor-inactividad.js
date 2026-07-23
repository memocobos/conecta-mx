// =============================================================================
// admin-vendedor-inactividad.js  (VENDEDORES F6 — panel admin del candado)
//
// La contraparte ADMIN del candado de inactividad (_lib/vendedor-activo):
//   · 'estado'    → maestro_roshi/bulma. Lista de vendedores con su reloj y
//        conteo de ventas: { id, nombre, correo, inicio, reactivado, ventas,
//        inactivo }. inactivo = pasó los 3 meses Y cero ventas. Best-effort:
//        si Portal falla, ventas:null e inactivo:false (jamás marcar sin datos).
//   · 'reactivar' {usuario_id} → SOLO maestro_roshi ("Dar otra oportunidad").
//        PATCH usuarios.vendedor_reactivado_at = ahora → el reloj cuenta desde
//        la reactivación. NO destructivo: ni borra ni cambia rol. Jamás on_conflict.
//
// Env: SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE (usuarios) +
//      PORTAL_SUPABASE_URL/PORTAL_SUPABASE_SERVICE_KEY (conteo de ventas).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { MESES_LIMITE, _masMesesFecha, _inicioVendedor } = require('./_lib/vendedor-activo');

const ACCIONES = {
  estado: ['maestro_roshi', 'bulma'],
  reactivar: ['maestro_roshi'],
};
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (s, b) => ({ statusCode: s, headers, body: JSON.stringify(b) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!__origin) return json(403, { error: 'Origen no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const accion = body.accion;
  if (!(accion in ACCIONES)) return json(400, { error: 'accion inválida' });

  const auth = verifyAdminAuth(event, ACCIONES[accion]);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  const env = readEnv();
  if (env.error) return json(500, { error: env.error });
  const kh = { apikey: env.KH_KEY, Authorization: 'Bearer ' + env.KH_KEY, 'Content-Type': 'application/json' };

  try {
    // ── estado: reloj + ventas de TODOS los vendedores ─────────────────────
    if (accion === 'estado') {
      const uR = await fetch(
        `${env.KH_URL}/rest/v1/usuarios?rol=eq.vendedor&select=id,nombre,correo,creado_en,vendedor_reactivado_at&limit=2000`,
        { headers: kh }
      );
      if (!uR.ok) return json(502, { error: 'KH rechazó usuarios', detail: await uR.text() });
      const vendedores = (await uR.json().catch(() => [])) || [];

      // Ventas por vendedor (Portal, best-effort — cualquier estado cuenta).
      let ventasPor = null;
      if (env.P_URL && env.P_KEY) {
        try {
          const vR = await fetch(
            `${env.P_URL}/rest/v1/solicitudes_tour?vendedor_id=not.is.null&select=vendedor_id&limit=10000`,
            { headers: { apikey: env.P_KEY, Authorization: 'Bearer ' + env.P_KEY } }
          );
          if (vR.ok) {
            ventasPor = {};
            ((await vR.json().catch(() => [])) || []).forEach(s => {
              const v = s && s.vendedor_id != null ? String(s.vendedor_id) : '';
              if (v) ventasPor[v] = (ventasPor[v] || 0) + 1;
            });
          }
        } catch (_) { ventasPor = null; }
      }

      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
      const out = vendedores.map(u => {
        const inicio = _inicioVendedor(u);
        const limite = inicio ? _masMesesFecha(inicio, MESES_LIMITE) : null;
        const ventas = ventasPor ? (ventasPor[String(u.id)] || 0) : null;
        // Sin datos de ventas (Portal caído) → NO se marca inactivo (best-effort).
        const inactivo = !!(limite && hoy > limite && ventas === 0);
        return {
          id: u.id, nombre: u.nombre, correo: u.correo,
          inicio, reactivado: u.vendedor_reactivado_at || null,
          limite, ventas, inactivo,
        };
      });
      return json(200, { ok: true, vendedores: out, ventas_ok: ventasPor !== null });
    }

    // ── reactivar: "Dar otra oportunidad" (reinicia el reloj) ──────────────
    if (accion === 'reactivar') {
      const id = String(body.usuario_id || '').trim();
      if (!UUID_RE.test(id)) return json(400, { error: 'usuario_id inválido' });

      // Solo aplica a vendedores (no tocar otros roles por accidente).
      const uR = await fetch(`${env.KH_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}&select=id,rol,nombre&limit=1`, { headers: kh });
      if (!uR.ok) return json(502, { error: 'KH rechazó la consulta', detail: await uR.text() });
      const [u] = (await uR.json().catch(() => [])) || [];
      if (!u) return json(404, { error: 'Usuario no encontrado' });
      if (u.rol !== 'vendedor') return json(400, { error: 'Ese usuario no es vendedor' });

      const ahora = new Date().toISOString();
      const pR = await fetch(`${env.KH_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...kh, Prefer: 'return=minimal' },
        body: JSON.stringify({ vendedor_reactivado_at: ahora }),
      });
      if (!pR.ok) return json(502, { error: 'No se pudo reactivar', detail: await pR.text() });
      return json(200, { ok: true, usuario_id: id, vendedor_reactivado_at: ahora });
    }

    return json(400, { error: 'accion inválida' });
  } catch (e) {
    return json(502, { error: 'Error en admin-vendedor-inactividad', detail: e.message });
  }
};

function readEnv() {
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KH_URL || !KH_KEY) return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  return { KH_URL, KH_KEY, P_URL: process.env.PORTAL_SUPABASE_URL, P_KEY: process.env.PORTAL_SUPABASE_SERVICE_KEY };
}
