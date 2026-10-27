// =============================================================================
// _lib/correo-confirmacion — CONFIRMA-1 (13-oct-2026): EL CORREO ÚNICO.
// =============================================================================
// Palabra de Memo: «correo único primero» — la confirmación y la invitación al
// Portal viajan en UN correo, no en dos (dos el mismo día confunden y el segundo
// se va a spam). Dos momentos, un solo dueño:
//
//   · tipo 'reserva' → al APROBAR una requisición en la bandeja:
//                      «¡Tu lugar está confirmado!»
//   · tipo 'abono'   → al CAPTURAR A MANO un pago (Bulma/Milk):
//                      «Recibimos tu pago»
//
// Los dos dicen lo recibido, el total, lo que falta y quiénes viajan, y llevan
// el bloque del Portal:
//   · si el correo NO ha sido invitado a ese evento → «regístrate con este
//     correo» y, DESPUÉS del envío, se asienta en `invitaciones_portal` (la
//     MISMA bitácora del botón «Invitar al Portal»: el que ya recibió esto no
//     recibe otra invitación);
//   · si YA fue invitado → «entra a tu Portal».
//
// 🔒 Un correo por CORREO, no por persona: el titular que dejó su correo para
//    los acompañantes recibe UNO con los nombres de todos y las sumas del grupo.
// 🔒 El dinero lo cuenta `saldoMigrado` (el dueño de la cuenta del viajero):
//    aquí no se suma un abono a mano.
// 🔒 Sin catálogo no se manda (un «tu viaje» sin decir cuál se lee como spam).
// 🔒 Sin bitácora legible SÍ se manda la confirmación, pero SIN invitar
//    (no se sabe a quién ya se invitó) y se DICE en el aviso.
// 🔒 Jamás lanza: devuelve un resumen que la pantalla pinta. El correo es
//    consecuencia del dinero, nunca su condición.
// =============================================================================
const { llaveCorreo, esCorreoUsable } = require('./correo-forma');
const { saldoMigrado } = require('./cuenta-evento');

const PORTAL_URL = 'https://conectareynosa.mx/portal';
const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';
// Eventos donde el correo sale solo (palabra de Memo: «para los de Pa'l Norte,
// solo esos por el momento»). Fuera de aquí la bandeja y la captura NO mandan.
const EVENTOS_CORREO = ['palnorte', 'nsqkmty'];   // [NSQK-PREVENTA-1]

// [REQ-2027-1] Palabra de Memo (26-oct-2026, «solo requisiciones»): en los
// eventos de 2027 en adelante el correo único (confirmación + invitación al
// Portal) sale cuando el cliente entra por la PUERTA del sitio — aprobar su
// requisición, o repartir sus lugares desde el Portal (tipo 'reserva'). La
// captura MANUAL de un pago (tipo 'pago') NO lo dispara fuera de la lista: los
// clientes que vienen del Excel no reciben nada nuevo; a ellos se les invita
// evento por evento con el botón. La fecha se le PREGUNTA al catálogo servido
// (su `ds`), no se teclea evento por evento.
const CORREO_RESERVA_DESDE = '2027-01-01';

// [REQ-2027-2] Palabra de Memo (26-oct-2026, «haremos solo los de Monterrey» →
// «ábrelos»): la puerta 2027 se abre POR NOMBRE, no por fecha a secas. La
// fecha sigue siendo candado (fail-closed), pero un evento 2027 que no esté
// aquí —CDMX sin regla del vuelo, uno nuevo publicado mañana— NO manda correo
// aunque alguien entre con ?req=1. Es la MISMA lista que REQUISICION_EVENTOS
// del index (menos las preventas, que viven en EVENTOS_CORREO); el careo
// mide:req-2027-2 las carea para que no diverjan.
const RESERVA_2027 = ['fuerzaregida', 'juniorh', 'anagabriel', 'emmanuel', 'madero',
  'interpol', 'anuelaa', 'oreja', 'scorpions'];

