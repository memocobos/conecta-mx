// =============================================================================
// _lib/portal-revision.js — [PORTAL-SOLO-1] el Portal enseña SOLO lo revisado
// (27-oct-2026)
//
// Palabra de Memo, citada: «antes que se registrara bulma milk o yo podamos
// revisar su caso para darle la información correcta de su tour, que tal que
// tiene menos pagos o pagos de más… eso haría al cliente desconfiar … lo que se
// guarde en la revisión manual tú la puedes utilizar para saber qué onda con esa
// persona con sus números».
//
// EL DUEÑO de tres preguntas, para que el Portal y KameHouse no las contesten
// cada quien a su modo:
//   1. ¿qué filas son de este correo?  → `filasDeCorreo` (ilike ESTRECHA, la
//      igualdad exacta en minúsculas MANDA — la forma de PLAN-CASE-1).
//   2. ¿cuáles se pueden ENSEÑAR?      → `revisada(v)`: solo con sello
//      `portal_revisado_at`. Sin sello no viaja NADA de esa fila al cliente.
//   3. ¿cuánto dice cada una?          → `foto()`, con `saldoMigrado` (el dueño
//      del dinero; aquí no se suma un abono).
//
// Y la bitácora (`portal_revisiones`): `pedirRevision` la abre cuando un cliente
// con filas SIN sello entra al Portal; KameHouse la cierra (publicar / no procede)
// en `admin-portal-revision`. Los números ANTES y DESPUÉS quedan guardados.
//
// 🔒 Los correos al cliente JAMÁS tumban la decisión: el sello y la bitácora ya
// se escribieron; si Resend falla, la bandeja lo DICE.
// =============================================================================
const { saldoMigrado } = require('./cuenta-evento');

const VSEL = 'id,evento_id,nombre,correo,celular,tipo_paquete,zona_boleto,total_contrato,abonado_previo,boletos,portal_revisado_at,portal_revisado_por,notas';
const TABLA = 'portal_revisiones';

const revisada = (v) => !!(v && v.portal_revisado_at);
const normCorreo = (c) => String(c == null ? '' : c).trim().toLowerCase();

async function filasDeCorreo(correo, { KH_URL, KH_KEY }, select) {
  const c = normCorreo(correo);
  if (!c) return [];
  const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  const r = await fetch(`${KH_URL}/rest/v1/viajeros_evento?correo=ilike.${encodeURIComponent(c)}&select=${select || VSEL}&limit=200`, { headers: h });
  if (!r.ok) throw new Error('no pude leer los viajeros (' + r.status + ')');
  const rows = await r.json();
  // 🔒 El `ilike` solo puede SOBRE-pescar (un `_` casa cualquier carácter); la
  // igualdad exacta es la autoridad.
  return (Array.isArray(rows) ? rows : []).filter((v) => normCorreo(v.correo) === c);
}

async function abonosDe(ids, { KH_URL, KH_KEY }) {
  const out = {};
  if (!ids.length) return out;
  const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  const lista = ids.map((x) => '"' + x + '"').join(',');
  const r = await fetch(`${KH_URL}/rest/v1/abonos_viajero?viajero_id=in.(${encodeURIComponent(lista)})&select=viajero_id,monto,fecha,nota&order=fecha.asc&limit=5000`, { headers: h });
  if (!r.ok) throw new Error('no pude leer los abonos (' + r.status + ')');
  (await r.json()).forEach((a) => { (out[a.viajero_id] = out[a.viajero_id] || []).push(a); });
  return out;
}

// La foto que se guarda ANTES y DESPUÉS — lo que el cliente vería.
function foto(filas, abonos) {
  return (filas || []).map((v) => {
    const s = saldoMigrado(v, (abonos || {})[v.id]);
    return {
      viajero_id: v.id, evento_id: v.evento_id, nombre: v.nombre || null,
      paquete: v.tipo_paquete || null, zona: v.zona_boleto || null, boletos: Number(v.boletos) || 1,
      total: s ? s.total : null, abonado: s ? s.abonado : null, resta: s ? s.resta : null,
      abonos: ((abonos || {})[v.id] || []).length,
    };
  });
}

