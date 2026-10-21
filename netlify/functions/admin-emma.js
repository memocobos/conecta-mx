// =============================================================================
// admin-emma  [EMMA-1 · 21-oct-2026]
//
// EMMA KAIOSAMA, el juez que decide a dónde va cada alma: Memo escribe el
// mensaje y Emma lo despacha a quien él elija. Nació como admin-correo-equipo
// (solo equipo), creció a las tres audiencias como «Shenron» y Memo lo
// renombró el mismo día, antes de estrenarse: «Shenron no me gusta… mejor
// déjalo en Emma Kaiosama» — y los botones SIN nombres temáticos.
//
// POST { audiencia, asunto, mensaje, seco?, confirmar?, desde?, ...según audiencia }
//   · audiencia (LISTA CERRADA, sin default — elegir a quién es una ATRIBUCIÓN,
//     DEFAULTS-1):
//       'equipo'    + roles?: subconjunto de ROLES_EQUIPO (default coordinador+
//                    mister_popo) → usuarios activos con correo.
//       'creadoras' → contratos_creadores creadora/creadora_team VIGENTES
//                    (firmado o pendiente, evento sin pasar hace más de 3 días —
//                    la regla del cajón «pasado» de CTR-FILTROS-1), dedup correo.
//       'evento'    + evento_id (slug) → viajeros_evento del evento Y sus fechas
//                    hija (exacto o `slug#…` — un prefijo no es un ancla: bruno
//                    NO caza brunomars2), solo clientes (tipo_viajero null o
//                    'cliente'), sin bajas (boletos > 0), dedup correo.
//   · asunto 5-120 · mensaje 10-4000 TEXTO PLANO (se escapa; línea en blanco =
//     párrafo) — la forma del `libre` de GENKIDAMA-2.
//   · SECO ES EL DEFAULT: contesta { total, audiencia (nombres+correos),
//     html_muestra } y CERO envíos. Mandar = seco:false Y confirmar:true
//     (dos gestos, MIG-1d-ii). CORREOS_MODO está en 'real'.
//   · TANDAS: máximo 30 envíos por llamada sobre la lista ORDENADA por correo;
//     `desde` (índice) → contesta { enviados, errores, siguiente|null, total }.
//     La pantalla orquesta las tandas (el patrón de khExcelRecorrer/blast).
//
// 🔒 SOLO maestro_roshi: la pluma es de Memo.
// 🔒 SIN bitácora A PROPÓSITO (el precedente de contratos-alerta-cron): esto es
//    mensajería puntual, no campaña. Si la respuesta de una tanda se pierde y
//    se repite, esa tanda llega doble — dicho aquí y en la pantalla. Para
//    campañas masivas con dedup, energía y bajas existe GENKIDAMA: Emma no
//    la reemplaza y la pantalla lo dice.
// 🔒 El envío va por L.enviarCorreo (_lib/creadoras): MISMO FROM y correo-guard.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const L = require('./_lib/creadoras');

