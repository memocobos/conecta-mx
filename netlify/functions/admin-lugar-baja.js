// =============================================================================
// admin-lugar-baja  (Acompañantes F5-t1 — dar de BAJA un lugar)
//
// La ejecuta Bulma desde KameHouse. Política de Memo: si un integrante cancela o
// deja de pagar, cae SOLO SU LUGAR y pierde lo abonado (no hay reembolso — eso es
// distinto de la cancelación del EVENTO completo, que sí genera reembolsos). La
// baja la dispara un HUMANO; el traspaso es la t2.
//
// Seguridad/roles: molde admin-rooming-grupos (verifyAdminAuth + corsCheck,
// maestro_roshi/bulma). Env del PORTAL (las tablas viven ahí). Sin env nuevas.
//
// ANULACIÓN DE CUOTAS: admin-cancelar-evento cancela a nivel SOLICITUD (no toca
// pagos). Para una baja por-lugar ponemos las cuotas NO pagadas del lugar en
// 'cancelado' (estado válido de `pagos`: pendiente|pagado|vencido|cancelado), así
// salen de cobranza (los crons de #233 solo miran pendiente/vencido). Las cuotas
// PAGADAS jamás se tocan: lo abonado se pierde (política), no se devuelve.
//
// Env vars: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, JWT_SECRET,
//           RESEND_API_KEY (|| RESEND_KEY), RESEND_FROM_COBRANZA (opcional).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const UUID_RE = /^[0-9a-f-]{36}$/i;
const ROLES = ['maestro_roshi', 'bulma'];
const MAX_MOTIVO = 500;
const ESTADO_ANULADO = 'cancelado'; // valor de anulación en `pagos` (ver cabecera)
const TOLERANCIA_MXN = 1; // absorbe centavos del reparto (igual que admin-marcar-pago)

