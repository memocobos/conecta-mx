// =============================================================================
// portal-revision  (PORTAL-SOLO-1 — «Aún no vemos tu viaje»)  27-oct-2026
// =============================================================================
// El Portal ya no vende. Quien entra y NO ve su viaje (porque su fila de
// KameHouse no trae su correo, o trae otro) pide que lo liguemos: evento +
// nombre como lo dio al reservar + WhatsApp. Cae a la bandeja de KameHouse como
// «Ligar Portal»; Bulma/Milk/Memo buscan la fila, la ligan, REVISAN sus números
// y la publican (`admin-portal-revision`).
//
//   · `eventos` → los eventos que vienen (2026/2027), para el formulario.
//   · `ligar`   → nace la solicitud (tope 3 pendientes por correo; una por evento).
//
// 🔒 «Suyo» = el correo VERIFICADO del JWT del Portal. Nada de lo que mande el
// navegador escribe en `viajeros_evento`: aquí solo nace una solicitud.
// =============================================================================
const PR = require('./_lib/portal-revision');

const MAX_LIGAR = 3;
function json(status, headers, body) { return { statusCode: status, headers, body: JSON.stringify(body) }; }

// «Hoy» en Reynosa (la ley de toISOString: de noche ya es mañana en Greenwich).
function hoyMx() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' }); }

// Los eventos que vienen, por fecha. Una multifecha se ofrece fecha por fecha
// (`slug#N`), porque así vive la fila en KameHouse.
function eventosQueVienen(EV, hoy) {
  const out = [];
  (Array.isArray(EV) ? EV : []).forEach((e) => {
    if (!e || !e.id || e._past) return;
    if (Array.isArray(e.multifecha) && e.multifecha.length) {
      e.multifecha.forEach((m, i) => {
        const ds = (m && m.ds) || e.ds || '';
        if (ds && ds >= hoy) out.push({ id: e.id + '#' + i, nombre: e.a || e.id, fecha: (m && (m.lbl || m.f)) || e.f || '', ds });
      });
    } else if (e.ds && e.ds >= hoy) {
      out.push({ id: e.id, nombre: e.a || e.id, fecha: e.f || '', ds: e.ds });
    }
  });
  return out.sort((a, b) => (a.ds < b.ds ? -1 : a.ds > b.ds ? 1 : 0));
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, headers, { ok: false, error: 'Solo POST' });

  const PT_URL = process.env.PORTAL_SUPABASE_URL;
  const PT_ANON = process.env.PORTAL_SUPABASE_ANON_KEY;
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!PT_URL || !PT_ANON || !KH_URL || !KH_KEY) return json(500, headers, { ok: false, error: 'Faltan env vars' });

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return json(401, headers, { ok: false, error: 'Inicia sesión otra vez' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, headers, { ok: false, error: 'Cuerpo inválido' }); }
  const accion = String(body.accion || '');
  if (!['eventos', 'ligar'].includes(accion)) return json(400, headers, { ok: false, error: 'Acción desconocida' });

  let user;
  try {
    const r = await fetch(`${PT_URL}/auth/v1/user`, { headers: { apikey: PT_ANON, Authorization: 'Bearer ' + jwt } });
    if (!r.ok) return json(401, headers, { ok: false, error: 'Tu sesión venció: entra otra vez' });
    user = await r.json();
  } catch (_) { return json(502, headers, { ok: false, error: 'No pude validar tu sesión' }); }
  const correo = PR.normCorreo(user && user.email);
  if (!correo || !user.email_confirmed_at) return json(403, headers, { ok: false, error: 'Confirma tu correo primero' });

  let EV;
  try { EV = await require('./_lib/catalogo-index').fetchEventosRaw(); } catch (_) { EV = null; }
  if (!Array.isArray(EV)) return json(502, headers, { ok: false, error: 'No pude leer los eventos, intenta en un momento' });
  const lista = eventosQueVienen(EV, hoyMx());

  if (accion === 'eventos') return json(200, headers, { ok: true, eventos: lista });

  // ── ligar ────────────────────────────────────────────────────────────────
  const evento_id = String(body.evento_id || '').trim();
  const ev = lista.find((e) => e.id === evento_id);
  if (!ev) return json(400, headers, { ok: false, error: 'Elige tu evento de la lista' });
  const nombre = String(body.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (nombre.split(' ').filter((w) => w.length >= 2).length < 2) return json(400, headers, { ok: false, error: 'Escribe tu nombre con apellido, como lo diste al reservar' });
  const celular = String(body.celular || '').replace(/\D/g, '').slice(-10);
  if (celular.length !== 10) return json(400, headers, { ok: false, error: 'Tu WhatsApp debe tener 10 dígitos' });
  const nota = String(body.nota || '').trim().slice(0, 300) || null;

  const hKH = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  const rp = await fetch(`${KH_URL}/rest/v1/${PR.TABLA}?correo=eq.${encodeURIComponent(correo)}&tipo=eq.ligar&estado=eq.pendiente&select=id,evento_id&limit=10`, { headers: hKH });
  if (!rp.ok) return json(502, headers, { ok: false, error: 'No pude revisar tus solicitudes, intenta en un momento' });
  const pend = await rp.json();
  if (pend.some((p) => p.evento_id === evento_id)) return json(409, headers, { ok: false, error: 'Ya nos pediste ese viaje: lo estamos revisando y te avisamos por correo.' });
  if (pend.length >= MAX_LIGAR) return json(409, headers, { ok: false, error: 'Ya tienes varias solicitudes en revisión: espera nuestra respuesta por correo.' });

  const ins = await fetch(`${KH_URL}/rest/v1/${PR.TABLA}`, {
    method: 'POST', headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ tipo: 'ligar', correo, evento_id, nombre_dado: nombre, celular, nota_cliente: nota }),
  });
  if (ins.status === 409) return json(409, headers, { ok: false, error: 'Ya nos pediste ese viaje: lo estamos revisando y te avisamos por correo.' });
  if (!ins.ok) return json(502, headers, { ok: false, error: 'No pude enviar tu solicitud, intenta en un momento' });
  const fila = (await ins.json())[0] || {};
  return json(200, headers, { ok: true, solicitud: { id: fila.id, evento_id, evento: ev.nombre, fecha: ev.fecha } });
};

module.exports._eventosQueVienen = eventosQueVienen;