function baseSlug(id) { return String(id || '').split('#')[0]; }
function correoActivo(evento_id) { return EVENTOS_CORREO.includes(baseSlug(evento_id)); }
function reservaPorFecha(ev) { return !!(ev && ev.ds && String(ev.ds).slice(0, 10) >= CORREO_RESERVA_DESDE); }
// ¿Sale el correo? La lista manda para todo; la reserva 2027 exige estar en
// RESERVA_2027 Y fecha 2027+. Async porque la fecha vive en el catálogo — y se
// pregunta ANTES del puente al Portal, que escribe.
async function correoDebeSalir(evento_id, tipo) {
  if (correoActivo(evento_id)) return true;
  if (tipo !== 'reserva') return false;
  if (!RESERVA_2027.includes(baseSlug(evento_id))) return false;
  try {
    const { fetchEventosRaw } = require('./catalogo-index');
    const EV = await fetchEventosRaw();
    const ev = (Array.isArray(EV) ? EV : []).find((e) => e && e.id === baseSlug(evento_id)) || null;
    return reservaPorFecha(ev);
  } catch (_) { return false; }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const mxn = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');

// Devuelve { subject, html, to } | { error }.
function renderConfirmacion({ tipo, correo, ev, nombres, recibido, total, resta, portal, grupo }) {
  const k = llaveCorreo(correo);
  if (!k) return { error: 'sin correo usable' };
  if (!ev || !ev.id) return { error: 'no se pudo leer el evento en el catálogo: no se manda un correo sin decir a qué viaje' };
  const artista = String(ev.a || ev.id);
  const detalle = [String(ev.f || '').trim(), String(ev.v || '').trim()].filter(Boolean).join(' · ');
  const lista = (Array.isArray(nombres) ? nombres : []).filter(Boolean);
  const primer = (String(lista[0] || '').trim().split(/\s+/)[0]) || 'Hola';
  const esReserva = tipo === 'reserva';
  const liquidado = total != null && resta != null && resta <= 0;
  const subject = esReserva ? `¡Tu lugar está confirmado! · ${artista}` : `Recibimos tu pago · ${artista}`;
  const titulo = esReserva ? `${primer}, ¡tu lugar está confirmado!` : `${primer}, recibimos tu pago`;
  // 🔒 Color EXPLÍCITO en cada celda: las tablas de los clientes de correo NO
  // heredan el color del div (salían negro sobre negro — cazado en la captura).
  const fila = (a, b, estilo) => `<tr><td style="padding:6px 0;color:#b3b3b3">${a}</td><td style="padding:6px 0;text-align:right;font-weight:800;color:${estilo === 'amarillo' ? '#e8ff4c' : estilo === 'verde' ? '#88ea4e' : '#ffffff'}">${b}</td></tr>`;
  const cuentas = '<table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 16px">'
    + fila('Recibimos', mxn(recibido), 'amarillo')
    + (total != null ? fila('Total de tu viaje', mxn(total)) : '')
    + (resta != null ? fila(liquidado ? 'Te falta' : 'Te falta por pagar', liquidado ? '$0 · ¡pagado!' : mxn(resta), liquidado ? 'verde' : 'amarillo') : '')
    + '</table>';
  const quienes = lista.length > 1
    ? `<p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,.8)">Viajan: <b>${lista.map(esc).join(', ')}</b></p>` : '';
  let bloquePortal = '';
  if (portal === 'nuevo') {
    bloquePortal = `<p style="margin:0 0 14px">Ya puedes ver tu viaje y tu plan de pagos en tu <b style="color:#e8ff4c">Portal</b>, y completar ahí los datos que falten. Regístrate con <b>este mismo correo</b> (<span style="color:#e8ff4c">${esc(k)}</span>) para que te reconozcamos:</p>
          <p style="margin:0 0 20px;text-align:center"><a href="${PORTAL_URL}" style="display:inline-block;background:#e8ff4c;color:#000;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px">Entrar a mi Portal →</a></p>`;
  } else if (portal === 'existente') {
    bloquePortal = `<p style="margin:0 0 20px;text-align:center"><a href="${PORTAL_URL}" style="display:inline-block;background:#e8ff4c;color:#000;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px">Ver mi plan en el Portal →</a></p>`;
  }
  // [GRUPO-WA-1] El grupo de WhatsApp del evento, si Bulma/Milk ya pegaron el
  // link en KameHouse. Verde de WhatsApp a propósito: se distingue del botón
  // del Portal. Sin link no hay bloque (no se inventa uno).
  const bloqueGrupo = grupo ? `<div style="margin:0 0 20px;padding:16px;border:1px solid #25d366;border-radius:10px;background:#0f1a12">
          <p style="margin:0 0 10px;color:#ffffff;font-weight:700">Únete al grupo de WhatsApp de tu viaje</p>
          <p style="margin:0 0 12px;font-size:14px;color:#b3b3b3">Ahí mandamos los avisos, horarios y recordatorios de tu evento.</p>
          <p style="margin:0;text-align:center"><a href="${esc(grupo)}" style="display:inline-block;background:#25d366;color:#000000;font-weight:800;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px">Entrar al grupo de WhatsApp →</a></p>
        </div>` : '';
  const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff">
        <div style="background:#e8ff4c;color:#000;padding:18px 22px;border-bottom:4px solid #ff283b">
          <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Conecta Reynosa · ${esc(artista)}</div>
          <div style="font-size:22px;font-weight:900;margin-top:4px">${esc(titulo)}</div>
        </div>
        <div style="padding:24px 22px;background:#0a0a0a;font-size:15px;line-height:1.6;color:rgba(255,255,255,.9)">
          ${detalle ? `<p style="margin:0 0 14px;color:#e8ff4c;font-weight:700">${esc(detalle)}</p>` : ''}
          ${cuentas}
          ${quienes}
          ${bloquePortal}
          ${bloqueGrupo}
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,.55)">Guarda este correo como comprobante. Si algo no cuadra o tienes dudas, escríbenos por WhatsApp al 81 1977 1072.</p>
        </div>
      </div>`;
  return { subject, html, to: k };
}

// ── EL ENVÍO ────────────────────────────────────────────────────────────────
// viajeroIds: los viajeros que este dinero tocó. recibidoPorViajero: { id: monto }.
async function enviarCorreoPago({ tipo, evento_id, viajeroIds, recibidoPorViajero, enviado_por, KH_URL, KH_KEY }) {
  const PT_URL = process.env.PORTAL_SUPABASE_URL;
  const PT_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  if (!(await correoDebeSalir(evento_id, tipo))) return null; // fuera de los eventos con correo: no se manda nada
  if (!RESEND_KEY) return { ok: false, aviso: 'Falta RESEND_API_KEY: no se mandó el correo de confirmación.' };
  const hKH = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  const evBase = baseSlug(evento_id);
  const avisos = [];
  try {
    const ids = (viajeroIds || []).map((x) => '"' + x + '"').join(',');
    if (!ids) return { ok: false, aviso: 'sin viajeros' };
    const sel = 'id,evento_id,nombre,correo,celular,talla_playera,emergencia_nombre,num_emergencia,portal_cliente_id,total_contrato,abonado_previo';
    const leer = async () => {
      const r = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=in.(${encodeURIComponent(ids)})&select=${sel}`, { headers: hKH });
      if (!r.ok) throw new Error('no pude leer los viajeros');
      return r.json();
    };
    // 1 · Puente al Portal (cuenta walk-in + enlace), si hay llaves. Sin llaves
    //     el correo sale igual, sin bloque de registro.
    let portalListo = false;
    if (PT_URL && PT_KEY) {
      const { puentearViajeros } = require('./puente-portal');
      const pu = await puentearViajeros({ evento_id: evBase, viajeros: await leer(), KH_URL, KH_KEY, PT_URL, PT_KEY, ejecutar: true });
      if (pu && pu.error) avisos.push('el puente al Portal falló (' + pu.error + '): el correo sale sin invitación');
      else portalListo = true;
    } else avisos.push('faltan las llaves del Portal: el correo sale sin invitación');
    const vs = await leer();
    // 2 · El dinero, por el DUEÑO de la cuenta.
    const aR = await fetch(`${KH_URL}/rest/v1/abonos_viajero?viajero_id=in.(${encodeURIComponent(ids)})&select=viajero_id,monto,fecha&limit=5000`, { headers: hKH });
    if (!aR.ok) throw new Error('no pude leer los abonos');
    const porV = {};
    (await aR.json()).forEach((a) => { (porV[a.viajero_id] = porV[a.viajero_id] || []).push(a); });
    // 3 · La bitácora: a quién ya se invitó a ESTE evento.
    let ya = null;
    const bR = await fetch(`${KH_URL}/rest/v1/invitaciones_portal?evento_id=eq.${encodeURIComponent(evBase)}&select=correo&limit=5000`, { headers: hKH });
    if (bR.ok) ya = new Set((await bR.json()).map((x) => llaveCorreo(x.correo)).filter(Boolean));
    else avisos.push('no pude leer la bitácora de invitaciones: el correo sale sin invitación');
    // 4 · El catálogo.
    const { fetchEventosRaw } = require('./catalogo-index');
    const EV = await fetchEventosRaw();
    const ev = (Array.isArray(EV) ? EV : []).find((e) => e && e.id === evBase) || null;
    if (!ev) return { ok: false, aviso: 'No pude leer el evento en el catálogo: no se mandó el correo.' };
    // 4b · [GRUPO-WA-1] El link del grupo de WhatsApp (privado, por evento).
    const { gruposDe } = require('./grupo-whatsapp');
    const linksWA = await gruposDe(vs.map((v) => v.evento_id).concat([evento_id]), { KH_URL, KH_KEY });
    // 5 · Grupos por correo.
    const grupos = new Map();
    const saltados = [];
    for (const v of vs) {
      const k = llaveCorreo(v.correo);
      if (!k || !esCorreoUsable(v.correo)) { saltados.push(v.nombre || v.id); continue; }
      if (!grupos.has(k)) grupos.set(k, { correo: k, nombres: [], ids: [], total: 0, abonado: 0, resta: 0, sinPlan: false, recibido: 0, portal_cliente_id: null, grupo: null });
      const g = grupos.get(k);
      g.ids.push(v.id);
      if (!g.grupo) g.grupo = linksWA[v.evento_id] || linksWA[evento_id] || null;
      g.nombres.push(v.nombre);
      const s = saldoMigrado(v, porV[v.id] || []);
      if (s) { g.total += s.total; g.abonado += s.abonado; g.resta += s.resta; } else g.sinPlan = true;
      g.recibido += Number((recibidoPorViajero || {})[v.id]) || 0;
      if (v.portal_cliente_id) g.portal_cliente_id = v.portal_cliente_id;
    }
    // 6 · Enviar, y asentar la invitación DESPUÉS.
    const { aplicarModoPrueba } = require('./correo-guard');
    const enviados = [], errores = [];
    for (const g of grupos.values()) {
      let portal = null;
      if (portalListo && ya && g.portal_cliente_id) portal = ya.has(g.correo) ? 'existente' : 'nuevo';
      const r = renderConfirmacion({ tipo, correo: g.correo, ev, nombres: g.nombres, recibido: g.recibido,
        total: g.sinPlan ? null : g.total, resta: g.sinPlan ? null : g.resta, portal, grupo: g.grupo });
      if (r.error) { errores.push({ correo: g.correo, paso: 'render', detail: r.error }); continue; }
      const mp = aplicarModoPrueba({ to: [r.to], subject: r.subject });
      let resp, data = {};
      try {
        resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: mp.to, subject: mp.subject, html: r.html }),
        });
        data = await resp.json().catch(() => ({}));
      } catch (e) { errores.push({ correo: g.correo, paso: 'resend', detail: e.message }); continue; }
      if (!resp.ok) { errores.push({ correo: g.correo, paso: 'resend', status: resp.status, detail: data }); continue; }
      let asentado = null;
      if (portal === 'nuevo') {
        const iR = await fetch(`${KH_URL}/rest/v1/invitaciones_portal`, {
          method: 'POST', headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
          // [BITACORA-1] columnas de la tabla REAL, por el dueño de la forma.
          body: JSON.stringify(require('./invitacion-portal').filaBitacora({ evento_id: evBase, correo: g.correo, nombre: g.nombres[0], viajero_ids: g.ids, enviada_por: enviado_por, email_id: data.id || null })),
        });
        asentado = iR.ok;
        if (!iR.ok) errores.push({ correo: g.correo, paso: 'bitacora', aviso: 'EL CORREO YA SALIÓ pero la invitación no quedó asentada: el botón «Invitar al Portal» se la mandaría otra vez' });
      }
      enviados.push({ correo: g.correo, nombres: g.nombres, portal, asentado });
    }
    return {
      ok: errores.length === 0,
      enviados: enviados.map((x) => x.correo),
      invitados: enviados.filter((x) => x.portal === 'nuevo').map((x) => x.correo),
      ya_tenian_portal: enviados.filter((x) => x.portal === 'existente').map((x) => x.correo),
      sin_correo: saltados,
      errores,
      aviso: avisos.length ? avisos.join(' · ') : null,
    };
  } catch (e) {
    return { ok: false, aviso: 'El correo de confirmación falló: ' + e.message + ' — el dinero SÍ quedó registrado.' };
  }
}

module.exports = { renderConfirmacion, enviarCorreoPago, correoActivo, correoDebeSalir, reservaPorFecha, CORREO_RESERVA_DESDE, EVENTOS_CORREO, RESERVA_2027, PORTAL_URL };
