// =============================================================================
// admin-venta-abono.js  (VENDEDORES F5b — abonos del vendedor con validación de Bulma)
//
// El abono del vendedor es SU pago a Conecta (el costo sellado de su venta); su
// cliente le paga a él aparte y eso NO se registra (D-B1). El abono nace NO VALIDADO
// (pago con estado='pendiente' → no suma) y lo valida BULMA con el flujo existente
// (admin-marcar-pago → estado='pagado' + pagos_auditoria). El vendedor JAMÁS
// auto-valida ni edita/borra abonos. El separo se cubre PRIMERO: separo cubierto con
// abonos VALIDADOS + contrato firmado = candado de entrega del boleto (admin-lugar-boleto).
//
// Acciones:
//   · 'estado_venta' {solicitud_id} → vendedor(dueño)+admin. Resumen de UNA venta:
//       total_sellado, separo_a_cubrir (término NEUTRO; = precio_sellado.separo),
//       validado, pendiente_validar, falta_total, falta_separo, abonos[]. 🔒 NUNCA
//       emite matriz/comisión/resto (privacidad F5a intacta).
//   · 'registrar'    {solicitud_id, monto, comprobante?{file_base64,mime}} →
//       vendedor(dueño)+admin. INSERT DIRECTO de un pago 'pendiente' (jamás on_conflict)
//       con registrado_por_vendedor durable + comprobante opcional (bucket 'comprobantes').
//
// Candado de propiedad: la venta debe ser del vendedor (solicitudes_tour.vendedor_id
// == usuarios.id del JWT), jamás del request. Admin (maestro_roshi/bulma) opera sobre
// cualquier venta de vendedor. No se puede abonar a una venta cancelada.
//
// Seguridad: verifyAdminAuth (vendedor/maestro_roshi/bulma) + corsCheck. service_role
// nunca se expone. Env: PORTAL_SUPABASE_URL/SERVICE_KEY + JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { verificarVendedorActivo, AVISO_INACTIVO } = require('./_lib/vendedor-activo');

