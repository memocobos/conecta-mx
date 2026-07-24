// =============================================================================
// admin-lugar-traspasar  (Acompañantes F5-t2 — TRASPASO de un lugar · CIERRA F5)
//
// La ejecuta Bulma desde KameHouse (el cliente lo pide por WhatsApp). Decisiones
// de Memo: el LUGAR es lo que vive — CONSERVA lo abonado y lo restante; solo cambia
// la PERSONA. Se le cambia el nombre/correo, se resetea su identidad de aceptación,
// se le manda invitación al nuevo → acepta (flujo #226 intacto) → sus cuotas no
// pagadas pasan a su nombre (#230, ya funciona). Se puede traspasar un lugar
// ACTIVO (cambio directo, hereda su cuarto) o uno en BAJA (revivirlo para el nuevo
// — el caso del correo de #239: "si alguien quiere tomar ese lugar").
//
// Seguridad/roles/env: molde admin-lugar-baja (verifyAdminAuth + corsCheck,
// maestro_roshi/bulma; env del PORTAL). Invitación calcada de portal-lugar-invitar.
// Las cuotas PAGADAS jamás se tocan (el saldo a favor se queda con el lugar).
//
// Env vars: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, JWT_SECRET,
//           RESEND_API_KEY (|| RESEND_KEY).
// =============================================================================

const crypto = require('crypto');
const { aplicarModoPrueba } = require('./_lib/correo-guard');
const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { fetchCatalogo } = require('./_lib/catalogo-index');

// Gancho 1 del machote: traspaso gratis a 6+ días del evento; $350 dentro de los
// últimos 5 (el día 5 exacto YA cobra; incluye 0 y negativos).
const CARGO_TRASPASO_MXN = 350;
const CARGO_TRASPASO_UMBRAL_DIAS = 5;