// ¿Qué filas sin sello NO están ya cubiertas por una revisión pendiente o por
// una rechazada? (Una rechazada con su motivo no se vuelve a abrir sola cada
// vez que el cliente recarga; solo una fila NUEVA reabre la revisión.)
async function pedirRevision({ correo, filas, KH_URL, KH_KEY }) {
  const c = normCorreo(correo);
  const sinSello = (filas || []).filter((v) => !revisada(v));
  if (!c || !sinSello.length) return { ok: true, abierta: false, pendientes: 0 };
  const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  const r = await fetch(`${KH_URL}/rest/v1/${TABLA}?correo=eq.${encodeURIComponent(c)}&tipo=in.(revisar,ligar)&estado=in.(pendiente,rechazada)&select=id,tipo,estado,viajero_ids&limit=50`, { headers: h });
  if (!r.ok) throw new Error('no pude leer la bitácora de revisiones (' + r.status + ')');
  const previas = await r.json();
  const hayPendRevisar = previas.some((p) => p.tipo === 'revisar' && p.estado === 'pendiente');
  if (hayPendRevisar) return { ok: true, abierta: false, pendientes: sinSello.length };
  const cubiertas = new Set();
  previas.forEach((p) => (p.viajero_ids || []).forEach((id) => cubiertas.add(String(id))));
  // Una «ligar» pendiente también cubre: ya la están atendiendo.
  if (previas.some((p) => p.tipo === 'ligar' && p.estado === 'pendiente')) return { ok: true, abierta: false, pendientes: sinSello.length };
  const nuevas = sinSello.filter((v) => !cubiertas.has(String(v.id)));
  if (!nuevas.length) return { ok: true, abierta: false, pendientes: sinSello.length, rechazada: true };
  const ab = await abonosDe(nuevas.map((v) => v.id), { KH_URL, KH_KEY });
  const ins = await fetch(`${KH_URL}/rest/v1/${TABLA}`, {
    method: 'POST', headers: Object.assign({}, h, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ tipo: 'revisar', correo: c, viajero_ids: nuevas.map((v) => v.id), antes: foto(nuevas, ab) }),
  });
  // 409/23505 = otra pestaña la abrió un instante antes: es la misma revisión.
  if (!ins.ok && ins.status !== 409) throw new Error('no pude abrir la revisión (' + ins.status + ')');
  return { ok: true, abierta: ins.ok, pendientes: sinSello.length };
}

// Nombre y fecha de un evento (o de una fecha `slug#N`) desde el catálogo servido.
function nombreEvento(EV, eventoId) {
  const [slug, idx] = String(eventoId || '').split('#');
  const ev = Array.isArray(EV) ? EV.find((e) => e && e.id === slug) : null;
  if (!ev) return { nombre: eventoId, fecha: '' };
  const mf = (idx != null && Array.isArray(ev.multifecha)) ? ev.multifecha[Number(idx)] : null;
  return { nombre: ev.a || slug, fecha: (mf && (mf.lbl || mf.f)) || ev.f || '', ds: (mf && mf.ds) || ev.ds || '' };
}

// ── Correos ──────────────────────────────────────────────────────────────────
const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';
const PORTAL = 'https://conectareynosa.mx/portal';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const mxn = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');

