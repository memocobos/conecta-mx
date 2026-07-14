// =============================================================================
// portal-nueva-solicitud
//
// Se dispara desde el frontend del portal después de un INSERT exitoso a
// public.solicitudes_tour. Manda un email al admin con el resumen.
//
// Seguridad:
//   - Valida el JWT del cliente con Supabase Auth (GET /auth/v1/user).
//   - Lee la solicitud con service_role key.
//   - Verifica que solicitud.auth_user_id === jwt.user.id.
//   Sin esto, cualquiera con curl puede spammear al admin con cualquier UUID.
//
// Variables de entorno requeridas (Netlify):
//   - PORTAL_SUPABASE_URL
//   - PORTAL_SUPABASE_ANON_KEY
//   - PORTAL_SUPABASE_SERVICE_KEY
//   - RESEND_KEY (o RESEND_API_KEY como fallback)
// =============================================================================

const { aplicarModoPrueba } = require('./_lib/correo-guard');

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
  const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;

  if (!SB_URL || !SB_ANON || !SB_SERVICE || !RESEND_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Faltan env vars (PORTAL_SUPABASE_*, RESEND_KEY)' }),
    };
  }

  // ---- 1. Validar JWT ----
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Falta Authorization Bearer' }) };
  }

  let user;
  try {
    const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${jwt}` },
    });
    if (!userResp.ok) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT inválido o expirado' }) };
    }
    user = await userResp.json();
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo validar el JWT', detail: e.message }) };
  }

  // ---- 2. Parsear payload ----
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) };
  }
  const solicitudId = body.solicitud_id;
  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitud_id inválido' }) };
  }

  // ---- 3. Leer solicitud + cliente con service_role ----
  let solicitud, cliente;
  try {
    const sResp = await fetch(
      `${SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}&select=*`,
      { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } }
    );
    const sArr = await sResp.json();
    solicitud = Array.isArray(sArr) ? sArr[0] : null;
    if (!solicitud) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
    }

    // ---- 4. Autorización: la solicitud debe ser del usuario del JWT ----
    if (solicitud.auth_user_id !== user.id) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Esta solicitud no te pertenece' }) };
    }

    const cResp = await fetch(
      `${SB_URL}/rest/v1/clientes?id=eq.${solicitud.cliente_id}&select=numero_cliente,nombre_completo,correo,celular`,
      { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } }
    );
    const cArr = await cResp.json();
    cliente = Array.isArray(cArr) ? cArr[0] : null;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando Supabase', detail: e.message }) };
  }

  if (!cliente) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cliente no encontrado' }) };
  }

  // ---- 5. Armar y enviar email ----
  const fmtMxn = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });

  // [cordura-precio] Chequeos baratos contra precios manipulados. NO recalcula la
  // tarifa (vive en el portal); solo marca valores absurdos para que el admin los
  // revise antes de aceptar. PISO_PP_MXN es un piso de cordura por persona, ajustable.
  const PISO_PP_MXN = 500;
  const _precio = Number(solicitud.precio_total);
  const _separo = Number(solicitud.monto_separo);
  const _np     = Number(solicitud.num_personas) || 0;
  const alertasCordura = [];
  if (!(_precio > 0))                                   alertasCordura.push('Precio total ≤ 0');
  if (!(_separo > 0))                                   alertasCordura.push('Separo ≤ 0');
  if (_precio > 0 && _separo > _precio)                 alertasCordura.push('Separo mayor al precio total');
  if (!(_np >= 1 && _np <= 9))                          alertasCordura.push('Número de personas fuera de 1–9');
  if (_np >= 1 && _precio > 0 && _precio < _np * PISO_PP_MXN)
                                                        alertasCordura.push(`Precio por persona muy bajo (menor a ${fmtMxn(PISO_PP_MXN)})`);

  const fechaSolicitud = new Date(solicitud.created_at).toLocaleString('es-MX', {
    timeZone: 'America/Monterrey',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const subject = `Nueva solicitud — ${cliente.nombre_completo} — ${solicitud.evento_nombre}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff;padding:0">
      <div style="background:#e8ff4c;color:#000;padding:18px 22px;border-bottom:4px solid #ff283b">
        <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Portal · Nueva solicitud</div>
        <div style="font-size:22px;font-weight:900;margin-top:4px">${escapeHtml(solicitud.evento_nombre)}</div>
      </div>
      <div style="padding:22px;background:#0a0a0a">
        ${alertasCordura.length ? `
        <div style="background:#ff283b;color:#fff;padding:14px 16px;border-radius:8px;margin-bottom:18px;font-size:13px;font-weight:700">
          ⚠️ REVISAR PRECIO antes de aceptar:
          <ul style="margin:8px 0 0;padding-left:20px;font-weight:600">
            ${alertasCordura.map(a => `<li>${a}</li>`).join('')}
          </ul>
          <div style="margin-top:8px;font-weight:600">Recibido — Precio: ${fmtMxn(solicitud.precio_total)} · Separo: ${fmtMxn(solicitud.monto_separo)} · Personas: ${solicitud.num_personas}</div>
        </div>` : ''}
        <table style="width:100%;border-collapse:collapse;color:#fff;font-size:14px">
          ${row('Cliente', `${escapeHtml(cliente.nombre_completo)} <span style="color:#e8ff4c;font-family:monospace">#${cliente.numero_cliente}</span>`)}
          ${row('Correo', escapeHtml(cliente.correo))}
          ${row('Celular', escapeHtml(cliente.celular || ''))}
          ${row('Evento', escapeHtml(solicitud.evento_nombre))}
          ${row('Paquete', `<b style="color:#e8ff4c">${escapeHtml(solicitud.paquete)}</b>`)}
          ${row('Zona', escapeHtml(solicitud.zona))}
          ${row('Personas', String(solicitud.num_personas))}
          ${solicitud.tipo_habitacion ? row('Habitación', capitalize(solicitud.tipo_habitacion)) : ''}
          ${solicitud.lleva_vuelo ? row('Vuelo propio', solicitud.codigo_vuelo ? escapeHtml(solicitud.codigo_vuelo) : 'Sí') : ''}
          ${solicitud.codigo_descuento ? row('Código', escapeHtml(solicitud.codigo_descuento)) : ''}
          ${row('Precio total', `<b>${fmtMxn(solicitud.precio_total)}</b>`)}
          ${row('Separo', `<b style="color:#e8ff4c">${fmtMxn(solicitud.monto_separo)}</b>`)}
          ${row('Solicitada', fechaSolicitud)}
          ${row('Comprobante', solicitud.comprobante_separo_url ? 'Sí (revisa Supabase Storage)' : '<span style="color:#ff9aa2">No subido</span>')}
          ${solicitud.notas_cliente ? row('Notas', `<i>${escapeHtml(solicitud.notas_cliente)}</i>`) : ''}
        </table>
        <div style="margin-top:22px;padding:14px;background:#000;border-left:4px solid #e8ff4c;font-size:12px;color:rgba(255,255,255,.7)">
          Solicitud <span style="font-family:monospace;color:#e8ff4c">${solicitud.id}</span><br>
          Procesar desde Kamehouse → Solicitudes (pendiente Fase 2.2b).
        </div>
      </div>
    </div>
  `;

  // ---- 5b. Confirmación AL CLIENTE (best-effort, FAIL-SOFT) ----
  // Cumple la promesa del portal de "te confirmamos por correo". Su fallo NUNCA
  // debe afectar el correo al admin ni el return de la función (try/catch propio).
  try {
    if (cliente.correo) {
      const primerNombre = String(cliente.nombre_completo || 'cliente').trim().split(/\s+/)[0] || 'cliente';
      const htmlCliente = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff;padding:0">
          <div style="background:#e8ff4c;color:#000;padding:18px 22px;border-bottom:4px solid #ff283b">
            <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Recibimos tu solicitud</div>
            <div style="font-size:22px;font-weight:900;margin-top:4px">${escapeHtml(solicitud.evento_nombre)}</div>
          </div>
          <div style="padding:22px;background:#0a0a0a">
            <p style="font-size:16px;font-weight:700;margin:0 0 14px">¡Hola ${escapeHtml(primerNombre)}!</p>
            <p style="font-size:14px;line-height:1.6;color:rgba(255,255,255,.85);margin:0 0 18px">
              Recibimos tu solicitud para tu viaje a <b style="color:#e8ff4c">${escapeHtml(solicitud.evento_nombre)}</b> y nuestro equipo ya la está revisando. Te confirmaremos muy pronto. Puedes seguir el estado desde tu portal cuando quieras.
            </p>
            <table style="width:100%;border-collapse:collapse;color:#fff;font-size:14px">
              ${row('Evento', escapeHtml(solicitud.evento_nombre))}
              ${row('Paquete', `<b style="color:#e8ff4c">${escapeHtml(solicitud.paquete)}</b>`)}
              ${row('Zona', escapeHtml(solicitud.zona))}
              ${row('Personas', String(solicitud.num_personas))}
              ${solicitud.tipo_habitacion ? row('Habitación', capitalize(solicitud.tipo_habitacion)) : ''}
              ${row('Precio total', `<b>${fmtMxn(solicitud.precio_total)}</b>`)}
              ${row('Separo', `<b style="color:#e8ff4c">${fmtMxn(solicitud.monto_separo)}</b>`)}
            </table>
            <p style="margin-top:22px;font-size:14px;color:rgba(255,255,255,.85)">¡Gracias por viajar con Conecta!</p>
          </div>
        </div>
      `;
      const __mp1 = aplicarModoPrueba({ to: [cliente.correo], subject: `✅ Recibimos tu solicitud para ${solicitud.evento_nombre}` });
      const rc = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Conecta Reynosa <admin@conectareynosa.mx>',
          to: __mp1.to,
          subject: __mp1.subject,
          html: htmlCliente,
        }),
      });
      if (!rc.ok) console.error('[nueva-solicitud] correo cliente no OK:', rc.status, await rc.text());
    }
  } catch (e) {
    console.error('[nueva-solicitud] correo cliente falló (no crítico):', e.message);
  }

  try {
    const __mp2 = aplicarModoPrueba({ to: ['admin@conectareynosa.mx'], subject });
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Portal Conecta <admin@conectareynosa.mx>',
        to: __mp2.to,
        reply_to: cliente.correo,
        subject: __mp2.subject,
        html,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: 'Resend rechazó', detail: data }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, email_id: data.id }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error mandando email', detail: e.message }) };
  }
};

// ---- helpers ----
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function row(k, v) {
  return `<tr><td style="padding:6px 0;color:rgba(255,255,255,.5);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;width:120px;vertical-align:top">${k}</td><td style="padding:6px 0;color:#fff">${v}</td></tr>`;
}