const ROLES = ['vendedor', 'maestro_roshi', 'bulma'];
const ROLES_ADMIN = ['maestro_roshi', 'bulma'];
const UUID_RE = /^[0-9a-f-]{36}$/i;
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const MAX_BYTES = 4 * 1024 * 1024;   // ~4 MB (igual que admin-subir-comprobante-pago)
const MONTO_MAX = 1000000;           // tope sano; Bulma valida el monto real

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (s, b) => ({ statusCode: s, headers, body: JSON.stringify(b) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!__origin) return json(403, { error: 'Origen no permitido' });

  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  // 💤 F6: candado de inactividad — vendedor con 3+ meses y CERO ventas queda
  // bloqueado EN LA PUERTA (evaluado en vivo, best-effort: en error entra).
  if (auth.user.rol === 'vendedor') {
    const chk = await verificarVendedorActivo(auth.user);
    if (!chk.activo) return json(403, { error: AVISO_INACTIVO, codigo: 'vendedor_inactivo' });
  }

  const env = readEnv();
  if (env.error) return json(500, { error: env.error });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const accion = body.accion;
  if (accion !== 'estado_venta' && accion !== 'registrar') return json(400, { error: 'accion inválida' });

  const solicitudId = body.solicitud_id;
  if (!solicitudId || !UUID_RE.test(solicitudId)) return json(400, { error: 'solicitud_id inválido' });

  const sb = { apikey: env.PORTAL_SB_SERVICE, Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE, 'Content-Type': 'application/json' };
  const rest = `${env.PORTAL_SB_URL}/rest/v1`;
  const esAdmin = ROLES_ADMIN.includes(auth.user.rol);

  try {
    // ── Candado de propiedad + venta viva ────────────────────────────────────
    const solR = await fetch(`${rest}/solicitudes_tour?id=eq.${solicitudId}&select=id,estado,vendedor_id,cliente_id,auth_user_id,precio_sellado&limit=1`, { headers: sb });
    if (!solR.ok) return json(502, { error: 'Portal rechazó la consulta de la venta', detail: await solR.text() });
    const sol = (await solR.json().catch(() => []))[0] || null;
    if (!sol) return json(404, { error: 'Venta no encontrada' });
    if (!sol.vendedor_id) return json(403, { error: 'No es una venta de vendedor' });
    if (!esAdmin && String(sol.vendedor_id) !== String(auth.user.id)) return json(403, { error: 'Esta venta no es tuya' });
    if (String(sol.estado) === 'cancelado') return json(409, { error: 'La venta está cancelada' });

    const snap = (sol.precio_sellado && typeof sol.precio_sellado === 'object') ? sol.precio_sellado : {};
    const totalSellado = Number(snap.total) || 0;
    const separo = Number(snap.separo) || 0;   // "separo a cubrir" (neutro); NUNCA se emite matriz/comisión/resto

    // Pagos de la venta (todos son abonos de vendedor en este modelo).
    const pagR = await fetch(`${rest}/pagos?solicitud_id=eq.${solicitudId}&select=id,numero_pago,estado,monto,monto_pagado,fecha_pagada,comprobante_url&order=numero_pago.asc`, { headers: sb });
    if (!pagR.ok) return json(502, { error: 'Portal rechazó la consulta de abonos', detail: await pagR.text() });
    const pagos = (await pagR.json().catch(() => [])) || [];

    // Validado = Σ COALESCE(monto_pagado, monto) de los 'pagado' (mismo criterio que
    // la reconciliación de admin-marcar-pago). Pendiente de validar = Σ monto de los
    // 'pendiente'. Un abono 'pendiente' NO suma hasta que Bulma lo valide.
    let validado = 0, pendienteValidar = 0;
    (Array.isArray(pagos) ? pagos : []).forEach(p => {
      if (!p || p.estado === 'cancelado') return;
      if (p.estado === 'pagado') {
        const real = (p.monto_pagado == null) ? Number(p.monto || 0) : Number(p.monto_pagado || 0);
        validado += Number.isFinite(real) ? real : 0;
      } else if (p.estado === 'pendiente') {
        pendienteValidar += Number(p.monto || 0) || 0;
      }
    });

    if (accion === 'estado_venta') {
      const abonos = (Array.isArray(pagos) ? pagos : []).map(p => ({
        id: p.id,
        // Para display: lo validado usa monto_pagado; lo pendiente usa monto.
        monto: (p.estado === 'pagado' && p.monto_pagado != null) ? Number(p.monto_pagado) : (Number(p.monto) || 0),
        estado: p.estado,                        // 'pendiente' (por validar) | 'pagado' (validado) | 'cancelado'
        fecha_pagada: p.fecha_pagada || null,
        tiene_comprobante: !!p.comprobante_url,
      }));
      return json(200, {
        ok: true,
        es_admin: esAdmin,
        total_sellado: totalSellado,
        separo_a_cubrir: separo,                 // término NEUTRO; nunca "comisión/ganancia"
        validado,
        pendiente_validar: pendienteValidar,
        falta_total: Math.max(0, totalSellado - validado),
        falta_separo: Math.max(0, separo - validado),
        separo_cubierto: validado >= separo - 0.5,
        abonos,
      });
    }

    // ── registrar: INSERT DIRECTO de un abono 'pendiente' (no validado) ───────
    let monto = Number(body.monto);
    if (!Number.isFinite(monto)) return json(400, { error: 'monto inválido' });
    monto = Math.round(monto * 100) / 100;
    if (monto <= 0) return json(400, { error: 'El monto debe ser mayor a 0' });
    if (monto > MONTO_MAX) return json(400, { error: 'El monto es demasiado alto' });

    // numero_pago = max de la venta + 1 (READ-THEN-WRITE; 23505 → recomputa y reintenta).
    const numExistentes = (Array.isArray(pagos) ? pagos : []).map(p => Number(p.numero_pago) || 0);
    let numeroPago = (numExistentes.length ? Math.max(...numExistentes) : 0) + 1;

    const nuevoPago = () => ({
      solicitud_id: solicitudId,
      cliente_id: sol.cliente_id || null,
      auth_user_id: sol.auth_user_id || null,
      lugar_id: null,
      numero_pago: numeroPago,
      estado: 'pendiente',
      monto,
      concepto: 'Abono de vendedor · ' + (auth.user.correo || String(sol.vendedor_id)),
      fecha_esperada: hoyMx(),
      registrado_por: auth.user.correo || auth.user.rol || 'vendedor',
      registrado_por_vendedor: String(sol.vendedor_id),   // DURABLE (admin-marcar-pago no lo pisa)
    });

    let insR = await fetch(`${rest}/pagos`, { method: 'POST', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify(nuevoPago()) });
    if (!insR.ok) {
      const detail = await insR.text();
      // Carrera en (solicitud_id, numero_pago): recomputa el máximo y reintenta UNA vez.
      if (insR.status === 409 || detail.includes('23505')) {
        const reR = await fetch(`${rest}/pagos?solicitud_id=eq.${solicitudId}&select=numero_pago&order=numero_pago.desc&limit=1`, { headers: sb });
        const top = reR.ok ? ((await reR.json().catch(() => []))[0] || {}) : {};
        numeroPago = (Number(top.numero_pago) || numeroPago) + 1;
        insR = await fetch(`${rest}/pagos`, { method: 'POST', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify(nuevoPago()) });
        if (!insR.ok) return json(502, { error: 'No se pudo registrar el abono', detail: await insR.text() });
      } else {
        return json(502, { error: 'No se pudo registrar el abono', detail });
      }
    }
    const pagoIns = (await insR.json().catch(() => []))[0] || null;
    const pagoId = pagoIns && pagoIns.id;

    // ── comprobante OPCIONAL (mismo pipeline/bucket que admin-subir-comprobante-pago).
    // Fail-soft: si la subida falla, el abono YA quedó registrado (se avisa aparte).
    let comprobanteSubido = false, comprobanteError = null;
    const comp = body.comprobante;
    if (comp && comp.file_base64 && pagoId) {
      try {
        const ext = MIME_EXT[comp.mime];
        if (!ext) throw new Error('Tipo no permitido (JPG, PNG, WEBP o PDF)');
        const buf = Buffer.from(comp.file_base64, 'base64');
        if (!buf.length) throw new Error('Archivo vacío o base64 inválido');
        if (buf.length > MAX_BYTES) throw new Error('El archivo es muy grande (máx 4 MB)');
        const path = `pagos/${solicitudId}/${pagoId}_${Date.now()}.${ext}`;
        const upR = await fetch(`${env.PORTAL_SB_URL}/storage/v1/object/comprobantes/${encodeURI(path)}`, {
          method: 'POST',
          headers: { apikey: env.PORTAL_SB_SERVICE, Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE, 'Content-Type': comp.mime },
          body: buf,
        });
        if (!upR.ok) throw new Error('Storage rechazó la subida');
        const patchR = await fetch(`${rest}/pagos?id=eq.${pagoId}`, { method: 'PATCH', headers: { ...sb, Prefer: 'return=minimal' }, body: JSON.stringify({ comprobante_url: path }) });
        if (!patchR.ok) throw new Error('No se pudo guardar comprobante_url');
        comprobanteSubido = true;
      } catch (e) { comprobanteError = e.message; }
    }

    return json(200, {
      ok: true,
      pago_id: pagoId,
      estado: 'pendiente',            // nace NO validado (no suma hasta que Bulma valide)
      comprobante_subido: comprobanteSubido,
      comprobante_error: comprobanteError,
    });
  } catch (e) {
    return json(502, { error: 'Error en admin-venta-abono', detail: e.message });
  }
};

// ----- helpers -----
function hoyMx() {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' }); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}
function readEnv() {
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
