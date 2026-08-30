// =============================================================================
// admin-solicitud-update-estado
//
// PATCH del estado (y notas_admin opcional) de una solicitud en el Supabase
// NUEVO (conecta-portal). Usado por Kamehouse → Solicitudes Portal → modal
// "Cambiar estado".
//
// Body JSON:
//   { solicitud_id: uuid, nuevo_estado: 'pendiente'|'en_pagos'|'pagado'|'cancelado',
//     notas_admin?: string }
//
// Seguridad (Security Phase 2 — migrado a JWT): mismo patrón que
// admin-solicitudes-list. Authorization: Bearer <JWT> validado por
// verifyAdminAuth() en _lib/verify-admin.js.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { condicionVersion, noAlcanzo, respuestaChoque } = require('./_lib/candado-optimista');
const { ensureLugares } = require('./_lib/portal-lugares');
const { generarContratosDeSolicitud } = require('./_lib/contratos-viajeros');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const SITE_URL = (process.env.SITE_URL || process.env.URL || 'https://conectareynosa.mx').replace(/\/$/, '');
const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;

const ESTADOS_VALIDOS = ['pendiente','en_pagos','pagado','cancelado'];

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi','bulma','milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const solicitudId = body.solicitud_id;
  const nuevoEstado = body.nuevo_estado;
  const notas = typeof body.notas_admin === 'string' ? body.notas_admin.trim() : '';

  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitud_id inválido' }) };
  }
  if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'nuevo_estado inválido' }) };
  }
  if (notas.length > 2000) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'notas_admin demasiado largas (máx 2000)' }) };
  }

  // [CONC-4b] `version` es el `updated_at` que la ficha tenía delante. Es
  // OBLIGATORIA: ésta es la única escritura de `solicitudes_tour` donde un
  // humano tuvo la pantalla abierta un rato, y es justo donde dos admins se
  // pisan sin enterarse — uno cancela, el otro aprueba, gana el último clic.
  // La pantalla la manda desde el mismo commit que esta función; faltarla solo
  // puede ser una pestaña vieja, y ahí vale más un mensaje que se puede obedecer
  // que un candado que se apaga solo cuando más falta hace.
  const version = body.version;
  if (typeof version !== 'string' || !version.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({
      error: 'Falta la versión de la solicitud. Recarga la pantalla y vuelve a intentarlo.',
      falta_version: true,
    }) };
  }

  const patch = { estado: nuevoEstado };
  // Solo tocamos notas_admin si el admin escribió algo (string vacío equivale a "no cambiar").
  if (notas.length > 0) patch.notas_admin = notas;

  try {
    // [CONC-4b] Se escribe SOLO si la solicitud sigue como la pantalla la leyó.
    // La versión la mueve un TRIGGER (migraciones/CONC-4b-solicitudes-updated-at.sql),
    // no los endpoints: ninguno de los 14 la escribía a mano, y así se queda.
    const url = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}`
              + condicionVersion(version);
    const r = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: env.PORTAL_SB_SERVICE,
        Authorization: `Bearer ${env.PORTAL_SB_SERVICE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la actualización', detail }) };
    }
    const arr = await r.json();
    // Cero filas con condición son DOS cosas distintas y no se pueden confundir:
    // decirle «no existe» a quien fue ganado por otro admin lo manda a buscar una
    // solicitud que sí está.
    if (noAlcanzo(arr)) {
      const vivoR = await fetch(`${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}&select=id&limit=1`, {
        headers: { apikey: env.PORTAL_SB_SERVICE, Authorization: `Bearer ${env.PORTAL_SB_SERVICE}` },
      });
      const vivo = vivoR.ok ? (await vivoR.json().catch(() => []))[0] : null;
      if (vivo) return respuestaChoque(headers, 'esta solicitud');
    }
    const actualizada = Array.isArray(arr) ? arr[0] : null;
    if (!actualizada) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
    }

    // Al aprobar (en_pagos) se crean los N lugares de la solicitud. Best-effort:
    // un fallo aquí NO revierte el cambio de estado; solo se reporta. La fila que
    // regresó el PATCH (return=representation) ya trae los campos que necesitamos,
    // así que no hace falta un GET extra.
    const lugaresInfo = {};
    if (nuevoEstado === 'en_pagos') {
      const portalHeaders = {
        apikey: env.PORTAL_SB_SERVICE,
        Authorization: `Bearer ${env.PORTAL_SB_SERVICE}`,
        'Content-Type': 'application/json',
      };
      try {
        const res = await ensureLugares({ portalUrl: env.PORTAL_SB_URL, portalHeaders, solicitud: actualizada });
        lugaresInfo.lugares_creados = res.creados;
      } catch (e) {
        lugaresInfo.lugares_error = e.message;
      }

      // Contratos F2a: un contrato 'pendiente' por lugar + UN correo al titular.
      // Best-effort en su propio try: la aprobación NO debe fallar si esto falla.
      try {
        const cg = await generarContratosDeSolicitud({ portalUrl: env.PORTAL_SB_URL, portalHeaders, solicitud: actualizada });
        lugaresInfo.contratos_creados = cg.creados;
        if (cg.titularToken) {
          const mail = await enviarCorreoAceptacion(env, portalHeaders, actualizada, cg.titularToken);
          lugaresInfo.correo_aceptacion = mail;
        }
      } catch (e) {
        lugaresInfo.contratos_error = e.message;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, solicitud: actualizada, admin: { id: auth.user.id, correo: auth.user.correo }, ...lugaresInfo }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error actualizando solicitud', detail: e.message }) };
  }
};

