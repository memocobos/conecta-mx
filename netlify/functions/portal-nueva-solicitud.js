// =============================================================================
// portal-nueva-solicitud  —  CANDADO DEL SERVIDOR (FASE B, stock con reloj)
//
// Antes: el cliente insertaba en solicitudes_tour y esta función solo mandaba
// correos. Ahora la función OWNS el insert para poder blindar la sobreventa:
//   (a) ANTES de insertar: si la zona está GESTIONADA (tiene compras) verifica
//       disponibilidad ≥ num_personas — si no alcanza, 409 amable.
//   (b) Al insertar sin comprobante en zona gestionada: hold_expira_at = now()+15
//       min (const HOLD_MINUTOS en _lib/disponibilidad). Con comprobante → NULL.
//   (c) DESPUÉS de insertar: re-verifica; si quedó sobrevendido (carrera del
//       último boleto) cancela SU PROPIA solicitud y responde 409 honesto.
//   Fails-loud: si la disponibilidad no se puede calcular (y el paquete lleva
//   boleto), NO inserta (mejor no vender que sobrevender). RIDE queda fuera.
//   Luego manda los correos (admin + cliente) como siempre.
//
// Seguridad: valida el JWT del cliente (GET /auth/v1/user); fuerza
// auth_user_id = jwt.user.id y estado = 'pendiente'; solo inserta columnas de
// una whitelist. El precio NO se recalcula aquí (vive en el portal); solo se
// marcan valores absurdos para el correo del admin.
//
// Variables de entorno requeridas (Netlify):
//   - PORTAL_SUPABASE_URL / _ANON_KEY / _SERVICE_KEY
//   - SUPABASE_URL_KAMEHOUSE / SUPABASE_SERVICE_KEY_KAMEHOUSE (para el candado)
//   - RESEND_KEY (o RESEND_API_KEY como fallback)
// =============================================================================

const { aplicarModoPrueba } = require('./_lib/correo-guard');
const { cargarDisponibilidad, evaluarZona, HOLD_MINUTOS } = require('./_lib/disponibilidad');

