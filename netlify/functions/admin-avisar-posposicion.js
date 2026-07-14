// =============================================================================
// admin-avisar-posposicion  (Módulo Posponer — Fase 2: aviso a clientes)
//
// Tras posponer (Fase 1) y republicar, el admin dispara este aviso. Lee la
// ÚLTIMA posposición del evento en la bitácora (KameHouse) y manda un correo a
// cada cliente ACTIVO del evento (Portal) avisando del cambio de fecha. SOLO
// LEE — no modifica nada. Cruza ambos proyectos Supabase (KH + Portal).
//
// Body JSON: { slug }
//
// Seguridad/molde de admin-posponer-evento: corsCheck + verifyAdminAuth(['maestro_roshi']).
//
// Env vars:
//   - KH:     SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE  (bitácora)
//   - Portal: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY        (clientes)
//   - RESEND_KEY (|| RESEND_API_KEY)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

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

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El slug es requerido' }) };

  const khHeaders     = { apikey: env.KH_KEY,     Authorization: `Bearer ${env.KH_KEY}` };
  const portalHeaders = { apikey: env.PORTAL_KEY, Authorization: `Bearer ${env.PORTAL_KEY}` };

  try {
    // 1. KH: última posposición registrada del evento.
    const posRes = await fetch(
      `${env.KH_URL}/rest/v1/eventos_posposiciones?evento_slug=eq.${encodeURIComponent(slug)}`
      + `&select=evento_nombre,fecha_anterior,fecha_nueva,motivo&order=creado_en.desc&limit=1`,
      { headers: khHeaders }
    );
    if (!posRes.ok) {
      const detail = await posRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta de la bitácora', detail }) };
    }
    const posRows = await posRes.json();
    const pos = Array.isArray(posRows) ? posRows[0] : null;
    if (!pos) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No hay una posposición registrada para este evento (pospónlo primero)' }) };
    }
    const eventoNombre  = pos.evento_nombre;
    const fechaAnterior = pos.fecha_anterior;
    const fechaNueva    = pos.fecha_nueva;
    const motivo        = pos.motivo;

    // 2a. Portal: solicitudes ACTIVAS (no canceladas) del evento.
    const solRes = await fetch(
      `${env.PORTAL_URL}/rest/v1/solicitudes_tour?evento_id=eq.${encodeURIComponent(slug)}&estado=neq.cancelado&select=cliente_id`,
      { headers: portalHeaders }
    );
    if (!solRes.ok) {
      const detail = await solRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Portal rechazó la consulta de solicitudes', detail }) };
    }
    const solRows = await solRes.json();
    const clienteIds = [...new Set((Array.isArray(solRows) ? solRows : []).map(s => s.cliente_id).filter(Boolean))];
    if (!clienteIds.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, total: 0, enviados: 0, mensaje: 'No hay clientes activos' }) };
    }

    // 2c. Portal: datos de esos clientes.
    const cliRes = await fetch(
      `${env.PORTAL_URL}/rest/v1/clientes?id=in.(${clienteIds.join(',')})&select=id,nombre_completo,correo`,
      { headers: portalHeaders }
    );
    if (!cliRes.ok) {
      const detail = await cliRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Portal rechazó la consulta de clientes', detail }) };
    }
    const cliRows = await cliRes.json();

    // 2d. Solo correos válidos, dedup por correo.
    const vistos = new Set();
    const destinatarios = [];
    for (const c of (Array.isArray(cliRows) ? cliRows : [])) {
      const correo = (c && typeof c.correo === 'string') ? c.correo.trim().toLowerCase() : '';
      if (!correo || !correo.includes('@')) continue;
      if (vistos.has(correo)) continue;
      vistos.add(correo);
      destinatarios.push({ correo, nombre: c.nombre_completo });
    }
    if (!destinatarios.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, total: 0, enviados: 0, mensaje: 'No hay clientes activos con correo' }) };
    }

    // 3. Mandar el aviso a cada cliente (Resend), en paralelo.
    const subject = `Tu viaje a ${eventoNombre} cambió de fecha`;
    const resultados = await Promise.allSettled(destinatarios.map(d => {
      const html = avisoHtml(d.nombre, eventoNombre, fechaAnterior, fechaNueva, motivo);
      const __mp = aplicarModoPrueba({ to: [d.correo], subject });
      return fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Conecta Reynosa <admin@conectareynosa.mx>', to: __mp.to, subject: __mp.subject, html }),
      });
    }));

    let enviados = 0, fallidos = 0;
    for (const r of resultados) {
      if (r.status === 'fulfilled' && r.value && r.value.ok) enviados++;
      else fallidos++;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        evento_nombre: eventoNombre,
        fecha_anterior: fechaAnterior,
        fecha_nueva: fechaNueva,
        total: destinatarios.length,
        enviados,
        fallidos,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error avisando la posposición', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_URL     = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY     = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const PORTAL_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KH_URL || !KH_KEY || !PORTAL_URL || !PORTAL_KEY || !RESEND_KEY) {
    return { error: 'Faltan env vars (KH + Portal Supabase y RESEND_KEY)' };
  }
  return { KH_URL, KH_KEY, PORTAL_URL, PORTAL_KEY, RESEND_KEY };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// "2026-04-20" → "20 de abril de 2026". Si no parsea, devuelve el original.
function fmtFecha(ds) {
  if (!ds) return '';
  const s = String(ds).slice(0, 10);
  const d = new Date(s + 'T12:00:00');
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Monterrey' });
}

function avisoHtml(nombre, eventoNombre, fechaAnterior, fechaNueva, motivo) {
  const ev = escapeHtml(eventoNombre);
  const nom = escapeHtml(nombre || 'viajero');
  const mot = (motivo && String(motivo).trim()) ? `<p style="margin:0 0 14px 0">Motivo: ${escapeHtml(motivo)}.</p>` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span>
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${nom}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">
      <p style="margin:0 0 14px 0">Te avisamos que tu viaje a <b style="color:#e8ff4c">${ev}</b> se movió del ${escapeHtml(fmtFecha(fechaAnterior))} al <b>${escapeHtml(fmtFecha(fechaNueva))}</b>.</p>
      ${mot}
      <p style="margin:0">Tu lugar y tu plan de pagos siguen vigentes para la nueva fecha. Cualquier duda, contáctanos.</p>
    </div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
}