const PORTAL_URL = process.env.PORTAL_SUPABASE_URL;
const PORTAL_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!__origin) return json(403, { error: 'Origen no permitido' });

  const auth = verifyAdminAuth(event, ROLES);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  if (!PORTAL_URL || !PORTAL_KEY) {
    return json(500, { error: 'Portal Supabase no configurado (PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY)' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const lugarId = body.lugar_id;
  if (!lugarId || !UUID_RE.test(lugarId)) return json(400, { error: 'lugar_id inválido' });

  let motivo = body.motivo;
  if (motivo != null && typeof motivo !== 'string') return json(400, { error: 'motivo debe ser texto' });
  motivo = motivo ? String(motivo).trim().slice(0, MAX_MOTIVO) : '';

  const sbHeaders = {
    apikey: PORTAL_KEY,
    Authorization: 'Bearer ' + PORTAL_KEY,
    'Content-Type': 'application/json',
  };
  const enc = encodeURIComponent;

  try {
    // ---- 1. El lugar existe ----
    const lugR = await fetch(
      `${PORTAL_URL}/rest/v1/lugares?id=eq.${enc(lugarId)}&select=id,solicitud_id,numero,nombre,estado,notas&limit=1`,
      { headers: sbHeaders }
    );
    if (!lugR.ok) return json(502, { error: 'Supabase rechazó la consulta del lugar', detail: await lugR.text() });
    const lugArr = await lugR.json();
    const lugar = Array.isArray(lugArr) ? lugArr[0] : null;
    if (!lugar) return json(404, { error: 'Lugar no encontrado' });

    // ---- 2. Candados ----
    if (lugar.estado !== 'activo') return json(409, { error: 'Ese lugar ya está de baja o traspasado' });
    if (Number(lugar.numero) === 1) {
      return json(400, { error: 'La baja del titular es la cancelación de la solicitud — usa ese flujo' });
    }

    // ---- 3. La solicitud no debe estar cancelada (+ datos para el correo) ----
    const solR = await fetch(
      `${PORTAL_URL}/rest/v1/solicitudes_tour?id=eq.${enc(lugar.solicitud_id)}&select=id,estado,evento_nombre,cliente_id&limit=1`,
      { headers: sbHeaders }
    );
    if (!solR.ok) return json(502, { error: 'Supabase rechazó la consulta de la solicitud', detail: await solR.text() });
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    if (!solicitud) return json(404, { error: 'Solicitud no encontrada' });
    if (solicitud.estado === 'cancelado') return json(409, { error: 'Este tour fue cancelado' });
    const eventoNombre = solicitud.evento_nombre || 'tu viaje';

    const nowISO = new Date().toISOString();

    // ---- 4a. PATCH del lugar: baja + libera su cuarto + nota de baja ----
    const notaBaja = '[BAJA ' + hoyMx() + ']' + (motivo ? ' ' + motivo : '');
    const notasNuevas = (lugar.notas && String(lugar.notas).trim())
      ? (String(lugar.notas).trim() + '\n' + notaBaja)
      : notaBaja;
    const upLug = await fetch(`${PORTAL_URL}/rest/v1/lugares?id=eq.${enc(lugarId)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ estado: 'baja', habitacion_grupo_id: null, notas: notasNuevas, updated_at: nowISO }),
    });
    if (!upLug.ok) return json(502, { error: 'No se pudo dar de baja el lugar', detail: await upLug.text() });

    // ---- 4c. Contar lo abonado (PAGADAS, intactas) antes de anular las demás ----
    const pagR = await fetch(
      `${PORTAL_URL}/rest/v1/pagos?lugar_id=eq.${enc(lugarId)}&select=estado,monto,monto_pagado`,
      { headers: sbHeaders }
    );
    let abonadoDelLugar = 0;
    if (pagR.ok) {
      const pagos = await pagR.json();
      (Array.isArray(pagos) ? pagos : []).forEach(p => {
        if (p.estado === 'pagado') {
          const real = (p.monto_pagado == null) ? Number(p.monto || 0) : Number(p.monto_pagado || 0);
          abonadoDelLugar += Number.isFinite(real) ? real : 0;
        }
      });
    }

    // ---- 4b. PATCH de las cuotas NO pagadas del lugar → anuladas (las pagadas quedan) ----
    let cuotasAnuladas = 0;
    const upPag = await fetch(
      `${PORTAL_URL}/rest/v1/pagos?lugar_id=eq.${enc(lugarId)}&estado=neq.pagado`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ estado: ESTADO_ANULADO, updated_at: nowISO }),
      }
    );
    if (!upPag.ok) return json(502, { error: 'Lugar dado de baja, pero fallaron sus cuotas', detail: await upPag.text() });
    const anuladasArr = await upPag.json();
    cuotasAnuladas = Array.isArray(anuladasArr) ? anuladasArr.length : 0;

    // ---- 5. Correo al TITULAR (best-effort: un fallo NO revierte la baja) ----
    let correoTitular = false;
    try {
      const cliR = await fetch(
        `${PORTAL_URL}/rest/v1/clientes?id=eq.${enc(solicitud.cliente_id)}&select=nombre_completo,correo`,
        { headers: sbHeaders }
      );
      if (cliR.ok) {
        const cliArr = await cliR.json();
        const cli = Array.isArray(cliArr) ? (cliArr[0] || {}) : {};
        const correo = cli.correo && String(cli.correo).trim();
        if (correo && correo.includes('@')) {
          const nombre = String(cli.nombre_completo || 'cliente').trim().split(/\s+/)[0] || 'cliente';
          const quien = (lugar.nombre && String(lugar.nombre).trim()) ? String(lugar.nombre).trim() : ('Lugar #' + lugar.numero);
          const asunto = `⚠️ Un lugar de tu grupo fue dado de baja — ${eventoNombre}`;
          const cuerpo = `<p style="margin:0 0 14px 0">El lugar <strong>#${escapeHtml(lugar.numero)} (${escapeHtml(quien)})</strong> de tu viaje a <strong>${escapeHtml(eventoNombre)}</strong> fue dado de baja.</p>
          <p style="margin:0 0 14px 0">Lo que ese lugar había abonado <strong>no es reembolsable</strong> (política de Conecta).</p>
          <p style="margin:0 0 14px 0">Su cuarto quedó <strong>libre</strong> — entra a tu portal para reacomodar a tu gente.</p>
          <p style="margin:0">Si alguien más quiere tomar ese lugar, escríbenos por WhatsApp y lo <strong>traspasamos</strong> (conserva lo abonado y lo que falta por pagar).</p>`;
          correoTitular = await enviarCorreo(correo, asunto, wrapHtml(nombre, cuerpo));
        }
      }
    } catch (e) {
      console.error('[lugar-baja] correo al titular falló (no crítico):', e.message);
    }

    // ---- 6. Reconciliar el estado de la solicitud tras la baja (F5-t1b, best-effort).
    //         Cubre "todos los vivos ya habían liquidado y la baja era lo único que
    //         estorbaba" → el grupo pasa a 'pagado' en el momento. MISMA lógica de
    //         cuotas VIVAS que admin-marcar-pago / admin-aplicar-pago-grupo. Un fallo
    //         aquí NO revierte la baja (ya hecha arriba).
    let solicitudEstado = solicitud.estado;
    try {
      const allR = await fetch(
        `${PORTAL_URL}/rest/v1/pagos?solicitud_id=eq.${enc(lugar.solicitud_id)}&select=estado,monto,monto_pagado`,
        { headers: sbHeaders }
      );
      if (allR.ok) {
        const todos = await allR.json();
        const vivas = (Array.isArray(todos) ? todos : []).filter(p => p && p.estado !== 'cancelado');
        const sumaReal = vivas.reduce((acc, p) => {
          if (p.estado !== 'pagado') return acc;
          const real = (p.monto_pagado == null) ? Number(p.monto || 0) : Number(p.monto_pagado || 0);
          return acc + (Number.isFinite(real) ? real : 0);
        }, 0);
        const esperado = vivas.reduce((acc, p) => acc + (Number(p.monto || 0) || 0), 0);
        const dineroCuadra = sumaReal >= (esperado - TOLERANCIA_MXN);
        const todosPagados = vivas.length > 0 && vivas.every(p => p.estado === 'pagado');
        const estadoPrevio = solicitud.estado;
        let nuevoEstadoSol = null;
        if (todosPagados && dineroCuadra && estadoPrevio !== 'pagado') nuevoEstadoSol = 'pagado';
        else if ((!todosPagados || !dineroCuadra) && estadoPrevio === 'pagado') nuevoEstadoSol = 'en_pagos';

        if (nuevoEstadoSol) {
          const pS = await fetch(`${PORTAL_URL}/rest/v1/solicitudes_tour?id=eq.${enc(lugar.solicitud_id)}`, {
            method: 'PATCH',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ estado: nuevoEstadoSol }),
          });
          if (pS.ok) {
            solicitudEstado = nuevoEstadoSol;
            // Felicitación al titular si el grupo quedó liquidado (solo 'pagado').
            if (nuevoEstadoSol === 'pagado') {
              try {
                const cliR = await fetch(
                  `${PORTAL_URL}/rest/v1/clientes?id=eq.${enc(solicitud.cliente_id)}&select=nombre_completo,correo`,
                  { headers: sbHeaders }
                );
                if (cliR.ok) {
                  const c = (await cliR.json())[0] || {};
                  const correo = c.correo && String(c.correo).trim();
                  if (correo && correo.includes('@')) {
                    const nombre = String(c.nombre_completo || 'cliente').trim().split(/\s+/)[0] || 'cliente';
                    const asunto = `🎉 ¡Listo! Tu viaje a ${eventoNombre} está pagado`;
                    const cuerpo = `<p style="margin:0 0 14px 0">¡Felicidades! Tu viaje a <strong>${escapeHtml(eventoNombre)}</strong> quedó <strong>100% pagado</strong>. Tu lugar está asegurado.</p>
                    <p style="margin:0">Pronto te compartimos los detalles finales. ¡Nos vemos!</p>`;
                    await enviarCorreo(correo, asunto, wrapHtml(nombre, cuerpo));
                  }
                }
              } catch (e) { console.error('[lugar-baja] correo liquidado falló (no crítico):', e.message); }
            }
          }
        }
      }
    } catch (e) {
      console.error('[lugar-baja] reconciliación falló (no crítica):', e.message);
    }

    return json(200, {
      ok: true,
      cuotas_anuladas: cuotasAnuladas,
      abonado_del_lugar: Math.round(abonadoDelLugar * 100) / 100,
      correo_titular: correoTitular,
      solicitud_estado: solicitudEstado,
    });
  } catch (e) {
    return json(502, { error: 'Error dando de baja el lugar', detail: e.message });
  }
};

// ----- helpers -----

// Fecha de hoy en zona horaria de México (America/Monterrey), 'YYYY-MM-DD'.
function hoyMx() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Monterrey',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Remitente de cara al CLIENTE (no el interno de KameHouse).
const FROM = process.env.RESEND_FROM_COBRANZA || 'Conecta Reynosa <admin@conectareynosa.mx>';

// Envío fail-soft: true si se despachó; false si faltó key/destinatario o el fetch
// falló. NUNCA lanza (el .catch absorbe).
async function enviarCorreo(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return false;
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  }).catch((e) => { console.error('[lugar-baja] Email:', e.message); return null; });
  return !!(r && r.ok);
}

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
