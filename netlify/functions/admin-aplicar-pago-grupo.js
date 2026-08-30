// =============================================================================
// admin-aplicar-pago-grupo  (Acompañantes F3-t4a — PAGO GRUPAL con propuesta)
//
// Con planes por lugar (#229), una sola transferencia del TITULAR puede cubrir
// cuotas de VARIOS lugares. Decisión de Memo (opción C): el sistema PROPONE el
// reparto y Bulma CONFIRMA (puede ajustar). Esta function es SOLO el backend,
// con dos modos; la UI es la t4b. El pago individual sigue en admin-marcar-pago
// (no se toca).
//
//   MODO 1 { solicitud_id, modo:'proponer', monto }
//     → CASCADA de cuotas completas por fecha (numero_pago ASC) y lugar (ASC)
//       mientras alcance el monto. NO escribe nada; devuelve la propuesta.
//
//   MODO 2 { solicitud_id, modo:'aplicar', pago_ids:[...], fecha_pagada?, metodo?, referencia? }
//     → valida (todo o nada) y marca esos pagos como 'pagado' en UN solo PATCH,
//       luego reconcilia el estado de la solicitud (idéntico a admin-marcar-pago).
//
// Seguridad/env/roles: EXACTOS de admin-marcar-pago (verifyAdminAuth +
// maestro_roshi/bulma; service_role solo aquí). Sin env vars nuevas.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET. (Reusa las del portal.)
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { validarMonto } = require('./_lib/monto-limites');
const { aplicarModoPrueba } = require('./_lib/correo-guard');
const { reconciliarSolicitud } = require('./_lib/reconciliar-solicitud');

const UUID_RE = /^[0-9a-f-]{36}$/i;
const METODOS_VALIDOS = ['transferencia','deposito','efectivo'];
const MAX_REFERENCIA = 120;
const MAX_PAGO_IDS = 100;

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
  if (!solicitudId || !UUID_RE.test(solicitudId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitud_id inválido' }) };
  }
  const modo = body.modo;
  if (modo !== 'proponer' && modo !== 'aplicar') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "modo debe ser 'proponer' o 'aplicar'" }) };
  }

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    if (modo === 'proponer') {
      return await proponer(env, sbHeaders, headers, solicitudId, body);
    }
    return await aplicar(env, sbHeaders, headers, solicitudId, body, auth);
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en el pago grupal', detail: e.message }) };
  }
};

