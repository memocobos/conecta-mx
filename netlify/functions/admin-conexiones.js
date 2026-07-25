// =============================================================================
// admin-conexiones.js — Tablero de conexiones del Resumen (SOLO maestro_roshi).
//
// Memo quiere ver a qué hora se conecta cada quien — sobre todo las auxiliares
// (contrato: entrada 9:00 AM Monterrey). Lee `kh_conexiones` (append-only que
// auth-login escribe en cada login exitoso) + `usuarios`. Solo LECTURA.
//
// Acciones (POST { accion, ... }):
//   · 'hoy'        → cada usuario ACTIVO con su PRIMERA y ÚLTIMA conexión de HOY
//                    (hora America/Monterrey). Sin conexión hoy → primera/ultima null.
//   · 'historial'  { usuario_id } → últimas 14 fechas (MX) con su primera conexión,
//                    para ver patrones (incl. sábados).
//
// Zona horaria SIEMPRE America/Monterrey (vía Intl, sin aritmética de offset).
// Privacidad: horas de conexión SOLO para Memo — gate ['maestro_roshi'] aquí y
// en la UI. Fails-soft: tabla vacía/inexistente → listas vacías, nunca 500 por eso.
// Env: SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE + JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const ROLES = ['maestro_roshi'];
const TZ = 'America/Monterrey';
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Partes de un timestamp en hora de Monterrey (Intl → sin depender del offset).
function mxParts(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const p = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  const hh = (p.hour === '24') ? '00' : p.hour;   // Intl a veces da '24' a medianoche
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${hh}:${p.minute}`, min: parseInt(hh, 10) * 60 + parseInt(p.minute, 10) };
}
function hoyMx() { return mxParts(new Date().toISOString()).fecha; }

exports.handler = async (event) => {
  const origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (s, b) => ({ statusCode: s, headers, body: JSON.stringify(b) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!origin) return json(403, { error: 'Origen no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

  // 🔒 Privacidad: SOLO Memo (aquí, no solo en la UI).
  const auth = verifyAdminAuth(event, ROLES);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_URL || !KH_KEY) return json(500, { error: 'Faltan env vars KH' });
  const kh = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  const enc = encodeURIComponent;

  // Lee kh_conexiones desde `sinceIso` (fails-soft: tabla ausente/err → []).
  async function leerConexiones(sinceIso, extraFilter) {
    try {
      const q = `ts=gte.${enc(sinceIso)}${extraFilter || ''}&select=usuario_id,ts&order=ts.asc&limit=20000`;
      const r = await fetch(`${KH_URL}/rest/v1/kh_conexiones?${q}`, { headers: kh });
      if (!r.ok) return [];
      const rows = await r.json().catch(() => []);
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }

  const accion = body.accion;

  try {
    // ── hoy: primera/última conexión de HOY (MX) por usuario activo ──────────
    if (accion === 'hoy') {
      const hoy = hoyMx();
      // Ventana amplia (~40h) para cubrir el día MX completo sin aritmética de offset.
      const since = new Date(Date.now() - 40 * 3600 * 1000).toISOString();
      const rows = await leerConexiones(since);
      const porUsuario = {};   // uid → { primera:{hora,min}, ultima:{hora,min} }
      for (const row of rows) {
        const mp = mxParts(row.ts);
        if (!mp || mp.fecha !== hoy) continue;   // solo HOY en MX
        const uid = String(row.usuario_id || '');
        if (!uid) continue;
        const cur = porUsuario[uid];
        if (!cur) { porUsuario[uid] = { primera: mp, ultima: mp }; }
        else {
          if (mp.min < cur.primera.min) cur.primera = mp;
          if (mp.min > cur.ultima.min) cur.ultima = mp;
        }
      }
      // Usuarios activos (nombre + rol). Fails-soft.
      let usuarios = [];
      try {
        const ur = await fetch(`${KH_URL}/rest/v1/usuarios?activo=eq.true&select=id,nombre,rol&order=nombre.asc&limit=2000`, { headers: kh });
        if (ur.ok) usuarios = (await ur.json().catch(() => [])) || [];
      } catch { usuarios = []; }
      const out = usuarios.map((u) => {
        const c = porUsuario[String(u.id)] || null;
        return {
          id: u.id, nombre: u.nombre || '(sin nombre)', rol: u.rol || '',
          primera: c ? c.primera.hora : null,
          ultima: c ? c.ultima.hora : null,
          primera_min: c ? c.primera.min : null,
        };
      });
      return json(200, { ok: true, hoy_mx: hoy, entrada_mx: '09:00', tolerancia_min: 15, usuarios: out });
    }

    // ── historial: últimas 14 fechas (MX) con la primera conexión de cada una ─
    if (accion === 'historial') {
      const uid = String(body.usuario_id || '').trim();
      if (!UUID_RE.test(uid)) return json(400, { error: 'usuario_id inválido' });
      const since = new Date(Date.now() - 16 * 24 * 3600 * 1000).toISOString();
      const rows = await leerConexiones(since, `&usuario_id=eq.${enc(uid)}`);
      const porFecha = {};   // fechaMX → primera {hora,min}
      for (const row of rows) {
        const mp = mxParts(row.ts);
        if (!mp) continue;
        const f = porFecha[mp.fecha];
        if (!f || mp.min < f.min) porFecha[mp.fecha] = mp;
      }
      const dias = Object.keys(porFecha).sort().reverse().slice(0, 14)
        .map((fecha) => ({ fecha, primera: porFecha[fecha].hora, primera_min: porFecha[fecha].min }));
      return json(200, { ok: true, usuario_id: uid, entrada_mx: '09:00', tolerancia_min: 15, dias });
    }

    return json(400, { error: 'accion inválida' });
  } catch (e) {
    return json(502, { error: 'Error en admin-conexiones', detail: e.message });
  }
};