const ROLES_EQUIPO = ['coordinador', 'mister_popo', 'bulma', 'milk', 'cc'];
// [EMMA-1c] 20 por llamada: con el freno de 150 ms, 30 rozaba los 10 s de Netlify.
const TANDA = 20;
const SLUG_RE = /^[a-z0-9-]+(#\d+)?$/;

function render(asunto, mensaje) {
  // Cada bloque lleva SU color (ley de CONFIRMA-1: los clientes de correo no
  // heredan el color del contenedor).
  const parrafos = String(mensaje).split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 14px;color:#111111;font-size:14px;line-height:1.6">${L.esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff">
    <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#666666;margin-bottom:6px"><b style="color:#ff283b">Conecta</b> Reynosa</div>
    <h2 style="margin:0 0 16px;color:#111111;font-size:19px">${L.esc(asunto)}</h2>
    ${parrafos}
  </div>`;
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = { 'Access-Control-Allow-Origin': __origin || 'null', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
  const res = (s, o) => ({ statusCode: s, headers, body: JSON.stringify(o) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  if (!__origin) return res(403, { error: 'Origen no permitido' });

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return res(auth.status, { error: auth.error });

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return res(400, { error: 'JSON inválido' }); }

  const asunto = String(body.asunto || '').trim();
  const mensaje = String(body.mensaje || '').trim();
  if (asunto.length < 5 || asunto.length > 120) return res(400, { error: 'El asunto va de 5 a 120 caracteres' });
  if (mensaje.length < 10 || mensaje.length > 4000) return res(400, { error: 'El mensaje va de 10 a 4,000 caracteres (texto plano)' });

  const audKind = String(body.audiencia || '');
  if (!['equipo', 'creadoras', 'evento'].includes(audKind)) {
    return res(400, { error: "Elige la audiencia: 'equipo', 'creadoras' o 'evento' (no hay default a propósito)" });
  }

  const URL_ = process.env.SUPABASE_URL_KAMEHOUSE, KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!URL_ || !KEY) return res(500, { error: 'Faltan env vars KH' });
  const sbH = { apikey: KEY, Authorization: 'Bearer ' + KEY };
  const get = async (u) => { const r = await fetch(u, { headers: sbH }); if (!r.ok) throw new Error((await r.text()).slice(0, 200)); return r.json(); };
  const hoy = L.hoyMx();

  // ── LA AUDIENCIA, derivada de la base (jamás una lista pegada) ─────────────
  let brutos = [];
  try {
    if (audKind === 'equipo') {
      const roles = Array.isArray(body.roles) && body.roles.length ? body.roles.map(String) : ['coordinador', 'mister_popo'];
      const malos = roles.filter((r) => !ROLES_EQUIPO.includes(r));
      if (malos.length) return res(400, { error: 'Roles desconocidos: ' + malos.join(', ') + '. Válidos: ' + ROLES_EQUIPO.join(', ') });
      brutos = (await get(`${URL_}/rest/v1/usuarios?activo=eq.true&rol=in.(${roles.join(',')})&select=nombre,correo&limit=300`));
    } else if (audKind === 'creadoras') {
      const cs = await get(`${URL_}/rest/v1/contratos_creadores?plantilla=in.(creadora,creadora_team)&estado=in.(firmado,pendiente)&select=creador_nombre,creador_email,evento_fecha&limit=500`);
      brutos = cs.filter((c) => {
        const f = String(c.evento_fecha || '').slice(0, 10);
        if (!f) return true; // sin fecha (team) no se puede declarar pasada
        return (Date.parse(hoy) - Date.parse(f)) / 864e5 <= 3; // la regla de los 3 días
      }).map((c) => ({ nombre: c.creador_nombre, correo: c.creador_email }));
    } else {
      const slug = String(body.evento_id || '').trim();
      if (!SLUG_RE.test(slug) || slug.length > 120) return res(400, { error: 'evento_id inválido' });
      // Exacto o hija `slug#N` — el `#` en el like es el candado del prefijo.
      const filtro = slug.includes('#')
        ? `evento_id=eq.${encodeURIComponent(slug)}`
        : `or=(evento_id.eq.${slug},evento_id.like.${encodeURIComponent(slug + '#*')})`;
      const vs = await get(`${URL_}/rest/v1/viajeros_evento?${filtro}&select=nombre,correo,tipo_viajero,boletos&limit=2000`);
      brutos = vs.filter((v) => (v.tipo_viajero == null || v.tipo_viajero === 'cliente') && Number(v.boletos) > 0)
        .map((v) => ({ nombre: v.nombre, correo: v.correo }));
    }
  } catch (e) { return res(502, { error: 'No se pudo leer la audiencia: ' + e.message }); }

  // Dedup por correo (minúsculas) + orden DETERMINISTA: las tandas dependen de
  // que la lista sea la misma en cada llamada.
  const porCorreo = new Map();
  for (const p of brutos) {
    const c = String(p.correo || '').trim().toLowerCase();
    if (!c || !/@/.test(c)) continue;
    if (!porCorreo.has(c)) porCorreo.set(c, { nombre: p.nombre || '', correo: c });
  }
  let audiencia = [...porCorreo.values()].sort((a, b) => a.correo.localeCompare(b.correo));
  // [EMMA-1c] `solo`: ESTRECHA la audiencia derivada a correos concretos (el
  // botón «reintentar los fallidos»). Solo puede quitar, nunca meter a nadie
  // que la derivación no trajo — la audiencia sigue saliendo de la base.
  if (Array.isArray(body.solo) && body.solo.length) {
    const quiero = new Set(body.solo.map((c) => String(c).trim().toLowerCase()));
    audiencia = audiencia.filter((u) => quiero.has(u.correo));
  }
  if (!audiencia.length) return res(409, { error: 'La audiencia salió VACÍA — nada que mandar' });

  const html = render(asunto, mensaje);

  // SECO por default: a quién iría y cómo se ve, cero envíos.
  if (body.seco !== false || body.confirmar !== true) {
    return res(200, { ok: true, seco: true, total: audiencia.length, tanda: TANDA,
      audiencia: audiencia.slice(0, 200), html_muestra: html,
      nota: 'Para MANDAR: seco:false Y confirmar:true, por tandas de ' + TANDA + '. CORREOS_MODO está en real.' });
  }

  // ── ENVIAR, una tanda ──────────────────────────────────────────────────────
  const desde = Math.max(0, Math.round(Number(body.desde)) || 0);
  const tanda = audiencia.slice(desde, desde + TANDA);
  if (!tanda.length) return res(400, { error: `desde=${desde} está fuera de la lista (total ${audiencia.length})` });
  // [EMMA-1c] EL FRENO DE RESEND, cobrado en el primer envío real: su límite
  // es 10/s y la tanda salía a ráfaga — 6 de 20 rebotaron con «Too many
  // requests». Pausa de 150 ms entre envíos (~6/s, deja aire al resto del
  // correo del sistema) y ante un rate limit UN reintento tras 1.2 s.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const enviados = [], errores = [];
  for (let i = 0; i < tanda.length; i++) {
    const u = tanda[i];
    if (i > 0) await sleep(150);
    let out = await L.enviarCorreo(u.correo, asunto, html);
    if (!out.enviado && /too many requests|rate limit/i.test(String(out.error || ''))) {
      await sleep(1200);
      out = await L.enviarCorreo(u.correo, asunto, html);
    }
    if (out.enviado) enviados.push(u.correo);
    else errores.push({ correo: u.correo, error: out.error });
  }
  const siguiente = desde + tanda.length < audiencia.length ? desde + tanda.length : null;
  return res(200, { ok: true, seco: false, desde, enviados: enviados.length, errores, siguiente, total: audiencia.length });
};