// Columnas que el cliente puede aportar al insert (whitelist anti-inyección).
const CAMPOS_INSERT = [
  'cliente_id', 'evento_id', 'evento_nombre', 'paquete', 'zona', 'num_personas',
  'tipo_habitacion', 'lleva_vuelo', 'codigo_vuelo', 'codigo_descuento',
  'precio_total', 'monto_separo', 'notas_cliente', 'comprobante_separo_url',
];

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
  const KH_URL     = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;

  if (!SB_URL || !SB_ANON || !SB_SERVICE || !RESEND_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars (PORTAL_SUPABASE_*, RESEND_KEY)' }) };
  }
  if (!KH_URL || !KH_SERVICE) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' }) };
  }

  const svc = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` };

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
  const entrada = (body && typeof body.solicitud === 'object' && body.solicitud) ? body.solicitud : body;

  // Whitelist + validación mínima.
  const fila = {};
  CAMPOS_INSERT.forEach((k) => { if (entrada[k] !== undefined) fila[k] = entrada[k]; });
  fila.auth_user_id = user.id;   // autoridad: SIEMPRE del JWT, jamás del cliente
  fila.estado = 'pendiente';     // el estado inicial no es negociable

  const numPersonas = parseInt(fila.num_personas, 10);
  if (!fila.cliente_id || !/^[0-9a-f-]{36}$/i.test(String(fila.cliente_id))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'cliente_id inválido' }) };
  }
  if (!fila.evento_id || !fila.paquete) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan evento_id o paquete' }) };
  }
  if (!Number.isInteger(numPersonas) || numPersonas < 1 || numPersonas > 9) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'num_personas fuera de 1–9' }) };
  }
  fila.num_personas = numPersonas;

  const paquete = String(fila.paquete).toUpperCase();
  const zona = String(fila.zona || '').trim();
  const eventoIdSolicitud = String(fila.evento_id); // clave verbatim (incluye #idx multifecha)
  const tieneComprobante = fila.comprobante_separo_url != null && String(fila.comprobante_separo_url).trim() !== '';

  // ---- 3. CANDADO (a): pre-check de disponibilidad para zonas con boleto ----
  // RIDE no consume boleto → fuera del control. Para el resto, si no se puede
  // calcular la disponibilidad, NO insertamos (fail-loud anti-sobreventa).
  let gestionadaBoleto = false;
  let holdISO = null;
  if (paquete !== 'RIDE') {
    const disp = await cargarDisponibilidad({
      khUrl: KH_URL, khKey: KH_SERVICE, portalUrl: SB_URL, portalKey: SB_SERVICE,
      evento_id: eventoIdSolicitud,
    });
    if (disp.error) {
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'No pudimos confirmar la disponibilidad ahora mismo. Intenta de nuevo en un momento.' }) };
    }
    const evz = evaluarZona(disp, zona, numPersonas);
    if (evz.gestionada) {
      gestionadaBoleto = true;
      if (evz.sinCupo) {
        const msg = evz.agotada
          ? `¡Ay! La zona "${zona}" se acaba de agotar. Elige otra zona, por favor.`
          : `La zona "${zona}" ya solo tiene ${Math.max(0, evz.restante)} lugar(es) y pediste ${numPersonas}. Ajusta la cantidad o elige otra zona.`;
        return { statusCode: 409, headers, body: JSON.stringify({ error: msg, restante: evz.restante }) };
      }
      // (b) reloj de 15 min solo si es gestionada y aún sin comprobante.
      if (!tieneComprobante) {
        holdISO = new Date(Date.now() + HOLD_MINUTOS * 60000).toISOString();
      }
    }
  }
  fila.hold_expira_at = holdISO; // null cuando no aplica (RIDE, no gestionada, o con comprobante)

  // ---- 4. INSERT con service_role ----
  let solicitud;
  try {
    const insResp = await fetch(`${SB_URL}/rest/v1/solicitudes_tour`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(fila),
    });
    const insArr = await insResp.json().catch(() => null);
    if (!insResp.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo crear la solicitud', detail: insArr }) };
    }
    solicitud = Array.isArray(insArr) ? insArr[0] : insArr;
    if (!solicitud || !solicitud.id) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Insert sin fila de respuesta' }) };
    }
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error creando la solicitud', detail: e.message }) };
  }

  // ---- 5. CANDADO (c): re-verifica; si quedó sobrevendida (carrera del último
  //       boleto), cancela SU PROPIA solicitud recién creada y responde 409 honesto.
  if (gestionadaBoleto) {
    const disp2 = await cargarDisponibilidad({
      khUrl: KH_URL, khKey: KH_SERVICE, portalUrl: SB_URL, portalKey: SB_SERVICE,
      evento_id: eventoIdSolicitud,
    });
    // Si el re-cálculo falla (transitorio), NO cancelamos una venta válida: el
    // pre-check ya pasó. Solo cancelamos cuando confirmamos sobreventa real.
    if (!disp2.error) {
      const evz2 = evaluarZona(disp2, zona, 1);
      if (evz2.gestionada && evz2.restante < 0) {
        try {
          await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitud.id}`, {
            method: 'PATCH',
            headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ estado: 'cancelado', hold_expira_at: null }),
          });
        } catch (e) { /* si falla el cancel, el admin lo verá; no dejamos de avisar al cliente */ }
        return { statusCode: 409, headers, body: JSON.stringify({ error: `¡Uy! La zona "${zona}" se agotó mientras confirmabas. No se te cobró nada; elige otra zona, por favor.` }) };
      }
    }
  }

  // ---- 6. Leer cliente para los correos ----
  let cliente;
  try {
    const cResp = await fetch(
      `${SB_URL}/rest/v1/clientes?id=eq.${solicitud.cliente_id}&select=numero_cliente,nombre_completo,correo,celular`,
      { headers: svc }
    );
    const cArr = await cResp.json();
    cliente = Array.isArray(cArr) ? cArr[0] : null;
  } catch (e) {
    // El cliente ya quedó creado; si falla la lectura para el correo, devolvemos
    // OK con la solicitud (el correo es best-effort) para no bloquear al usuario.
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, solicitud_id: solicitud.id, hold_expira_at: solicitud.hold_expira_at, hold_minutos: HOLD_MINUTOS, aviso: 'correo omitido' }) };
  }

  if (!cliente) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, solicitud_id: solicitud.id, hold_expira_at: solicitud.hold_expira_at, hold_minutos: HOLD_MINUTOS, aviso: 'cliente no encontrado para correo' }) };
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
    const data = await resp.json().catch(() => ({}));
    // El correo al admin es best-effort: la solicitud YA se creó (candado pasado).
    // Un fallo de Resend NO debe hacer creer al cliente que su reserva falló (evita
    // reintentos → duplicados). Se loguea y se responde OK igual.
    if (!resp.ok) console.error('[nueva-solicitud] correo admin no OK:', resp.status, JSON.stringify(data));
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, solicitud_id: solicitud.id, hold_expira_at: solicitud.hold_expira_at, hold_minutos: HOLD_MINUTOS, email_id: data && data.id }) };
  } catch (e) {
    console.error('[nueva-solicitud] correo admin falló (no crítico):', e.message);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, solicitud_id: solicitud.id, hold_expira_at: solicitud.hold_expira_at, hold_minutos: HOLD_MINUTOS }) };
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
