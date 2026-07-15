// =============================================================================
// admin-generar-plan-pagos
//
// Genera el plan de pagos (separo + quincenas) de una solicitud en el Supabase
// NUEVO (conecta-portal). Lo llama Kamehouse → Solicitudes Portal → modal
// "Cambiar estado" JUSTO ANTES de flipear el estado a 'en_pagos'
// (generar-primero: así nunca queda un tour en_pagos sin plan).
//
// Body JSON:
//   { solicitud_id: uuid,
//     pagos: [ { numero_pago:int, concepto:string, monto:number,
//                fecha_esperada:'YYYY-MM-DD' }, ... ] }
//
// El backend completa cliente_id y auth_user_id desde la solicitud, fija
// estado 'pendiente' y registrado_por con el admin del JWT. NO marca pagos
// como pagados (eso es Fase 2.3c).
//
// IDEMPOTENCIA: si la solicitud ya tiene pagos, NO inserta de nuevo y devuelve
// los existentes con { ya_existia: true }. Aprobar dos veces NO duplica el plan.
//
// Seguridad: mismo patrón que admin-solicitud-update-estado. Authorization:
// Bearer <JWT> validado por verifyAdminAuth(); roles maestro_roshi/bulma.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET. (Reusa las del portal — sin env vars nuevas.)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');
const { ensureLugares } = require('./_lib/portal-lugares');

const ESTADO_PAGO_INICIAL = 'pendiente';
const MAX_PAGOS = 20; // separo + hasta ~10 quincenas; 20 es tope defensivo holgado

