// =============================================================================
// admin-avisar-cancelacion  (Cancelar evento — Fase 2: aviso a clientes)
//
// Tras cancelar un evento (Fase 1 ya creó las filas en `reembolsos`), el admin
// dispara este aviso. Manda a cada cliente con reembolso PENDIENTE un correo que
// informa la cancelación, su monto a reembolsar, y le pide responder con sus
// datos bancarios (Opción A: el cliente responde el correo; el admin captura los
// datos en el panel de Fase 3). Solo lee `reembolsos` (KH) + Resend. NO cruza
// Portal. Reenviable (no bloquea, no marca nada).
//
// Body JSON: { slug }
//
// Seguridad/molde de admin-avisar-posposicion: corsCheck + verifyAdminAuth(['maestro_roshi']).
//
// Env vars:
//   - KH: SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE  (reembolsos)
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

  const khHeaders = { apikey: env.KH_KEY, Authorization: `Bearer ${env.KH_KEY}` };

  try {
    // 1. KH: reembolsos PENDIENTES del evento.
    const rRes = await fetch(
      `${env.KH_URL}/rest/v1/reembolsos?evento_slug=eq.${encodeURIComponent(slug)}&estado=eq.pendiente`
      + `&select=cliente_nombre,cliente_correo,monto,evento_nombre`,
      { headers: khHeaders }
    );
    if (!rRes.ok) {
      const detail = await rRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta de reembolsos', detail }) };
    }
    const reembolsos = await rRes.json();
    if (!Array.isArray(reembolsos) || !reembolsos.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, total: 0, enviados: 0, mensaje: 'No hay reembolsos pendientes' }) };
    }

    const eventoNombre = (reembolsos[0] && reembolsos[0].evento_nombre) || slug;

    // 2. Correos válidos, dedup por correo.
    const vistos = new Set();
    const destinatarios = [];
    for (const r of reembolsos) {
      const correo = (r && typeof r.cliente_correo === 'string') ? r.cliente_correo.trim().toLowerCase() : '';
      if (!correo || !correo.includes('@')) continue;
      if (vistos.has(correo)) continue;
      vistos.add(correo);
      destinatarios.push({ correo, nombre: r.cliente_nombre, monto: r.monto, evento: r.evento_nombre || eventoNombre });
    }
    if (!destinatarios.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, evento_nombre: eventoNombre, total: 0, enviados: 0, mensaje: 'No hay reembolsos pendientes con correo' }) };
    }

    // 3. Mandar el aviso de cancelación + reembolso a cada cliente.
    const resultados = await Promise.allSettled(destinatarios.map(d => {
      const subject = `Cancelación de ${d.evento} y tu reembolso`;
      const html = avisoHtml(d.nombre, d.evento, d.monto);
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
      body: JSON.stringify({ ok: true, evento_nombre: eventoNombre, total: destinatarios.length, enviados, fallidos }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error avisando la cancelación', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_URL     = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY     = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KH_URL || !KH_KEY || !RESEND_KEY) {
    return { error: 'Faltan env vars (KH Supabase y RESEND_KEY)' };
  }
  return { KH_URL, KH_KEY, RESEND_KEY };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// número → "$1,234.00" (es-MX).
function fmtMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n) || 0);
}

function avisoHtml(nombre, eventoNombre, monto) {
  const ev = escapeHtml(eventoNombre);
  const nom = escapeHtml(nombre || 'viajero');
  const mxn = escapeHtml(fmtMXN(monto));
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span>
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${nom}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">
      <p style="margin:0 0 14px 0">Lamentamos informarte que <b style="color:#e8ff4c">${ev}</b> fue cancelado. Te reembolsaremos íntegramente lo que pagaste: <b>${mxn}</b>.</p>
      <p style="margin:0 0 14px 0">Para procesar tu devolución, por favor responde a este correo con tus datos bancarios: <b>CLABE, banco y nombre del titular</b>. En cuanto los recibamos, haremos la transferencia.</p>
      <p style="margin:0 0 14px 0">Tu reembolso se realizará en un plazo de <b>15 (quince) a 20 (veinte) días naturales</b> posteriores a la confirmación de la cancelación; te notificaremos por correo electrónico el monto y la vía de devolución.</p>
      <p style="margin:0">Una disculpa por el inconveniente.</p>
    </div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
}