// ----- helpers -----

// [C2-7] EL CORREO ÚNICO DE LA ACEPTACIÓN.
//
// Antes salían DOS en el mismo minuto —el plan desde admin-generar-plan-pagos y
// éste con el link de firma— y desde el buzón del cliente eso se lee como error,
// no como servicio. La causa era de SECUENCIA, no de plantilla: el plan se
// escribe ANTES de que exista el contrato, así que esa función nunca tiene el
// token. Quien tiene las dos mitades es esta: el plan ya está en la base y el
// token acaba de nacer. Así que aquí se cuenta UNA sola historia.
//
// El recordatorio de firma NO se toca: vive en contratos-alerta-cron con su
// propia plantilla ("📜 Falta tu firma — …"), y ése es el que le llega a quien
// pierde su link o firma a medias.
//
// Best-effort: NUNCA lanza (devuelve un string de estado). Pasa por
// aplicarModoPrueba, como todo correo de la casa.
async function enviarCorreoAceptacion(env, portalHeaders, solicitud, token) {
  try {
    if (!RESEND_KEY) return 'sin RESEND_KEY';
    let correo = '', nombre = 'cliente';
    if (solicitud.cliente_id) {
      const cr = await fetch(
        `${env.PORTAL_SB_URL}/rest/v1/clientes?id=eq.${encodeURIComponent(solicitud.cliente_id)}&select=correo,nombre_completo&limit=1`,
        { headers: portalHeaders }
      );
      if (cr.ok) {
        const a = await cr.json().catch(() => []);
        correo = (a[0] && a[0].correo) || '';
        nombre = String((a[0] && a[0].nombre_completo) || 'cliente').trim().split(/\s+/)[0] || 'cliente';
      }
    }
    if (!correo) return 'sin correo del titular';

    // El plan que la aceptación acabó de escribir. Si no está —porque su
    // generación falló—, el correo SALE IGUAL con el contrato y sin tabla: es
    // mejor que el cliente sepa que su lugar quedó y que hay algo que firmar,
    // que quedarse sin nada. El botón de recuperación del Palacio le manda el
    // plan después, con su propio correo.
    let cuotas = [];
    try {
      const pr = await fetch(
        `${env.PORTAL_SB_URL}/rest/v1/pagos?solicitud_id=eq.${encodeURIComponent(solicitud.id)}`
        + '&select=numero_pago,concepto,monto,fecha_esperada,estado&order=numero_pago.asc',
        { headers: portalHeaders }
      );
      if (pr.ok) cuotas = await pr.json().catch(() => []);
    } catch (e) { /* sin plan: sigue el correo */ }

    const evento = solicitud.evento_nombre || 'tu evento';
    const link = `${SITE_URL}/contrato-viajero.html?token=${encodeURIComponent(token)}`;
    // [C2-7 remate] El EVENTO va en el asunto: un cliente con dos viajes no sabe
    // de cuál le hablan hasta abrir. Se sacrifica el "plan de pagos y contrato"
    // del asunto —que el cuerpo dice completo en su primera línea— porque el
    // dato que distingue un correo de otro en la bandeja es el evento.
    const subject = '🎫 Tu lugar quedó apartado — ' + evento;

    const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // [C2-7 remate] "16 ago 2026", no "2026-08-16". Es la columna que el cliente
    // lee con el dedo, y una fecha ISO en un correo se lee como error de sistema.
    //
    // Se arma A MANO desde el texto 'YYYY-MM-DD' por dos razones, las dos reales:
    //   · new Date('2026-08-16') se parsea como MEDIANOCHE UTC, que en México es
    //     el 15 — la fecha se correría un día hacia atrás en TODAS las cuotas.
    //   · toLocaleDateString('es-MX') depende del ICU del runtime; si Netlify
    //     corre con ICU recortado, devuelve los meses en inglés sin avisar.
    // Una tabla de doce entradas no tiene ninguno de los dos problemas.
    const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const fmtFecha = (iso) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
      if (!m) return '';
      const mes = MESES_CORTOS[Number(m[2]) - 1];
      if (!mes) return '';
      return Number(m[3]) + ' ' + mes + ' ' + m[1];
    };
    const total = cuotas.reduce((a, p) => a + (Number(p.monto) || 0), 0);
    const filas = cuotas.map((p) => {
      const pagada = String(p.estado || '') === 'pagado';
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5">${escHtml(p.concepto || ('Abono ' + p.numero_pago))}`
        + (pagada ? ' <b style="color:#127c2b">· ya pagado</b>' : '') + `</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;text-align:right;white-space:nowrap">${escHtml(fmt(p.monto))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;text-align:right;white-space:nowrap">${escHtml(fmtFecha(p.fecha_esperada))}</td>
      </tr>`;
    }).join('');

    const tabla = cuotas.length ? `
      <h3 style="margin:22px 0 8px;font-size:15px">Tu plan de pagos</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="color:#666;font-size:12px;text-transform:uppercase;letter-spacing:.06em">
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #111">Abono</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #111">Monto</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #111">Fecha límite</th>
        </tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr>
          <td style="padding:10px;font-weight:800">Total</td>
          <td style="padding:10px;text-align:right;font-weight:800;white-space:nowrap">${escHtml(fmt(total))}</td>
          <td></td>
        </tr></tfoot>
      </table>
      <p style="font-size:13px;color:#555;margin:10px 0 0">Cada abono se cubre a más tardar en su fecha límite. Puedes verlos y pagarlos desde tu portal.</p>`
      : `<p style="font-size:13px;color:#555;margin:18px 0 0">Tu plan de pagos aparecerá en tu portal en un momento. Si no lo ves, escríbenos por WhatsApp y lo revisamos.</p>`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 12px">¡Tu lugar quedó apartado, ${escHtml(nombre)}!</h2>
        <p style="margin:0 0 14px">Ya eres parte de <b>${escHtml(evento)}</b>. Aquí tienes las dos cosas que necesitas: tu plan de pagos y tu contrato.</p>
        ${tabla}
        <h3 style="margin:26px 0 8px;font-size:15px">Falta tu firma</h3>
        <p style="margin:0 0 14px">Antes del viaje necesitamos tu contrato firmado. Se firma en un minuto, desde el celular.</p>
        <p style="margin:0 0 18px">
          <a href="${link}" style="background:#e8ff4c;color:#0a0a0a;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:800;display:inline-block">Firmar mi contrato</a>
        </p>
        <p style="font-size:13px;color:#555">Cada acompañante firma el suyo desde su propio portal — no necesitas firmar por ellos.</p>
        <p style="font-size:12px;color:#888;word-break:break-all">Si el botón no abre: ${link}</p>
        <p style="margin:18px 0 0">Cualquier duda, respóndenos por WhatsApp. — Conecta Reynosa</p>
      </div>`;

    const mp = aplicarModoPrueba({ to: [correo], subject });
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Portal Conecta <admin@conectareynosa.mx>', to: mp.to, subject: mp.subject, html }),
    });
    return resp.ok ? 'enviado' : ('resend ' + resp.status);
  } catch (e) {
    return 'error: ' + e.message;
  }
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