// Correo de bienvenida al cliente (mismo patrón que portal-recordatorios-diario).
// Si falta la key NO se trona la generación del plan: se reporta correo_error.
const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
// Remitente de cara al CLIENTE (no el interno del equipo).
const RESEND_FROM = process.env.RESEND_FROM_COBRANZA || 'Conecta Reynosa <admin@conectareynosa.mx>';

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

  const auth = verifyAdminAuth(event, ['maestro_roshi','bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const solicitudId = body.solicitud_id;
  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitud_id inválido' }) };
  }

  // ── Validación del array de pagos ──────────────────────────────────────
  const pagos = body.pagos;
  if (!Array.isArray(pagos) || pagos.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pagos debe ser un array no vacío' }) };
  }
  if (pagos.length > MAX_PAGOS) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Demasiados pagos (máx ${MAX_PAGOS})` }) };
  }

  const numerosVistos = new Set();
  for (const p of pagos) {
    if (!p || typeof p !== 'object') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cada pago debe ser un objeto' }) };
    }
    if (!Number.isInteger(p.numero_pago) || p.numero_pago < 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'numero_pago debe ser entero >= 1' }) };
    }
    if (numerosVistos.has(p.numero_pago)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `numero_pago duplicado: ${p.numero_pago}` }) };
    }
    numerosVistos.add(p.numero_pago);
    if (typeof p.concepto !== 'string' || !p.concepto.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'concepto requerido' }) };
    }
    if (p.concepto.length > 200) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'concepto demasiado largo (máx 200)' }) };
    }
    if (typeof p.monto !== 'number' || !isFinite(p.monto) || p.monto < 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'monto debe ser número >= 0' }) };
    }
    if (typeof p.fecha_esperada !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha_esperada)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'fecha_esperada debe ser YYYY-MM-DD' }) };
    }
  }

  const restBase = `${env.PORTAL_SB_URL}/rest/v1/pagos`;
  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Traer la solicitud para obtener cliente_id y auth_user_id.
    // El SELECT incluye lo que ensureLugares necesita (num_personas/paquete/zona/
    // tipo_habitacion) además de lo del plan (cliente_id/auth_user_id/precio_total).
    const solUrl = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}&select=id,cliente_id,auth_user_id,evento_nombre,precio_total,num_personas,paquete,zona,tipo_habitacion`;
    const solR = await fetch(solUrl, { headers: sbHeaders });
    if (!solR.ok) {
      const detail = await solR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de solicitud', detail }) };
    }
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    if (!solicitud) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
    }

    // 2. IDEMPOTENCIA: si ya hay pagos para esta solicitud, no insertar de nuevo.
    const existUrl = `${restBase}?solicitud_id=eq.${solicitudId}&select=*&order=numero_pago.asc`;
    const existR = await fetch(existUrl, { headers: sbHeaders });
    if (!existR.ok) {
      const detail = await existR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de pagos', detail }) };
    }
    const existentes = await existR.json();
    if (Array.isArray(existentes) && existentes.length > 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ya_existia: true, pagos: existentes }) };
    }

    // 2.5 [fix integración] Asegurar los lugares ANTES de decidir el tipo de plan.
    //     El flujo de aprobar en kamehouse genera el plan ANTES de cambiar el
    //     estado (~línea 12408), y los lugares nacen en el cambio de estado (#222),
    //     DESPUÉS. Sin esto, aquí se verían 0 lugares → plan grupal, y el por-lugar
    //     (#229) nunca aplicaría en esa ruta (el walk-in funciona por orden inverso).
    //     ensureLugares es IDEMPOTENTE: si ya existen es no-op (el ensure posterior
    //     de update-estado también). Best-effort: si truena, seguimos al chequeo
    //     normal (peor caso degrada a grupal, como hoy; nunca rompe la generación).
    let lugaresAsegurados = 0;
    try {
      const ens = await ensureLugares({ portalUrl: env.PORTAL_SB_URL, portalHeaders: sbHeaders, solicitud });
      lugaresAsegurados = (ens && ens.creados) || 0;
    } catch (_e) {
      // best-effort: seguimos; el GET de abajo verá lo que ya exista.
    }

    // 3. ¿La solicitud tiene lugares activos (#222)? Entonces el plan va POR
    //    LUGAR: cada lugar sus cuotas por su propio precio, con las MISMAS
    //    fechas/estructura. Sin lugares (solicitudes previas al módulo) → plan
    //    grupal de siempre, lugar_id null (COMPAT TOTAL). Los lugares
    //    baja/traspasado NO reciben plan (filtro estado=activo).
    const lugUrl = `${env.PORTAL_SB_URL}/rest/v1/lugares?solicitud_id=eq.${solicitudId}&estado=eq.activo&select=id,numero,precio,cliente_id&order=numero.asc`;
    const lugR = await fetch(lugUrl, { headers: sbHeaders });
    if (!lugR.ok) {
      const detail = await lugR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de lugares', detail }) };
    }
    const lugaresRaw = await lugR.json();
    const lugares = Array.isArray(lugaresRaw) ? lugaresRaw : [];

    const registradoPor = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';
    const baseRow = (extra) => ({
      solicitud_id:   solicitud.id,
      estado:         ESTADO_PAGO_INICIAL,
      registrado_por: registradoPor,
      ...extra,
    });

    const planPorLugar = lugares.length > 0;
    const lugaresPlanificados = lugares.length;
    let rows;

    if (!planPorLugar) {
      // ── Plan GRUPAL (comportamiento actual, INTACTO). lugar_id null. ──
      rows = pagos.map((p) => baseRow({
        cliente_id:     solicitud.cliente_id,
        auth_user_id:   solicitud.auth_user_id,
        lugar_id:       null,
        numero_pago:    p.numero_pago,
        concepto:       p.concepto.trim(),
        monto:          p.monto,
        fecha_esperada: p.fecha_esperada,
      }));
    } else {
      // ── Plan POR LUGAR. Cada lugar suma EXACTO su precio. ──
      const numLugares = lugares.length;
      const planTotal = pagos.reduce((s, p) => s + p.monto, 0);
      const precioTotalSol = Number(solicitud.precio_total) || 0;

      // Precio de cada lugar: su lugar.precio; si null → precio_total/numLugares.
      const preciosLugar = lugares.map((l) =>
        (l.precio != null && isFinite(Number(l.precio)))
          ? Number(l.precio)
          : round2(precioTotalSol / numLugares)
      );

      // Candado: nunca generar planes en $0 por accidente. Si el plan cobra algo
      // (alguna cuota > 0) pero algún lugar quedó en precio <= 0 → error claro.
      const hayCuotaConMonto = pagos.some((p) => p.monto > 0);
      if (hayCuotaConMonto && preciosLugar.some((pr) => pr <= 0)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Configura el precio de los lugares antes de generar el plan' }) };
      }

      // auth_user_id de cada lugar YA aceptado (cliente_id propio). El titular y
      // los lugares aún sin aceptar heredan cliente_id/auth_user_id de la solicitud.
      const cids = [...new Set(lugares.map((l) => l.cliente_id).filter(Boolean))];
      const authByCliente = {};
      if (cids.length) {
        const inList = cids.map((id) => encodeURIComponent(id)).join(',');
        const cliR = await fetch(
          `${env.PORTAL_SB_URL}/rest/v1/clientes?id=in.(${inList})&select=id,auth_user_id`,
          { headers: sbHeaders }
        );
        if (!cliR.ok) {
          const detail = await cliR.text();
          return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de clientes de lugares', detail }) };
        }
        (await cliR.json()).forEach((c) => { authByCliente[c.id] = c.auth_user_id; });
      }

      rows = [];
      lugares.forEach((l, li) => {
        const precioLugar = preciosLugar[li];
        const cid = l.cliente_id || solicitud.cliente_id;
        const aid = l.cliente_id ? (authByCliente[l.cliente_id] || null) : solicitud.auth_user_id;
        let acum = 0;
        pagos.forEach((c, ci) => {
          const esUltima = ci === pagos.length - 1;
          // Todas menos la última: proporcional al precio del lugar. La última
          // cuadra los centavos (precio − suma anteriores) → suma EXACTA, nunca
          // se pierde ni se inventa dinero.
          const monto = esUltima
            ? round2(precioLugar - acum)
            : (planTotal > 0 ? round2(c.monto * (precioLugar / planTotal)) : 0);
          if (!esUltima) acum += monto;
          rows.push(baseRow({
            cliente_id:     cid,
            auth_user_id:   aid,
            lugar_id:       l.id,
            numero_pago:    c.numero_pago,
            concepto:       c.concepto.trim(),
            monto,
            fecha_esperada: c.fecha_esperada,
          }));
        });
      });
    }

    const insR = await fetch(restBase, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(rows),
    });
    if (!insR.ok) {
      const detail = await insR.text();
      // 23505 = unique_violation → posible carrera con otra aprobación simultánea.
      // Tratamos como idempotente SOLO si el re-fetch trae filas.
      if (insR.status === 409 || detail.includes('23505')) {
        const reR = await fetch(existUrl, { headers: sbHeaders });
        const yaPagos = (reR.ok ? await reR.json() : []) || [];
        // [piloto jul-2026] Si el re-fetch trae 0 filas, el 23505/409 NO fue una
        // carrera: el insert falló DE VERDAD (p.ej. una restricción UNIQUE mal
        // puesta) y responder ya_existia:true con cero cuotas lo enmascara como
        // éxito — así se nos escondió el bug de la UNIQUE. NO fingir éxito:
        // devolver el 502 con el detail original del insert.
        if (Array.isArray(yaPagos) && yaPagos.length > 0) {
          return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ya_existia: true, pagos: yaPagos }) };
        }
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la inserción del plan', detail }) };
      }
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la inserción del plan', detail }) };
    }
    const insertados = await insR.json();

    // 4. Correo de bienvenida al cliente con su plan completo (solo en la
    //    primera generación — ya_existia:false). Best-effort: un fallo aquí NO
    //    revierte el plan, solo se reporta.
    const correoInfo = {};
    if (!RESEND_KEY) {
      correoInfo.correo_error = 'Resend no configurado';
    } else {
      try {
        const cliR = await fetch(
          `${env.PORTAL_SB_URL}/rest/v1/clientes?id=eq.${encodeURIComponent(solicitud.cliente_id)}&select=nombre_completo,correo`,
          { headers: sbHeaders }
        );
        if (!cliR.ok) throw new Error('clientes: ' + await cliR.text());
        const cliArr = await cliR.json();
        const cli = Array.isArray(cliArr) ? (cliArr[0] || {}) : {};
        const correo = (cli.correo && typeof cli.correo === 'string') ? cli.correo.trim() : '';
        if (!correo || !correo.includes('@')) {
          correoInfo.correo_enviado = false; // cliente sin correo válido
        } else {
          const nombre = String(cli.nombre_completo || 'cliente').trim().split(/\s+/)[0] || 'cliente';
          const eventoNombre = solicitud.evento_nombre || 'tu evento';
          const asunto = `🎫 Tu plan de pagos — ${eventoNombre}`;
          // El correo SIEMPRE muestra el plan GRUPAL (las cuotas que mandó Bulma,
          // totales sin cambiar) — no las filas por lugar. Si el grupo tiene 2+
          // lugares, se agrega una línea avisando que cada lugar lleva su plan.
          const grupoNota = (planPorLugar && lugaresPlanificados >= 2)
            ? `Tu grupo tiene ${lugaresPlanificados} lugares — cada lugar lleva su propio plan y saldo, visibles en el portal.`
            : '';
          const html = planHtml(nombre, eventoNombre, pagos, grupoNota);
          const __mp = aplicarModoPrueba({ to: correo, subject: asunto });
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: RESEND_FROM, to: __mp.to, subject: __mp.subject, html }),
          });
          correoInfo.correo_enviado = !!(r && r.ok);
          if (!(r && r.ok)) correoInfo.correo_error = 'Resend rechazó el envío';
        }
      } catch (e) {
        correoInfo.correo_enviado = false;
        correoInfo.correo_error = e.message;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, ya_existia: false, pagos: insertados, admin: { id: auth.user.id, correo: auth.user.correo }, plan_por_lugar: planPorLugar, lugares_planificados: lugaresPlanificados, lugares_asegurados: lugaresAsegurados, cuotas_insertadas: Array.isArray(insertados) ? insertados.length : rows.length, ...correoInfo }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error generando plan de pagos', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// "$1,234 MXN" — mismo formato que los correos de cobranza.