const UUID_RE = /^[0-9a-f-]{36}$/i;
const ROLES = ['maestro_roshi', 'bulma', 'milk'];
const MAX_NOMBRE = 120;
const MAX_CORREO = 200;
const MAX_MOTIVO = 500;
const TOLERANCIA_MXN = 1; // igual que admin-marcar-pago / admin-lugar-baja
const PORTAL_BASE = 'https://conectareynosa.mx/portal.html';

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

  // nombre + correo del NUEVO ocupante: obligatorios (saneo de #224).
  const nombre = (body.nombre != null) ? String(body.nombre).trim() : '';
  if (nombre.length < 1 || nombre.length > MAX_NOMBRE) {
    return json(400, { error: 'nombre inválido (1 a 120 caracteres)' });
  }
  const correo = (body.correo != null) ? String(body.correo).trim().toLowerCase() : '';
  if (!correo.includes('@') || correo.length > MAX_CORREO) {
    return json(400, { error: 'correo inválido' });
  }

  let motivo = body.motivo;
  if (motivo != null && typeof motivo !== 'string') return json(400, { error: 'motivo debe ser texto' });
  motivo = motivo ? String(motivo).trim().slice(0, MAX_MOTIVO) : '';

  // Gancho 1: casilla manual "Aplicar cargo de $350" (solo aplica cuando el
  // backend NO pudo calcular los días — evento indeterminado).
  const forzarCargo = body.forzar_cargo === true;

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
    if (Number(lugar.numero) === 1) {
      return json(400, { error: 'El titular no se traspasa — es otro flujo' });
    }
    if (lugar.estado !== 'activo' && lugar.estado !== 'baja') {
      return json(409, { error: lugar.estado === 'traspasado' ? 'Ese lugar ya fue traspasado' : 'Ese lugar no se puede traspasar' });
    }
    const revivido = lugar.estado === 'baja';

    // ---- 3. La solicitud no debe estar cancelada (+ titular para re-apuntar/correo) ----
    const solR = await fetch(
      `${PORTAL_URL}/rest/v1/solicitudes_tour?id=eq.${enc(lugar.solicitud_id)}&select=id,estado,evento_nombre,evento_id,cliente_id,auth_user_id&limit=1`,
      { headers: sbHeaders }
    );
    if (!solR.ok) return json(502, { error: 'Supabase rechazó la consulta de la solicitud', detail: await solR.text() });
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    if (!solicitud) return json(404, { error: 'Solicitud no encontrada' });
    if (solicitud.estado === 'cancelado') return json(409, { error: 'Este tour fue cancelado' });
    const eventoNombre = solicitud.evento_nombre || 'tu viaje';

    const nowISO = new Date().toISOString();

    // ---- 3b. Gancho 1: decidir el cargo por traspaso ($350 si el evento está a
    //          ≤5 días de su PRIMERA fecha). Best-effort del catálogo: si no hay
    //          catálogo o el evento no trae ds → indeterminado (no cobra auto).
    //          Se DECIDE aquí; el INSERT va después de traspasar (paso 4e). ----
    const _hoyMx = hoyMx();
    const catalogo = await fetchCatalogo();
    const diasEvento = _diasHastaEvento(catalogo, solicitud.evento_id, _hoyMx);
    const decisionCargo = _decidirCargo({ dias: diasEvento, forzar: forzarCargo });

    // ---- 4a. Nota del traspaso (identidad saliente → entrante) ----
    const nombreViejo = (lugar.nombre && String(lugar.nombre).trim()) ? String(lugar.nombre).trim() : 'sin registrar';
    const notaTras = `[TRASPASO ${hoyMx()}] de ${nombreViejo} a ${nombre}` + (motivo ? ' · ' + motivo : '');
    const notasNuevas = (lugar.notas && String(lugar.notas).trim())
      ? (String(lugar.notas).trim() + '\n' + notaTras)
      : notaTras;

    // ---- 4b. PATCH del lugar: nueva identidad + reset de aceptación + revive.
    //          habitacion_grupo_id NO se toca (activo hereda su cuarto; baja ya era null). ----
    const upLug = await fetch(`${PORTAL_URL}/rest/v1/lugares?id=eq.${enc(lugarId)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        nombre,
        correo,
        fecha_nacimiento: null,
        cliente_id: null,
        invitacion_token: null,
        invitacion_enviada_at: null,
        invitacion_aceptada_at: null,
        estado: 'activo',
        notas: notasNuevas,
        updated_at: nowISO,
      }),
    });
    if (!upLug.ok) return json(502, { error: 'No se pudo traspasar el lugar', detail: await upLug.text() });

    // ---- 4c-i. Si venía de BAJA: reactivar sus cuotas anuladas (cancelado → pendiente) ----
    let cuotasReactivadas = 0;
    if (revivido) {
      const reR = await fetch(
        `${PORTAL_URL}/rest/v1/pagos?lugar_id=eq.${enc(lugarId)}&estado=eq.cancelado`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ estado: 'pendiente', updated_at: nowISO }),
        }
      );
      if (!reR.ok) return json(502, { error: 'Lugar traspasado, pero fallaron sus cuotas reactivadas', detail: await reR.text() });
      const reArr = await reR.json();
      cuotasReactivadas = Array.isArray(reArr) ? reArr.length : 0;
    }

    // ---- 4c-ii. Contar abonado (pagadas, intactas) + restante (no pagadas) ----
    let abonadoConservado = 0, restanteDelLugar = 0;
    const pagR = await fetch(
      `${PORTAL_URL}/rest/v1/pagos?lugar_id=eq.${enc(lugarId)}&select=estado,monto,monto_pagado`,
      { headers: sbHeaders }
    );
    if (pagR.ok) {
      const pagos = await pagR.json();
      (Array.isArray(pagos) ? pagos : []).forEach(p => {
        if (p.estado === 'pagado') {
          const real = (p.monto_pagado == null) ? Number(p.monto || 0) : Number(p.monto_pagado || 0);
          abonadoConservado += Number.isFinite(real) ? real : 0;
        } else {
          restanteDelLugar += Number(p.monto || 0) || 0;
        }
      });
    }

    // ---- 4c-iii. Re-apuntar las NO pagadas al TITULAR (dueño provisional; #230 se
    //             las pasará al nuevo cuando acepte). Las PAGADAS jamás se tocan. ----
    const upPag = await fetch(
      `${PORTAL_URL}/rest/v1/pagos?lugar_id=eq.${enc(lugarId)}&estado=neq.pagado`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ cliente_id: solicitud.cliente_id, auth_user_id: solicitud.auth_user_id, updated_at: nowISO }),
      }
    );
    if (!upPag.ok) return json(502, { error: 'Lugar traspasado, pero falló el re-apunte de cuotas', detail: await upPag.text() });

    // ---- 4d. Invitación AUTOMÁTICA al nuevo (persistir token ANTES de enviar) ----
    const token = crypto.randomUUID();
    const upTok = await fetch(`${PORTAL_URL}/rest/v1/lugares?id=eq.${enc(lugarId)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ invitacion_token: token, invitacion_enviada_at: nowISO, updated_at: nowISO }),
    });
    if (!upTok.ok) return json(502, { error: 'Lugar traspasado, pero no se pudo registrar la invitación', detail: await upTok.text() });

    // Nombre del titular para el correo de invitación (fallback si no se puede leer).
    let titularNombre = 'tu organizador';
    try {
      const cli2 = await fetch(
        `${PORTAL_URL}/rest/v1/clientes?id=eq.${enc(solicitud.cliente_id)}&select=nombre_completo&limit=1`,
        { headers: sbHeaders }
      );
      if (cli2.ok) {
        const arr = await cli2.json();
        const nom = Array.isArray(arr) && arr[0] && arr[0].nombre_completo;
        if (nom && String(nom).trim()) titularNombre = String(nom).trim();
      }
    } catch (_) { /* fallback ya definido */ }

    let invitacionEnviada = false, correoError = null;
    try {
      const url = `${PORTAL_BASE}?invitacion=${enc(token)}`;
      const asunto = `🎫 ${titularNombre} te agregó a un viaje — ${eventoNombre}`;
      invitacionEnviada = await enviarCorreo(correo, asunto, invitarHtml(nombre, titularNombre, eventoNombre, url));
      if (!invitacionEnviada) correoError = 'Resend no envió (revisa/reenvía)';
    } catch (e) {
      correoError = e.message;
    }

    // ---- 4e. Gancho 1: si corresponde cobrar, INSERTAR la cuota nueva del cargo
    //          ($350) en el plan. INSERT DIRECTO — JAMÁS on_conflict (índices
    //          parciales pagos_lugar_uq / pagos_grupal_uq). numero_pago = max+1 del
    //          plan de ESTE lugar; si el plan es grupal (el lugar no tiene cuotas
    //          propias, #229) → max+1 de la solicitud. Best-effort: si el INSERT
    //          truena NO se tumba el traspaso (ya ocurrió); se reporta el error. ----
    let cargoTraspaso = decisionCargo.cargo_traspaso;
    if (decisionCargo.cobra) {
      try {
        let maxNum = 0;
        const lugNumR = await fetch(
          `${PORTAL_URL}/rest/v1/pagos?lugar_id=eq.${enc(lugarId)}&select=numero_pago`, { headers: sbHeaders }
        );
        const lugNums = lugNumR.ok ? await lugNumR.json() : [];
        if (Array.isArray(lugNums) && lugNums.length) {
          maxNum = lugNums.reduce((m, r) => Math.max(m, Number(r.numero_pago) || 0), 0);
        } else {
          const solNumR = await fetch(
            `${PORTAL_URL}/rest/v1/pagos?solicitud_id=eq.${enc(lugar.solicitud_id)}&select=numero_pago`, { headers: sbHeaders }
          );
          const solNums = solNumR.ok ? await solNumR.json() : [];
          maxNum = (Array.isArray(solNums) ? solNums : []).reduce((m, r) => Math.max(m, Number(r.numero_pago) || 0), 0);
        }
        const numeroPago = maxNum + 1;
        const registradoPor = (auth.user && (auth.user.correo || auth.user.rol)) || 'traspaso';
        const insR = await fetch(`${PORTAL_URL}/rest/v1/pagos`, {
          method: 'POST',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify(_filaCargo({ lugarId, solicitud, hoyISO: _hoyMx, numeroPago, registradoPor })),
        });
        if (!insR.ok) {
          const detail = await insR.text();
          console.error('[lugar-traspasar] cargo insert falló:', detail);
          cargoTraspaso = { ...decisionCargo.cargo_traspaso, aplicado: false, error: 'no se pudo insertar el cargo' };
        } else {
          cargoTraspaso = { ...decisionCargo.cargo_traspaso, numero_pago: numeroPago };
        }
      } catch (e) {
        console.error('[lugar-traspasar] cargo excepción:', e.message);
        cargoTraspaso = { ...decisionCargo.cargo_traspaso, aplicado: false, error: e.message };
      }
    }

    // ---- 5. Reconciliación de la solicitud (best-effort, lógica de #240 "cuotas
    //         vivas"). Reactivar cuotas puede degradar un 'pagado' → 'en_pagos'.
    //         Ya cuenta el cargo recién insertado (una cuota pendiente más). ----
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
          if (pS.ok) solicitudEstado = nuevoEstadoSol;
        }
      }
    } catch (e) {
      console.error('[lugar-traspasar] reconciliación falló (no crítica):', e.message);
    }

    return json(200, {
      ok: true,
      revivido,
      cuotas_reactivadas: cuotasReactivadas,
      abonado_conservado: Math.round(abonadoConservado * 100) / 100,
      restante_del_lugar: Math.round(restanteDelLugar * 100) / 100,
      invitacion_enviada: invitacionEnviada,
      correo_error: correoError || undefined,
      solicitud_estado: solicitudEstado,
      cargo_traspaso: cargoTraspaso,
    });
  } catch (e) {
    return json(502, { error: 'Error traspasando el lugar', detail: e.message });
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

const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';

// Envío fail-soft: true si se despachó; false si faltó key/destinatario o el fetch
// falló. NUNCA lanza (el .catch absorbe).
async function enviarCorreo(to, subject, html) {
  const KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  if (!KEY || !to) return false;
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  }).catch((e) => { console.error('[lugar-traspasar] Email:', e.message); return null; });
  return !!(r && r.ok);
}