function renderRevision({ estado, correo, nombre, viajes, motivo }) {
  const ok = estado === 'publicada';
  const primer = (String(nombre || '').trim().split(/\s+/)[0]) || 'Hola';
  const subject = ok ? 'Ya puedes ver tu viaje en tu Portal' : 'Sobre tu solicitud en tu Portal';
  const celda = 'padding:8px 10px;border-bottom:1px solid #333333;color:#ffffff;font-size:14px';
  const lista = (viajes || []).map((t) => `<tr><td style="${celda}"><b style="color:#e8ff4c">${esc(t.evento)}</b>${t.fecha ? '<br><span style="color:#b3b3b3;font-size:12px">' + esc(t.fecha) + '</span>' : ''}${t.nombre ? '<br><span style="color:#b3b3b3;font-size:12px">' + esc(t.nombre) + '</span>' : ''}</td>`
    + `<td style="${celda};text-align:right">${t.total != null ? 'Total ' + mxn(t.total) + '<br>Pagado ' + mxn(t.abonado) + '<br><b style="color:#ffffff">Te falta ' + mxn(Math.max(0, t.resta)) + '</b>' : '<span style="color:#b3b3b3">—</span>'}</td></tr>`).join('');
  const cuerpo = ok
    ? `<p style="margin:0 0 14px;color:#ffffff">Revisamos tu información y ya la puedes ver en tu <b>Portal</b>:</p>
       <table style="width:100%;border-collapse:collapse;margin:0 0 18px">${lista}</table>
       <p style="margin:0 0 20px;color:#ffffff">Si algo no te cuadra, contéstanos este correo y lo revisamos contigo.</p>`
    : `<p style="margin:0 0 14px;color:#ffffff">Revisamos tu solicitud y esto es lo que encontramos:</p>
       <p style="margin:0 0 16px;padding:12px 14px;border-left:4px solid #ff283b;background:#1a1a1a;color:#ffffff">${esc(motivo || '')}</p>
       <p style="margin:0 0 20px;color:#ffffff">Puedes volver a pedirlo desde tu Portal con los datos correctos, o escribirnos por WhatsApp al 81 1977 1072.</p>`;
  const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000000;color:#ffffff">
        <div style="background:#e8ff4c;color:#000000;padding:18px 22px;border-bottom:4px solid #ff283b">
          <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#000000">Conecta Reynosa · Tu Portal</div>
          <div style="font-size:24px;font-weight:900;margin-top:4px;color:#000000">${esc(primer)}, ${ok ? '¡tu viaje ya está en tu Portal!' : 'revisamos tu solicitud'}</div>
        </div>
        <div style="padding:22px;font-size:15px;line-height:1.6;color:#ffffff">
          ${cuerpo}
          <p style="margin:0 0 12px;text-align:center"><a href="${PORTAL}" style="display:inline-block;background:#e8ff4c;color:#000000;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:8px;font-size:15px">Entrar a mi Portal →</a></p>
          <p style="margin:18px 0 0;font-size:13px;color:#b3b3b3">Entra con este mismo correo (<span style="color:#e8ff4c">${esc(correo)}</span>).</p>
        </div>
      </div>`;
  return { to: correo, subject, html };
}

// rev: la fila de portal_revisiones ya cerrada. viajes: [{evento,fecha,nombre,total,abonado,resta}].
async function avisarRevision({ rev, viajes, nombre }) {
  try {
    const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
    if (!RESEND_KEY) return { ok: false, aviso: 'falta RESEND_API_KEY: avísale por WhatsApp' };
    if (rev.estado === 'publicada' && !(viajes || []).length) return { ok: false, aviso: 'no hay viajes publicados que contarle: no se mandó correo' };
    const { aplicarModoPrueba } = require('./correo-guard');
    const r = renderRevision({ estado: rev.estado, correo: rev.correo, nombre, viajes, motivo: rev.motivo });
    const mp = aplicarModoPrueba({ to: [r.to], subject: r.subject });
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: mp.to, subject: mp.subject, html: r.html }) });
    if (!resp.ok) return { ok: false, aviso: 'Resend rechazó el correo (' + resp.status + ')' };
    return { ok: true, enviado: rev.correo };
  } catch (e) {
    return { ok: false, aviso: 'el correo no salió: ' + (e && e.message) };
  }
}

module.exports = { VSEL, TABLA, revisada, normCorreo, filasDeCorreo, abonosDe, foto, pedirRevision, nombreEvento, renderRevision, avisarRevision };
