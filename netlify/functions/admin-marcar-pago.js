// =============================================================================
// admin-marcar-pago  (Fase 2.3c — ESCRITURA)
//
// Marca UN pago como pagado (o lo revierte a pendiente) en la tabla `pagos`
// del Supabase NUEVO (conecta-portal). Lo usa Kamehouse → Solicitudes Portal →
// modal de detalle, sección "Plan de pagos". En cuanto un pago pasa a 'pagado',
// el cliente lo ve en portal.html (que suma los pagos 'pagado' como "abonado").
//
// Body JSON:
//   { pago_id: uuid, accion: 'pagar'|'revertir',
//     fecha_pagada?: 'YYYY-MM-DD', metodo?, referencia? }
//
// Lógica (service_role):
//   - 'pagar'    → estado='pagado', fecha_pagada (default hoy MX), metodo,
//                  referencia, registrado_por = admin del JWT.
//   - 'revertir' → estado='pendiente', fecha_pagada=null, metodo=null,
//                  referencia=null. (Deja el pago como estaba — reversible.)
//   Después de actualizar, reconcilia el estado de la solicitud:
//   - si TODOS los pagos quedan 'pagado'           → solicitud → 'pagado'.
//   - si NO todos y la solicitud estaba 'pagado'   → solicitud → 'en_pagos'.
//   Nunca borra filas: solo UPDATE.
//
// Seguridad: mismo patrón que admin-generar-plan-pagos. Authorization:
// Bearer <JWT> validado por verifyAdminAuth(); roles maestro_roshi/bulma.
// service_role SOLO aquí (backend), nunca en el front.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET. (Reusa las del portal — sin env vars nuevas.)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

