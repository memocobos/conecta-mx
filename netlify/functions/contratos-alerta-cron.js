// netlify/functions/contratos-alerta-cron.js
// (Contratos F4 — cron de alertas pre-viaje para contratos sin firmar)
//
// Job DIARIO (schedule en netlify.toml). "Sin firma no hay servicio": a 7 días
// del viaje y DIARIO los últimos 3 (días 3, 2 y 1) avisa de la gente que aún NO
// ha firmado su contrato, para que haya tiempo de reacción.
//
// Dos correos por corrida:
//   1) RESUMEN al admin (uno solo): todos los pendientes + los lugares sin
//      contrato, agrupados por evento, con el contador firmados/total.
//   2) RECORDATORIO al cliente (uno por contrato PENDIENTE): su link de firma —
//      al DUEÑO del lugar si está conectado; si no, al TITULAR de la solicitud.
//      Los "sin contrato" NO generan correo a cliente (no hay qué firmar).
//
// Mundo PORTAL únicamente (contratos_viajeros + solicitudes_tour + lugares +
// clientes). La FECHA del evento sale del catálogo desplegado vía _lib/catalogo-
// index (campo `ds` = primera fecha en ISO); el cron NO toca la base KH. Para un
// festival multifecha se usa la PRIMERA fecha (el viaje sale antes del día 1).
//
// Pieza AISLADA: solo NOTIFICA. No crea contratos, no cambia estados, no toca el
// motor ni las UIs. Todo el correo pasa por aplicarModoPrueba (en modo prueba
// llega [PRUEBA→...] al buzón de calibración). Corre 14:00 UTC = 8:00 AM hora MX,
// mismo slot que los crons de cobranza (para que Bulma lo lea con su café).
//
// Env vars: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, RESEND_KEY,
//           URL/SITE_URL (link de firma). CORREOS_MODO/CORREOS_PRUEBA_DESTINO
//           (correo-guard). URL/DEPLOY_PRIME_URL (catalogo-index).

const { aplicarModoPrueba } = require('./_lib/correo-guard');
const { fetchCatalogo } = require('./_lib/catalogo-index');

const SB_URL = process.env.PORTAL_SUPABASE_URL;
const SB_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
const HEADERS = {
  apikey: SB_KEY,
  Authorization: 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
};

const SITE_URL = (process.env.SITE_URL || process.env.URL || 'https://conectareynosa.mx').replace(/\/$/, '');

// Remitentes: el de cara al CLIENTE calca al del motor de contratos
// (admin-solicitud-update-estado); el interno calca al del Radar del Dragón.
const FROM_CLIENTE = 'Portal Conecta <admin@conectareynosa.mx>';
const FROM_ADMIN   = 'Contratos Conecta <admin@conectareynosa.mx>';
const ADMIN_TO     = 'admin@conectareynosa.mx';

// Días antes de la PRIMERA fecha del evento en que se avisa: a 7 días y luego
// diario los últimos 3 (3, 2, 1). El día 0 (hoy es el viaje) ya no avisa.
const VENTANA = [7, 3, 2, 1];

// Estados de solicitud "activos" que sí viajan (las pendientes no tienen lugares;
// las canceladas quedan fuera).
const ESTADOS_ACTIVOS = ['en_pagos', 'pagado'];

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...HEADERS, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Primer nombre, para el saludo.
function primerNombre(full) {
  return String(full || 'viajero').trim().split(/\s+/)[0] || 'viajero';
}

// Días entre dos fechas 'YYYY-MM-DD' (ev - hoy), a medianoche UTC para evitar
// líos de zona. Positivo = el evento es en el futuro.
function _daysUntil(evISO, hoyISO) {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(evISO || ''));
  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hoyISO || ''));
  if (!m1 || !m2) return null;
  const a = Date.UTC(+m1[1], +m1[2] - 1, +m1[3]);
  const b = Date.UTC(+m2[1], +m2[2] - 1, +m2[3]);
  return Math.round((a - b) / 86400000);
}