function fmtMxn(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-MX') + ' MXN';
}

// Redondeo a 2 decimales (centavos). Dinero: se usa en TODO el reparto por lugar.
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Envoltura HTML negra estilo Conecta MX (molde de portal-recordatorios-diario).
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

// Correo de bienvenida con el plan completo (todas las filas insertadas).
// grupoNota (opcional): línea extra cuando el grupo tiene 2+ lugares.
function planHtml(nombre, eventoNombre, pagos, grupoNota) {
  const rows = [...(Array.isArray(pagos) ? pagos : [])].sort((a, b) => (a.numero_pago || 0) - (b.numero_pago || 0));
  const total = rows.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const filas = rows.map((p) => {
    const abono = escapeHtml(p.concepto || ('Abono ' + p.numero_pago));
    const monto = escapeHtml(fmtMxn(p.monto));
    const fecha = escapeHtml(String(p.fecha_esperada || '').slice(0, 10));
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.1)">${abono}</td>
      <td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.1);text-align:right;white-space:nowrap">${monto}</td>
      <td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.1);text-align:right;white-space:nowrap">${fecha}</td>
    </tr>`;
  }).join('');
  const cuerpo = `<p style="margin:0 0 14px 0">¡Tu lugar para <strong>${escapeHtml(eventoNombre)}</strong> quedó apartado! Este es tu plan de pagos:</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px 0">
    <thead><tr style="color:rgba(255,255,255,.55);font-size:12px;text-transform:uppercase;letter-spacing:.08em">
      <th style="padding:8px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.2)">Abono</th>
      <th style="padding:8px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.2)">Monto</th>
      <th style="padding:8px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.2)">Fecha límite</th>
    </tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr>
      <td style="padding:10px;font-weight:900">Total</td>
      <td style="padding:10px;text-align:right;font-weight:900;color:#e8ff4c;white-space:nowrap">${escapeHtml(fmtMxn(total))}</td>
      <td></td>
    </tr></tfoot>
  </table>
  <p style="margin:0 0 14px 0;font-size:13px;color:rgba(255,255,255,.7)">Cada abono debe cubrirse a más tardar en su fecha límite. Recuerda que los pagos no son reembolsables salvo cancelación total del evento.</p>
  ${grupoNota ? `<p style="margin:0 0 14px 0;font-size:13px;color:#e8ff4c">${escapeHtml(grupoNota)}</p>` : ''}
  <p style="margin:0">Cualquier duda, respóndenos por WhatsApp. — Conecta Reynosa</p>`;
  return wrapHtml(nombre, cuerpo);
}