// `metodo` = CÓMO pagó (solo formas de pago; ya no incluye bancos). La BD aún
// acepta los viejos (bbva/hey/otro) para no violar filas existentes, pero la UI
// y esta validación solo permiten los 3 nuevos.
const METODOS_VALIDOS = ['transferencia','deposito','efectivo'];
// `cuenta` = a qué cuenta ENTRÓ el dinero (distinto de `metodo`). Opcional.
const CUENTAS_VALIDAS = ['BBVA','Banamex','Efectivo','Otro'];
const MAX_REFERENCIA = 120;
const TOLERANCIA_MXN = 1; // absorbe redondeos de centavos en el reparto del plan

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

  const pagoId = body.pago_id;
  const accion = body.accion;
  if (!pagoId || !/^[0-9a-f-]{36}$/i.test(pagoId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pago_id inválido' }) };
  }
  if (accion !== 'pagar' && accion !== 'revertir') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "accion debe ser 'pagar' o 'revertir'" }) };
  }

  // ── Construir el patch según la acción ───────────────────────────────────
  let patch;
  if (accion === 'pagar') {
    const metodo = body.metodo;
    if (!METODOS_VALIDOS.includes(metodo)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'metodo inválido (transferencia|deposito|efectivo)' }) };
    }
    let fechaPagada = body.fecha_pagada;
    if (fechaPagada == null || fechaPagada === '') {
      fechaPagada = hoyMx();
    } else if (typeof fechaPagada !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaPagada)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'fecha_pagada debe ser YYYY-MM-DD' }) };
    }
    let referencia = body.referencia;
    if (referencia != null && typeof referencia !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'referencia debe ser texto' }) };
    }
    referencia = referencia ? String(referencia).trim() : '';
    if (referencia.length > MAX_REFERENCIA) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `referencia demasiado larga (máx ${MAX_REFERENCIA})` }) };
    }
    // monto_pagado opcional: monto REAL pagado. Si no viene, queda NULL y el
    // cálculo de abonado usa el monto del plan (COALESCE) — compatibilidad.
    let montoPagado = body.monto_pagado;
    if (montoPagado == null || montoPagado === '') {
      montoPagado = null;
    } else {
      montoPagado = Number(montoPagado);
      if (!Number.isFinite(montoPagado) || montoPagado < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'monto_pagado debe ser un número >= 0' }) };
      }
    }
    // cuenta opcional: a qué cuenta entró el dinero. Si viene, debe ser válida.
    let cuenta = body.cuenta;
    if (cuenta == null || cuenta === '') {
      cuenta = null;
    } else if (!CUENTAS_VALIDAS.includes(cuenta)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'cuenta inválida (BBVA|Banamex|Efectivo|Otro)' }) };
    }
    const registradoPor = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';
    patch = {
      estado:         'pagado',
      fecha_pagada:   fechaPagada,
      metodo:         metodo,
      cuenta:         cuenta,
      referencia:     referencia || null,
      registrado_por: registradoPor,
    };
    if (montoPagado !== null) patch.monto_pagado = montoPagado;
  } else {
    // revertir: deja el pago como estaba (pendiente, sin datos de pago).
    patch = { estado: 'pendiente', fecha_pagada: null, metodo: null, cuenta: null, referencia: null, monto_pagado: null };
  }

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1. UPDATE del pago. return=representation nos da la fila (incl. solicitud_id).
    const pagoUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?id=eq.${pagoId}`;
    const upR = await fetch(pagoUrl, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!upR.ok) {
      const detail = await upR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la actualización del pago', detail }) };
    }
    const upArr = await upR.json();
    const pago = Array.isArray(upArr) ? upArr[0] : null;
    if (!pago) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Pago no encontrado' }) };
    }

    // 2. Leer TODOS los pagos de la solicitud para reconciliar su estado.
    const solicitudId = pago.solicitud_id;

    // 1b. Auditoría BEST-EFFORT del acto HUMANO (pagar/revertir) en pagos_auditoria.
    // Toma los valores del `pago` YA actualizado (estado real aplicado). Su fallo
    // NUNCA rompe la operación. El vencido automático del cron NO pasa por aquí.
    try {
      const actor = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';
      await fetch(`${env.PORTAL_SB_URL}/rest/v1/pagos_auditoria`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          pago_id:      pago.id,
          solicitud_id: pago.solicitud_id,
          accion:       accion === 'pagar' ? 'pagado' : 'revertido',
          actor,
          monto_pagado: pago.monto_pagado ?? null,
          metodo:       pago.metodo ?? null,
          cuenta:       pago.cuenta ?? null,
        }),
      });
    } catch (e) {
      console.error('[marcar-pago] auditoría falló (no crítica):', e.message);
    }

    const allUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?solicitud_id=eq.${solicitudId}&select=estado,monto,monto_pagado`;
    const allR = await fetch(allUrl, { headers: sbHeaders });
    if (!allR.ok) {
      const detail = await allR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de pagos', detail }) };
    }
    const todos = await allR.json();

    // 3. Leer el estado actual de la solicitud y reconciliar si hace falta.
    const solUrl = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}&select=id,estado,precio_total,evento_nombre,clientes(nombre_completo,correo)`;
    const solR = await fetch(solUrl, { headers: sbHeaders });
    if (!solR.ok) {
      const detail = await solR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de solicitud', detail }) };
    }
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    const estadoPrevio = solicitud ? solicitud.estado : null;
    let estadoSolicitud = estadoPrevio;

    // [F5] Reconciliación sobre CUOTAS VIVAS (estado !== 'cancelado'). Tras una baja
    // de lugar (#239) sus cuotas no pagadas quedan 'cancelado'; se EXCLUYEN para que
    // el grupo pueda liquidar lo de los lugares vivos. Sin bajas, las vivas ≡ el plan
    // completo (Σ vivas ≈ precio_total, misma tolerancia de $1 por centavos).
    // MISMA transformación en admin-aplicar-pago-grupo y admin-lugar-baja (las 3 idénticas).
    const vivas = (Array.isArray(todos) ? todos : []).filter(p => p && p.estado !== 'cancelado');
    // Dinero REAL cobrado de las VIVAS pagadas = COALESCE(monto_pagado, monto). Lo
    // pagado de un lugar dado de baja es historia contable (se retuvo) pero NO cuenta
    // aquí — simetría con excluirlo del esperado.
    const sumaReal = vivas.reduce((acc, p) => {
      if (p.estado !== 'pagado') return acc;
      const real = (p.monto_pagado == null) ? Number(p.monto || 0) : Number(p.monto_pagado || 0);
      return acc + (Number.isFinite(real) ? real : 0);
    }, 0);
    // Esperado = Σ monto de las VIVAS (ya no precio_total: tras una baja, lo esperado
    // es lo de los lugares vivos).
    const esperado = vivas.reduce((acc, p) => acc + (Number(p.monto || 0) || 0), 0);
    const dineroCuadra = sumaReal >= (esperado - TOLERANCIA_MXN);

    // 'pagado' exige AMBAS: todas las cuotas VIVAS con palomita Y que el dinero real
    // cuadre contra lo esperado (tol $1). Si una de las dos falla y la solicitud
    // estaba 'pagado', se degrada a 'en_pagos' (corrige el dato mal marcado al tocar
    // uno de sus pagos; no hay barrido masivo).
    const todosPagados = vivas.length > 0 && vivas.every(p => p.estado === 'pagado');
    let nuevoEstadoSol = null;
    if (todosPagados && dineroCuadra && estadoPrevio !== 'pagado') {
      nuevoEstadoSol = 'pagado';
    } else if ((!todosPagados || !dineroCuadra) && estadoPrevio === 'pagado') {
      nuevoEstadoSol = 'en_pagos';
    }

    if (nuevoEstadoSol) {
      const patchSolR = await fetch(`${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ estado: nuevoEstadoSol }),
      });
      if (!patchSolR.ok) {
        const detail = await patchSolR.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Pago actualizado, pero falló la reconciliación del estado de la solicitud', detail }) };
      }
      estadoSolicitud = nuevoEstadoSol;

      // Felicitación al CLIENTE cuando el tour queda LIQUIDADO (solo 'pagado').
      // Fail-soft: cualquier fallo del correo se loggea y NO afecta la respuesta
      // (el pago ya quedó bien marcado). La degradación a 'en_pagos' no manda nada.
      if (nuevoEstadoSol === 'pagado') {
        try {
          const cli = Array.isArray(solicitud.clientes)
            ? (solicitud.clientes[0] || {})
            : (solicitud.clientes || {});
          const correo = cli.correo && String(cli.correo).trim();
          if (correo) {
            const nombre = String(cli.nombre_completo || 'cliente').trim().split(/\s+/)[0] || 'cliente';
            const evento = solicitud.evento_nombre || solicitudId || 'tu evento';
            const asunto = `🎉 ¡Listo! Tu viaje a ${evento} está pagado`;
            const cuerpo = `<p style="margin:0 0 14px 0">¡Felicidades! Terminaste de pagar tu viaje a <strong>${escapeHtml(evento)}</strong>. Tu lugar está <strong>100% asegurado</strong>.</p>
        <p style="margin:0">Pronto te compartiremos los detalles finales. ¡Nos vemos pronto!</p>`;
            await enviarCorreo(correo, asunto, wrapHtml(nombre, cuerpo));
          }
        } catch (e) {
          console.error('[marcar-pago] correo liquidado falló (no crítico):', e.message);
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        pago,
        solicitud_id: solicitudId,
        solicitud_estado: estadoSolicitud,
        solicitud_estado_cambio: nuevoEstadoSol,
        admin: { id: auth.user.id, correo: auth.user.correo },
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error marcando el pago', detail: e.message }) };
  }
};

// ----- helpers -----

// Fecha de hoy en zona horaria de México (America/Monterrey), formato YYYY-MM-DD.
// en-CA produce el formato ISO de fecha directamente.
function hoyMx() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Monterrey',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}

// ----- correo (mismo patrón/estilo que portal-morosidad-diario.js) -----

// Remitente de cara al CLIENTE (no el de Kamehouse, que es interno del equipo).
const FROM = process.env.RESEND_FROM_COBRANZA || 'Conecta Reynosa <admin@conectareynosa.mx>';

// Envío fail-soft: devuelve true si se despachó, false si faltó key/destinatario
// o el fetch falló. NUNCA lanza (el .catch absorbe).
async function enviarCorreo(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  }).catch((e) => { console.error('[marcar-pago] Email:', e.message); return null; });
  return !!(r && r.ok);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Envoltura HTML simple (saludo + párrafo + cierre), estilo Conecta Reynosa.
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