// ── Construcción PURA del plan (sin IO) — así el arnés simula fechas y datos ──
//
// Entra:
//   catalogo          { slug: { nombre, ds, ... } }  (de _lib/catalogo-index)
//   hoyISO            'YYYY-MM-DD' (hora MX)
//   solicitudesPorSlug{ slug: [{ id, evento_id, evento_nombre, cliente_id }] }
//                     (activas; cliente_id = TITULAR de la solicitud)
//   lugaresPorSol     { solId: [{ id, numero, nombre, cliente_id }] }  (activos;
//                     cliente_id = DUEÑO del lugar, null si no conectado)
//   contratoPorLugar  { lugarId: { estado, token } }  (contratos VIVOS: pendiente|firmado)
//   correoPorCliente  { clienteId: 'correo' }
//   nombrePorCliente  { clienteId: 'Nombre Completo' }
//
// Devuelve { eventosVentana, adminEmail|null, correosCliente[], stats }.
function _construirPlan({
  catalogo, hoyISO,
  solicitudesPorSlug = {}, lugaresPorSol = {},
  contratoPorLugar = {}, correoPorCliente = {}, nombrePorCliente = {},
}) {
  const eventosVentana = [];
  const correosCliente = [];
  const adminSecciones = [];
  let totPendientes = 0, totSinContrato = 0;

  // Eventos del catálogo cuya PRIMERA fecha (ds) cae en la ventana.
  const slugs = Object.keys(catalogo || {}).sort();
  for (const slug of slugs) {
    const ce = catalogo[slug] || {};
    const dias = _daysUntil(ce.ds, hoyISO);
    if (dias == null || !VENTANA.includes(dias)) continue;

    const sols = solicitudesPorSlug[slug] || [];
    if (!sols.length) continue; // evento en ventana pero sin solicitudes activas

    const evNombre = (sols.find(s => s.evento_nombre) || {}).evento_nombre || ce.nombre || slug;

    // Recorrer lugares de cada solicitud y clasificar su contrato.
    let total = 0, firmados = 0, pendientes = 0, sinContrato = 0;
    const filasAdmin = []; // { titular, lugarNum, nombre, estado }

    for (const sol of sols) {
      const titular = nombrePorCliente[sol.cliente_id] || '(sin titular)';
      const lugares = lugaresPorSol[sol.id] || [];
      for (const lugar of lugares) {
        total++;
        const ct = contratoPorLugar[lugar.id];
        if (ct && ct.estado === 'firmado') { firmados++; continue; } // firmado → silencio

        if (ct && ct.estado === 'pendiente' && ct.token) {
          pendientes++;
          filasAdmin.push({ titular, lugarNum: lugar.numero, nombre: lugar.nombre || '(sin nombre)', estado: 'pendiente' });
          // Destinatario: dueño del lugar si conectado; si no, el titular.
          const destCliente = (lugar.cliente_id != null) ? lugar.cliente_id : sol.cliente_id;
          const correo = correoPorCliente[destCliente];
          const nombreDest = nombrePorCliente[destCliente] || lugar.nombre;
          if (correo) {
            correosCliente.push(_correoCliente({
              to: correo, nombreDest, evento: evNombre, dias, token: ct.token,
              tipo: (lugar.cliente_id != null) ? 'dueño' : 'titular', lugarId: lugar.id,
            }));
          } else {
            // Sin correo del destinatario: cae en el resumen admin igual (fila
            // pendiente), pero no se le puede escribir al cliente.
            filasAdmin[filasAdmin.length - 1].estado = 'pendiente (sin correo)';
          }
        } else {
          // Sin contrato vivo (solicitud aprobada antes del módulo) o sin token.
          sinContrato++;
          filasAdmin.push({ titular, lugarNum: lugar.numero, nombre: lugar.nombre || '(sin nombre)', estado: 'sin contrato' });
        }
      }
    }

    eventosVentana.push({ slug, nombre: evNombre, ds: ce.ds, dias, stats: { total, firmados, pendientes, sinContrato } });
    totPendientes += pendientes;
    totSinContrato += sinContrato;

    if (pendientes > 0 || sinContrato > 0) {
      adminSecciones.push({ evento: evNombre, dias, total, firmados, pendientes, sinContrato, filas: filasAdmin });
    }
  }

  const adminEmail = adminSecciones.length ? _correoAdmin(adminSecciones) : null;

  return {
    eventosVentana,
    adminEmail,
    correosCliente,
    stats: {
      eventosEnVentana: eventosVentana.length,
      pendientes: totPendientes,
      sinContrato: totSinContrato,
      correosCliente: correosCliente.length,
    },
  };
}

// ── Correos (cadenas puras; aplicarModoPrueba se aplica al ENVIAR) ──

function _correoCliente({ to, nombreDest, evento, dias, token, tipo, lugarId }) {
  const link = `${SITE_URL}/contrato-viajero.html?token=${encodeURIComponent(token)}`;
  const cuandoTxt = dias === 1 ? 'mañana mismo' : `en ${dias} días`;
  const subject = `📜 Falta tu firma — ${evento} sale en ${dias} ${dias === 1 ? 'día' : 'días'}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 12px">Falta tu firma</h2>
      <p>Hola <b>${escapeHtml(primerNombre(nombreDest))}</b>, tu viaje a <b>${escapeHtml(evento)}</b> sale <b>${escapeHtml(cuandoTxt)}</b> y aún no tenemos tu contrato firmado.</p>
      <p><b>Sin firma no hay servicio</b>, así que fírmalo hoy para no quedarte sin lugar. Toma menos de 2 minutos desde tu celular.</p>
      <p style="margin:20px 0">
        <a href="${link}" style="background:#e8ff4c;color:#0a0a0a;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:800">Firmar mi contrato</a>
      </p>
      <p style="font-size:12px;color:#888;word-break:break-all">Si el botón no abre: ${link}</p>
      <p style="font-size:12px;color:#888">— Conecta Reynosa</p>
    </div>`;
  return { to, subject, html, tipo, lugarId };
}