// ── MODO 1: PROPONER (no escribe) ──────────────────────────────────────────
async function proponer(env, sbHeaders, headers, solicitudId, body) {
  // 💰 CAP3-1: tope de cordura. Aquí el 0 NO se permite (era la regla de hoy):
  // repartir cero entre las cuotas de un grupo no significa nada.
  const _vm = validarMonto(body.monto, { permitirCero: false });
  if (!_vm.ok) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: _vm.error }) };
  }
  let monto = _vm.monto;

  // Cuotas NO pagadas del plan POR LUGAR (lugar_id no null). Sin filas → esta
  // solicitud no tiene plan por lugar → se usa marcar-pago de siempre.
  const pagUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?solicitud_id=eq.${solicitudId}`
    + `&estado=neq.pagado&lugar_id=not.is.null&select=id,lugar_id,numero_pago,concepto,monto,estado`;
  const pagR = await fetch(pagUrl, { headers: sbHeaders });
  if (!pagR.ok) {
    const detail = await pagR.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de pagos', detail }) };
  }
  const pagos = await pagR.json();
  if (!Array.isArray(pagos) || pagos.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Esta solicitud no tiene plan por lugar (usa el pago individual)' }) };
  }

  // Etiquetas de lugar (numero + nombre) para presentar la propuesta.
  const lugUrl = `${env.PORTAL_SB_URL}/rest/v1/lugares?solicitud_id=eq.${solicitudId}&select=id,numero,nombre`;
  const lugR = await fetch(lugUrl, { headers: sbHeaders });
  if (!lugR.ok) {
    const detail = await lugR.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de lugares', detail }) };
  }
  const lugById = {};
  (await lugR.json()).forEach((l) => { lugById[l.id] = l; });

  // CASCADA: por fecha (numero_pago ASC) y luego por lugar (numero ASC). Se cubren
  // cuotas COMPLETAS mientras alcance el monto; en la primera que no alcanza se
  // detiene (nunca media cuota, nunca saltar una obligación anterior).
  const conNum = pagos.map((p) => {
    const l = lugById[p.lugar_id] || {};
    return {
      pago_id:      p.id,
      lugar_numero: (l.numero != null ? Number(l.numero) : 9999),
      lugar_nombre: l.nombre || '',
      numero_pago:  p.numero_pago,
      concepto:     p.concepto,
      monto:        Number(p.monto) || 0,
    };
  });
  conNum.sort((a, b) => (a.numero_pago - b.numero_pago) || (a.lugar_numero - b.lugar_numero));

  const propuesta = [];
  let restante = monto;
  for (const c of conNum) {
    if (c.monto <= restante + 0.001) {
      propuesta.push(c);
      restante = round2(restante - c.monto);
    } else {
      break; // primera cuota que no alcanza → alto (cascada por fecha)
    }
  }
  const totalCubierto = round2(propuesta.reduce((s, c) => s + c.monto, 0));
  const sobrante = round2(monto - totalCubierto);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, propuesta, total_cubierto: totalCubierto, sobrante }),
  };
}

// ── MODO 2: APLICAR (todo o nada) ──────────────────────────────────────────
async function aplicar(env, sbHeaders, headers, solicitudId, body, auth) {
  // Validar el array de pago_ids: 1-100 uuids con formato válido (dedup defensivo).
  const raw = body.pago_ids;
  if (!Array.isArray(raw) || raw.length < 1) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pago_ids debe ser un array no vacío' }) };
  }
  const ids = [...new Set(raw.map((x) => String(x)))];
  if (ids.length > MAX_PAGO_IDS) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Demasiados pagos (máx ${MAX_PAGO_IDS})` }) };
  }
  if (!ids.every((id) => UUID_RE.test(id))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pago_ids contiene un uuid inválido' }) };
  }

  // metodo opcional (si viene, debe ser válido); referencia opcional; fecha default hoy MX.
  let metodo = body.metodo;
  if (metodo == null || metodo === '') {
    metodo = null;
  } else if (!METODOS_VALIDOS.includes(metodo)) {
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

  // VALIDACIÓN PREVIA (todo o nada): todos deben existir, pertenecer a ESTA
  // solicitud y NO estar ya pagados. Si algo falla → 409 y NO se aplica ninguno.
  const inList = ids.join(',');
  const chkUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?id=in.(${inList})&select=id,estado,solicitud_id`;
  const chkR = await fetch(chkUrl, { headers: sbHeaders });
  if (!chkR.ok) {
    const detail = await chkR.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la validación de pagos', detail }) };
  }
  const encontrados = await chkR.json();
  const foundIds = new Set((Array.isArray(encontrados) ? encontrados : []).map((p) => p.id));
  const faltantes = ids.filter((id) => !foundIds.has(id));
  if (faltantes.length) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Algunos pagos no existen', detalle: { faltantes } }) };
  }
  const ajenos = encontrados.filter((p) => p.solicitud_id !== solicitudId).map((p) => p.id);
  if (ajenos.length) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Algunos pagos no pertenecen a esta solicitud', detalle: { ajenos } }) };
  }
  const yaPagados = encontrados.filter((p) => p.estado === 'pagado').map((p) => p.id);
  if (yaPagados.length) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Algunos pagos ya están pagados', detalle: { ya_pagados: yaPagados } }) };
  }

  // PATCH único: marcar todos como 'pagado'. monto_pagado NO se usa aquí (sin partials).
  const registradoPor = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';
  const nowISO = new Date().toISOString();
  const patch = {
    estado:         'pagado',
    fecha_pagada:   fechaPagada,
    metodo:         metodo,
    referencia:     referencia || null,
    registrado_por: registradoPor,
    updated_at:     nowISO,
  };
  const upUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?id=in.(${inList})`;
  const upR = await fetch(upUrl, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!upR.ok) {
    const detail = await upR.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la aplicación de los pagos', detail }) };
  }
  const aplicadosArr = await upR.json();
  const aplicados = Array.isArray(aplicadosArr) ? aplicadosArr.length : 0;

  // Auditoría BEST-EFFORT (una fila por pago), igual que admin-marcar-pago: el
  // acto humano queda en pagos_auditoria (visible en la bitácora #176). Su fallo
  // NUNCA rompe la operación.
  try {
    const actor = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';
    const filas = (Array.isArray(aplicadosArr) ? aplicadosArr : []).map((p) => ({
      pago_id:      p.id,
      solicitud_id: p.solicitud_id,
      accion:       'pagado',
      actor,
      monto_pagado: p.monto_pagado ?? null,
      metodo:       p.metodo ?? null,
      cuenta:       p.cuenta ?? null,
    }));
    if (filas.length) {
      await fetch(`${env.PORTAL_SB_URL}/rest/v1/pagos_auditoria`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(filas),
      });
    }
  } catch (e) {
    console.error('[aplicar-pago-grupo] auditoría falló (no crítica):', e.message);
  }

  // RECONCILIACIÓN del estado de la solicitud — CALCADA de admin-marcar-pago.
  const solicitudEstado = await reconciliar(env, sbHeaders, solicitudId);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, aplicados, solicitud_estado: solicitudEstado }),
  };
}