// Envoltura negra Conecta MX (molde de portal-lugar-invitar).
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

// Correo de invitación al nuevo ocupante (calca de portal-lugar-invitar).
function invitarHtml(nombreLugar, titular, eventoNombre, url) {
  const org = escapeHtml(titular);
  const ev = escapeHtml(eventoNombre);
  const link = escapeHtml(url);
  const cuerpo = `
    <p style="margin:0 0 14px 0"><strong>${org}</strong> te registró en el viaje a <b style="color:#e8ff4c">${ev}</b> con Conecta Reynosa.</p>
    <p style="margin:0 0 18px 0">Para confirmar tu lugar y ver los detalles en tu portal, acepta aquí:</p>
    <p style="margin:0 0 18px 0"><a href="${link}" style="display:inline-block;background:#e8ff4c;color:#000;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:15px">Aceptar mi lugar</a></p>
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.55)">Si no reconoces este viaje, ignora este correo.</p>`;
  return wrapHtml(nombreLugar || 'viajero', cuerpo);
}

// ----- Gancho 1: cargo por traspaso (lógica PURA, testeable en arnés) -----

// Días entre dos fechas 'YYYY-MM-DD' (evento - hoy) a medianoche UTC (patrón F4).
function _daysUntil(evISO, hoyISO) {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(evISO || ''));
  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hoyISO || ''));
  if (!m1 || !m2) return null;
  const a = Date.UTC(+m1[1], +m1[2] - 1, +m1[3]);
  const b = Date.UTC(+m2[1], +m2[2] - 1, +m2[3]);
  return Math.round((a - b) / 86400000);
}

