// =============================================================================
// portal-lugar-invitar  (Acompañantes F2-t1 — ENVÍO de la invitación)
//
// La llama el TITULAR con su PROPIO JWT del portal para invitar a un acompañante
// (un "lugar" ya capturado con nombre + correo). Genera/usa un token único y le
// manda un correo con un link para ACEPTAR. La aceptación en sí (login/registro +
// ligar cliente) es la F2-t2; aquí SOLO se envía.
//
// Candados (todos server-side con service_role): mismos que portal-lugar-actualizar
// (JWT válido → dueño de la solicitud), más: numero>=2 (el titular no se invita a
// sí mismo), correo del lugar no vacío, y que aún no haya aceptado.
//
// El correo ES la operación (no best-effort): si Resend falla, la respuesta es 502.
//
// Seguridad (mismo patrón que portal-lugar-actualizar): valida el JWT con
// GET /auth/v1/user (apikey ANON), y lee/escribe con service_role.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY,
//   PORTAL_SUPABASE_SERVICE_KEY, RESEND_API_KEY (|| RESEND_KEY).
// =============================================================================

const crypto = require('crypto');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PORTAL_BASE = 'https://conectareynosa.mx/portal.html';
const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON    = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars (PORTAL_SUPABASE_*)' }) };
  }
  if (!RESEND_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Resend no configurado' }) };
  }

  // ---- 1. Validar el JWT del titular ----
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Falta Authorization Bearer' }) };
  }

  let user;
  try {
    const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt },
    });
    if (!userResp.ok) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT inválido o expirado' }) };
    }
    user = await userResp.json();
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo validar el JWT', detail: e.message }) };
  }
  if (!user || !user.id) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT sin usuario' }) };
  }

  // ---- 2. Body: lugar_id ----
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const lugarId = body && typeof body.lugar_id === 'string' ? body.lugar_id.trim() : '';
  if (!UUID_RE.test(lugarId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'lugar_id inválido' }) };
  }

  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // ---- 3. El lugar existe y está 'activo' ----
    const lugR = await fetch(
      `${SB_URL}/rest/v1/lugares?id=eq.${encodeURIComponent(lugarId)}`
      + `&select=numero,nombre,correo,estado,invitacion_token,invitacion_aceptada_at,solicitud_id&limit=1`,
      { headers: sbHeaders }
    );
    if (!lugR.ok) {
      const detail = await lugR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta del lugar', detail }) };
    }
    const lugArr = await lugR.json();
    const lugar = Array.isArray(lugArr) ? lugArr[0] : null;
    if (!lugar) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lugar no encontrado' }) };
    }
    if (lugar.estado !== 'activo') {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este lugar ya no se puede editar' }) };
    }

    // ---- 4. La solicitud es del usuario y no está cancelada ----
    const solR = await fetch(
      `${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(lugar.solicitud_id)}`
      + `&select=auth_user_id,estado,evento_nombre,cliente_id&limit=1`,
      { headers: sbHeaders }
    );
    if (!solR.ok) {
      const detail = await solR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de la solicitud', detail }) };
    }
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    if (!solicitud) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
    }
    if (solicitud.auth_user_id !== user.id) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Este lugar no es tuyo' }) };
    }
    if (solicitud.estado === 'cancelado') {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este tour fue cancelado' }) };
    }

    // ---- 5. Candados propios de la invitación ----
    if (Number(lugar.numero) < 2) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'El titular no necesita invitación' }) };
    }
    const correo = (lugar.correo && typeof lugar.correo === 'string') ? lugar.correo.trim() : '';
    if (!correo || !correo.includes('@')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Primero registra el correo' }) };
    }
    if (lugar.invitacion_aceptada_at) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Ya aceptó la invitación' }) };
    }

    // ---- 6. Token (reusa el existente si lo hay) + persistir enviada_at ----
    const reenvio = !!lugar.invitacion_token;
    const token = lugar.invitacion_token || crypto.randomUUID();
    const nowISO = new Date().toISOString();
    const patch = { invitacion_enviada_at: nowISO, updated_at: nowISO };
    if (!reenvio) patch.invitacion_token = token;

    const upR = await fetch(`${SB_URL}/rest/v1/lugares?id=eq.${encodeURIComponent(lugarId)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    if (!upR.ok) {
      const detail = await upR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo registrar la invitación', detail }) };
    }

    // ---- 7. Nombre del titular para el correo ----
    let titular = 'tu organizador';
    try {
      const cliR = await fetch(
        `${SB_URL}/rest/v1/clientes?id=eq.${encodeURIComponent(solicitud.cliente_id)}&select=nombre_completo&limit=1`,
        { headers: sbHeaders }
      );
      if (cliR.ok) {
        const cliArr = await cliR.json();
        const nom = Array.isArray(cliArr) && cliArr[0] && cliArr[0].nombre_completo;
        if (nom && String(nom).trim()) titular = String(nom).trim();
      }
    } catch (_) { /* fallback ya definido */ }

    // ---- 8. Enviar el correo (ES la operación: si falla → 502) ----
    const eventoNombre = solicitud.evento_nombre || 'un viaje';
    const url = `${PORTAL_BASE}?invitacion=${encodeURIComponent(token)}`;
    const asunto = `🎫 ${titular} te agregó a un viaje — ${eventoNombre}`;
    const html = invitarHtml(lugar.nombre, titular, eventoNombre, url);

    const __mp = aplicarModoPrueba({ to: correo, subject: asunto });
    const mailR = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: __mp.to, subject: __mp.subject, html }),
    }).catch(() => null);
    if (!mailR || !mailR.ok) {
      const detail = mailR ? await mailR.text() : 'fetch falló';
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo enviar el correo de invitación', detail }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, enviada: true, reenvio }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error enviando la invitación', detail: e.message }) };
  }
};

// ----- helpers -----

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Envoltura HTML negra estilo Conecta MX (molde de los correos del portal).
function wrapHtml(nombre, cuerpoHtml) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span>
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">${cuerpoHtml}</div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
}

function invitarHtml(nombreLugar, titular, eventoNombre, url) {
  const org = escapeHtml(titular);
  const ev  = escapeHtml(eventoNombre);
  const link = escapeHtml(url);
  const cuerpo = `
    <p style="margin:0 0 14px 0"><strong>${org}</strong> te registró en el viaje a <b style="color:#e8ff4c">${ev}</b> con Conecta Reynosa.</p>
    <p style="margin:0 0 18px 0">Para confirmar tu lugar y ver los detalles en tu portal, acepta aquí:</p>
    <p style="margin:0 0 18px 0"><a href="${link}" style="display:inline-block;background:#e8ff4c;color:#000;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:15px">Aceptar mi lugar</a></p>
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.55)">Si no reconoces este viaje, ignora este correo.</p>`;
  return wrapHtml(nombreLugar || 'viajero', cuerpo);
}