// Reconciliación IDÉNTICA a admin-marcar-pago y admin-lugar-baja (F5-t1b, #240):
// sobre las CUOTAS VIVAS (estado !== 'cancelado'), 'pagado' exige que todas estén
// con palomita Y que el dinero real (COALESCE(monto_pagado,monto)) cuadre contra
// el ESPERADO = Σ montos de las vivas (ya no precio_total; tras una baja lo esperado
// es lo de los lugares vivos; sin bajas Σ vivas ≡ el plan, tol $1). Si no y estaba
// 'pagado' → 'en_pagos'. Felicita al liquidar (fail-soft). Devuelve el estado final.
async function reconciliar(env, sbHeaders, solicitudId) {
  const allUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?solicitud_id=eq.${solicitudId}&select=estado,monto,monto_pagado`;
  const allR = await fetch(allUrl, { headers: sbHeaders });
  if (!allR.ok) throw new Error('consulta de pagos: ' + await allR.text());
  const todos = await allR.json();

  const solUrl = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}&select=id,estado,precio_total,evento_nombre,clientes(nombre_completo,correo)`;
  const solR = await fetch(solUrl, { headers: sbHeaders });
  if (!solR.ok) throw new Error('consulta de solicitud: ' + await solR.text());
  const solArr = await solR.json();
  const solicitud = Array.isArray(solArr) ? solArr[0] : null;
  // El estado que se reporta si nada cambia. Ya NO decide nada: la decisión sale
  // de las cuotas, dentro de `reconciliarSolicitud`.
  let estadoSolicitud = solicitud ? solicitud.estado : null;

  // [CONC-4a] La CALCA EXACTA que decía este comentario ya no se copia: vive en
  // `_lib/reconciliar-solicitud`, una sola vez. Aquí se queda el correo, que este
  // endpoint escribe con su propio texto.
  const rec = await reconciliarSolicitud({
    sbUrl: env.PORTAL_SB_URL, sbHeaders, solicitudId, cuotas: todos,
  });
  if (!rec.ok) throw new Error(rec.error);
  const nuevoEstadoSol = rec.cambio;

  if (nuevoEstadoSol) {
    estadoSolicitud = nuevoEstadoSol;

    // Felicitación al CLIENTE cuando el tour queda LIQUIDADO (solo 'pagado'). Fail-soft.
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
        console.error('[aplicar-pago-grupo] correo liquidado falló (no crítico):', e.message);
      }
    }
  }

  return estadoSolicitud;
}

// ----- helpers -----

// Redondeo a 2 decimales (centavos).
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Fecha de hoy en zona horaria de México (America/Monterrey), formato YYYY-MM-DD.
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

// ----- correo (mismo patrón/estilo que admin-marcar-pago.js) -----

const FROM = process.env.RESEND_FROM_COBRANZA || 'Conecta Reynosa <admin@conectareynosa.mx>';

async function enviarCorreo(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return false;
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  }).catch((e) => { console.error('[aplicar-pago-grupo] Email:', e.message); return null; });
  return !!(r && r.ok);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