// Días hasta la PRIMERA fecha del evento (ds del catálogo). Multifecha: slug base
// (slug#idx → slug). null si no hay catálogo o el evento no trae ds (best-effort).
function _diasHastaEvento(catalogo, evento_id, hoyISO) {
  if (!catalogo) return null;
  const slug = String(evento_id || '').split('#')[0];
  const ce = catalogo[slug];
  if (!ce || !ce.ds) return null;
  return _daysUntil(ce.ds, hoyISO);
}

// Decide si se cobra. dias≤5 (incluye 0 y negativos) → cobra; dias≥6 → gratis.
// Si el backend calculó los días, la REGLA manda (el forzado manual se ignora);
// solo cuando es indeterminado (dias=null) el forzado manual decide.
function _decidirCargo({ dias, forzar }) {
  if (dias != null) {
    if (dias <= CARGO_TRASPASO_UMBRAL_DIAS) {
      return { cobra: true, cargo_traspaso: { aplicado: true, monto: CARGO_TRASPASO_MXN, dias } };
    }
    return { cobra: false, cargo_traspaso: { aplicado: false, monto: 0, dias } };
  }
  if (forzar === true) {
    return { cobra: true, cargo_traspaso: { aplicado: true, monto: CARGO_TRASPASO_MXN, dias: null, forzado: true } };
  }
  return { cobra: false, cargo_traspaso: { indeterminado: true } };
}

// Fila de la cuota del cargo (misma forma que admin-generar-plan-pagos #229).
function _filaCargo({ lugarId, solicitud, hoyISO, numeroPago, registradoPor }) {
  return {
    solicitud_id: solicitud.id,
    cliente_id: solicitud.cliente_id,
    auth_user_id: solicitud.auth_user_id,
    lugar_id: lugarId,
    numero_pago: numeroPago,
    concepto: 'Cargo por traspaso',
    monto: CARGO_TRASPASO_MXN,
    fecha_esperada: hoyISO,
    estado: 'pendiente',
    registrado_por: registradoPor,
  };
}

// Exports para el arnés (Netlify solo usa exports.handler).
exports._daysUntil = _daysUntil;
exports._diasHastaEvento = _diasHastaEvento;
exports._decidirCargo = _decidirCargo;
exports._filaCargo = _filaCargo;
exports.CARGO_TRASPASO_MXN = CARGO_TRASPASO_MXN;