function _correoAdmin(secciones) {
  // Asunto: si es un solo evento, el string exacto del spec; si son varios, el
  // más próximo + cuántos más.
  secciones.sort((a, b) => a.dias - b.dias);
  const s0 = secciones[0];
  const extra = secciones.length > 1 ? ` (+${secciones.length - 1} evento${secciones.length - 1 === 1 ? '' : 's'} más)` : '';
  const subject = `📜 Contratos sin firmar — ${s0.evento} sale en ${s0.dias} ${s0.dias === 1 ? 'día' : 'días'}${extra}`;

  const bloques = secciones.map((sec) => {
    const filas = sec.filas.map((f) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(f.titular)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">#${escapeHtml(f.lugarNum)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(f.nombre)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(f.estado)}</td>
      </tr>`).join('');
    return `
      <h3 style="margin:22px 0 4px">${escapeHtml(sec.evento)} — sale en ${sec.dias} ${sec.dias === 1 ? 'día' : 'días'}</h3>
      <p style="margin:0 0 8px;font-size:13px;color:#555">Firmados ${sec.firmados}/${sec.total} · pendientes ${sec.pendientes} · sin contrato ${sec.sinContrato}</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr>
          <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #111">Titular</th>
          <th style="padding:6px 10px;border-bottom:2px solid #111">Lugar</th>
          <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #111">Viajero</th>
          <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #111">Estado</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>`;
  }).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 6px">📜 Contratos sin firmar</h2>
      <p style="margin:0 0 4px;font-size:13px;color:#555">Viajeros con contrato pendiente o sin contrato en la ventana de aviso (7 días y últimos 3). "Sin firma no hay servicio".</p>
      ${bloques}
      <p style="margin-top:24px;font-size:12px;color:#888">Revisa Solicitudes Portal / Capsule → Pagos para dar seguimiento. — Radar de Contratos</p>
    </div>`;
  return { to: ADMIN_TO, subject, html };
}

// ── Envío (aplica modo prueba y hace el POST a Resend). Fail-soft. ──
async function enviar(from, to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return false;
  const mp = aplicarModoPrueba({ to: Array.isArray(to) ? to : [to], subject });
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: mp.to, subject: mp.subject, html }),
  }).catch((e) => { console.error('[contratos-alerta] Email:', e.message); return null; });
  return !!(r && r.ok);
}

// Lee filas por lote (evita URLs gigantes con in.(...) enorme).
async function leerEnLotes(tabla, campo, ids, select) {
  const LOTE = 100;
  const out = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const chunk = ids.slice(i, i + LOTE);
    const rows = await sb(`${tabla}?${campo}=in.(${chunk.map(encodeURIComponent).join(',')})&select=${select}&limit=5000`);
    if (Array.isArray(rows)) out.push(...rows);
  }
  return out;
}

exports.handler = async function () {
  console.log('[contratos-alerta] Iniciando:', new Date().toISOString());
  if (!SB_URL || !SB_KEY) {
    console.error('[contratos-alerta] Faltan PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY');
    return { statusCode: 500, body: 'Config faltante' };
  }

  // 1) HOY en hora MX. 'en-CA' → 'YYYY-MM-DD'.
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });

  // 2) Catálogo desplegado (best-effort). Sin catálogo no hay fechas → nada que hacer.
  const catalogo = await fetchCatalogo();
  if (!catalogo) {
    console.warn('[contratos-alerta] catálogo no disponible — corrida sin acción.');
    return { statusCode: 200, body: JSON.stringify({ ok: true, hoy: hoyISO, motivo: 'sin catálogo' }) };
  }

  // 3) Eventos cuya PRIMERA fecha (ds) cae en la ventana.
  const enVentana = [];
  let sinFecha = 0;
  for (const slug of Object.keys(catalogo)) {
    if (!/^[a-z0-9_-]+$/.test(slug)) continue; // slug raro → no se puede filtrar seguro
    const ce = catalogo[slug] || {};
    if (!ce.ds) { sinFecha++; continue; }
    const dias = _daysUntil(ce.ds, hoyISO);
    if (dias != null && VENTANA.includes(dias)) enVentana.push(slug);
  }
  if (!enVentana.length) {
    console.log(`[contratos-alerta] Fin. hoy=${hoyISO} eventos en ventana:0 (sinFecha:${sinFecha})`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, hoy: hoyISO, eventosEnVentana: 0 }) };
  }

  // 4) Por evento en ventana: solicitudes activas (en_pagos+pagado; multifecha
  //    con or=(eq,like slug%23*)). El or=(...) se pega CRUDO a la URL.
  const solicitudesPorSlug = {};
  const todasSols = [];
  for (const slug of enVentana) {
    const orEvento = `or=(evento_id.eq.${slug},evento_id.like.${slug}%23*)`;
    const estadoIn = `estado=in.(${ESTADOS_ACTIVOS.join(',')})`;
    let sols = [];
    try {
      sols = await sb(`solicitudes_tour?${estadoIn}&${orEvento}&select=id,evento_id,evento_nombre,cliente_id&limit=2000`);
    } catch (e) {
      console.error(`[contratos-alerta] solicitudes de ${slug}:`, e.message);
    }
    solicitudesPorSlug[slug] = Array.isArray(sols) ? sols : [];
    todasSols.push(...solicitudesPorSlug[slug]);
  }

  // 5) Lugares activos de esas solicitudes.
  const solIds = [...new Set(todasSols.map(s => s.id).filter(Boolean))];
  const lugares = solIds.length
    ? await leerEnLotes('lugares', 'solicitud_id', solIds, 'id,numero,nombre,cliente_id,solicitud_id,estado')
    : [];
  const lugaresPorSol = {};
  for (const l of lugares) {
    if (!l || l.estado !== 'activo') continue;
    (lugaresPorSol[l.solicitud_id] = lugaresPorSol[l.solicitud_id] || []).push(l);
  }

  // 6) Contratos VIVOS (no anulados) de esos lugares.
  const lugarIds = lugares.filter(l => l && l.estado === 'activo').map(l => l.id);
  const contratos = lugarIds.length
    ? await leerEnLotes('contratos_viajeros', 'lugar_id', lugarIds, 'lugar_id,estado,token')
    : [];
  // (contratos vivos: filtramos anulados en JS por si el select trae de más)
  const contratoPorLugar = {};
  for (const c of contratos) {
    if (!c || c.estado === 'anulado') continue;
    contratoPorLugar[c.lugar_id] = { estado: c.estado, token: c.token };
  }

  // 7) Clientes (dueños de lugar + titulares) para resolver correo/nombre.
  const cliIds = [...new Set([
    ...todasSols.map(s => s.cliente_id),
    ...lugares.map(l => l && l.cliente_id),
  ].filter(Boolean))];
  const clientes = cliIds.length
    ? await leerEnLotes('clientes', 'id', cliIds, 'id,nombre_completo,correo')
    : [];
  const correoPorCliente = {}, nombrePorCliente = {};
  for (const c of clientes) {
    if (!c || !c.id) continue;
    const correo = c.correo && String(c.correo).trim().toLowerCase();
    if (correo && correo.includes('@')) correoPorCliente[c.id] = correo;
    nombrePorCliente[c.id] = c.nombre_completo || '';
  }

  // 8) Plan puro.
  const plan = _construirPlan({
    catalogo, hoyISO, solicitudesPorSlug, lugaresPorSol, contratoPorLugar, correoPorCliente, nombrePorCliente,
  });

  // 9) Enviar (allSettled: un correo que truene no tira la corrida).
  let adminEnviado = false;
  if (plan.adminEmail) {
    adminEnviado = await enviar(FROM_ADMIN, plan.adminEmail.to, plan.adminEmail.subject, plan.adminEmail.html);
  }
  const resCli = await Promise.allSettled(
    plan.correosCliente.map(c => enviar(FROM_CLIENTE, c.to, c.subject, c.html))
  );
  let cliEnviados = 0, cliFallidos = 0;
  for (const r of resCli) {
    if (r.status === 'fulfilled' && r.value === true) cliEnviados++;
    else cliFallidos++;
  }

  console.log(
    `[contratos-alerta] Fin. hoy=${hoyISO} eventosEnVentana=${plan.stats.eventosEnVentana} ` +
    `pendientes=${plan.stats.pendientes} sinContrato=${plan.stats.sinContrato} ` +
    `adminEnviado=${adminEnviado} clienteEnviados=${cliEnviados} clienteFallidos=${cliFallidos} sinFecha=${sinFecha}`
  );
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true, hoy: hoyISO,
      eventosEnVentana: plan.stats.eventosEnVentana,
      pendientes: plan.stats.pendientes,
      sinContrato: plan.stats.sinContrato,
      adminEnviado, clienteEnviados: cliEnviados, clienteFallidos: cliFallidos,
    }),
  };
};

// Exports para el arnés de verificación (no los usa Netlify).
exports._construirPlan = _construirPlan;
exports._daysUntil = _daysUntil;
exports.VENTANA = VENTANA;
