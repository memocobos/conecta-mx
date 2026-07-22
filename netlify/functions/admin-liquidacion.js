// =============================================================================
// admin-liquidacion.js  (VENDEDORES F5c — liquidación del 30% al cierre)
//
// ÚLTIMA fase del módulo Vendedores. Cierre 100% MANUAL de Memo (solo maestro_roshi);
// NADA automático dispara liquidaciones. La comisión del vendedor por PLUS/STAY/RIDE
// se calcula con la fórmula de bolsa promedio de Memo y se CONGELA al liquidar (si la
// utilidad del Palacio cambia después, la liquidación NO se recalcula sola).
//
// FÓRMULA (documentada):
//   ganancia_por_paquete = round( utilidad_evento / total_paquetes_vendidos )
//     · utilidad_evento     = resumen_eventos.utilidad_actual (KH/Palacio), por slug base.
//     · total_paquetes      = Σ num_personas de solicitudes_tour NO canceladas del evento
//       (estados pendiente/en_pagos/pagado) en TODOS los canales y TODOS los tipos
//       (web + vendedores + walk-ins, incl. CHEAP) — misma fuente que admin-vendidos-evento.
//   comisión_vendedor = round( 0.30 × ganancia_por_paquete × nº de paquetes PLUS/STAY/RIDE
//       que ÉL vendió, no cancelados ). Sus CHEAP quedan FUERA del numerador (esa economía
//       ya se cobró vía separo, F5a) pero SÍ cuentan en el total del evento (denominador).
//   Redondeo a pesos (Math.round). Comisión negativa (utilidad < 0) se clampa a 0.
//   Multifecha: se AGREGA por slug base (evento_id 'slug' + 'slug#idx').
//
// Acciones:
//   · 'previsualizar'  {evento_id} → maestro_roshi. La foto COMPLETA sin escribir.
//   · 'liquidar'       {evento_id} → maestro_roshi. Congela y ESCRIBE comisiones_liquidadas
//       (READ-THEN-WRITE, jamás on_conflict). Evento ya liquidado → 409.
//   · 'marcar_pagada'  {evento_id, vendedor_id} → maestro_roshi. Sella pagado_at/pagado_por.
//   · 'mis_comisiones' {} → vendedor+admin. SOLO las del que llama (vendedor_id del JWT):
//       {evento_id, monto, estado}. 🔒 Nunca utilidad del evento ni comisiones de otros.
//
// LÍMITES: LEE Palacio (resumen_eventos) y Portal (solicitudes_tour); NO toca compras/
// resumen/cobranza/contratos/crons/F5a/F5b. Env: KH (resumen_eventos/usuarios/
// comisiones_liquidadas) + Portal (solicitudes_tour) + JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
let fetchCatalogo = null;
try { ({ fetchCatalogo } = require('./_lib/catalogo-index')); } catch (_) { fetchCatalogo = null; }

const ROLES_PALACIO = ['maestro_roshi'];
const ROLES_VENDEDOR = ['vendedor', 'maestro_roshi', 'bulma'];
const ACCIONES = {
  previsualizar: ROLES_PALACIO, liquidar: ROLES_PALACIO,
  marcar_pagada: ROLES_PALACIO, mis_comisiones: ROLES_VENDEDOR,
};
const EVENTO_RE = /^[A-Za-z0-9_.#-]+$/;
const ESTADOS_CUENTAN = ['pendiente', 'en_pagos', 'pagado'];   // cancelado FUERA
const PSR = ['plus', 'stay', 'ride'];                          // CHEAP fuera del numerador
const PCT = 0.30;

// ── Núcleo PURO (exportado para el arnés): la foto del cálculo, sin nombres ni BD.
//    solicitudes: [{ vendedor_id, paquete, num_personas }] YA filtradas a no-canceladas.
function _calcular(utilidad, solicitudes) {
  const rows = Array.isArray(solicitudes) ? solicitudes : [];
  // Denominador: TODOS los paquetes del evento (todos los canales y tipos, incl. CHEAP).
  let totalPaquetes = 0;
  const porVendedor = {};   // vendedor_id → paquetes PSR (numerador; CHEAP excluido)
  for (const s of rows) {
    const n = parseInt(s && s.num_personas, 10);
    if (!Number.isInteger(n) || n <= 0) continue;
    totalPaquetes += n;
    const vend = s && s.vendedor_id != null ? String(s.vendedor_id) : '';
    const paq = String((s && s.paquete) || '').toLowerCase();
    if (vend && PSR.includes(paq)) porVendedor[vend] = (porVendedor[vend] || 0) + n;
  }
  const util = Number(utilidad) || 0;
  const gananciaPorPaquete = totalPaquetes > 0 ? Math.round(util / totalPaquetes) : 0;
  const vendedores = Object.keys(porVendedor).sort().map((vend) => {
    const paquetes = porVendedor[vend];
    const comision = Math.max(0, Math.round(PCT * gananciaPorPaquete * paquetes));   // sin pagos negativos
    return { vendedor_id: vend, paquetes, comision };
  });
  return { utilidad: util, total_paquetes: totalPaquetes, ganancia_por_paquete: gananciaPorPaquete, pct: PCT, vendedores };
}

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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const accion = body.accion;
  if (!(accion in ACCIONES)) return json(400, { error: 'accion inválida' });

  const auth = verifyAdminAuth(event, ACCIONES[accion]);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  const env = readEnv();
  if (env.error) return json(500, { error: env.error });

  const kh = { apikey: env.KH_SB_SERVICE, Authorization: 'Bearer ' + env.KH_SB_SERVICE, 'Content-Type': 'application/json' };
  const portal = { apikey: env.PORTAL_SB_SERVICE, Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE, 'Content-Type': 'application/json' };
  const baseLiq = `${env.KH_SB_URL}/rest/v1/comisiones_liquidadas`;
  const enc = encodeURIComponent;

  try {
    // ── mis_comisiones (vendedor): SOLO lo suyo, sin utilidad ni ajenos ───────
    if (accion === 'mis_comisiones') {
      const vendId = String(auth.user.id || '');
      if (!vendId) return json(200, { ok: true, comisiones: [] });
      const r = await fetch(`${baseLiq}?vendedor_id=eq.${enc(vendId)}&select=evento_id,monto,pagado_at&order=creado.desc`, { headers: kh });
      if (!r.ok) return json(502, { error: 'KH rechazó la consulta', detail: await r.text() });
      const rows = (await r.json().catch(() => [])) || [];
      let nombres = {};
      if (fetchCatalogo) { try { const cat = await fetchCatalogo(); if (cat) rows.forEach(x => { const c = cat[x.evento_id]; if (c && c.nombre) nombres[x.evento_id] = c.nombre; }); } catch (_) {} }
      const comisiones = rows.map(x => ({
        evento_id: x.evento_id,
        evento_nombre: nombres[x.evento_id] || x.evento_id,
        monto: Number(x.monto) || 0,
        estado: x.pagado_at ? 'pagada' : 'calculada',
      }));
      return json(200, { ok: true, comisiones });   // 🔒 sin utilidad, sin ganancia_base, sin otros vendedores
    }

    // ── Validación de evento_id (base) para las acciones del Palacio ──────────
    const rawEvento = String(body.evento_id || '').trim();
    if (!rawEvento || !EVENTO_RE.test(rawEvento) || rawEvento.length > 120) return json(400, { error: 'evento_id inválido' });
    const slug = rawEvento.split('#')[0];   // multifecha → slug base

    // ── marcar_pagada: READ-THEN-WRITE (la fila debe existir) ─────────────────
    if (accion === 'marcar_pagada') {
      const vendId = String(body.vendedor_id || '').trim();
      if (!vendId) return json(400, { error: 'vendedor_id requerido' });
      const exR = await fetch(`${baseLiq}?evento_id=eq.${enc(slug)}&vendedor_id=eq.${enc(vendId)}&select=id,pagado_at&limit=1`, { headers: kh });
      if (!exR.ok) return json(502, { error: 'KH rechazó la consulta', detail: await exR.text() });
      const fila = ((await exR.json().catch(() => [])) || [])[0];
      if (!fila) return json(404, { error: 'No hay comisión liquidada para ese vendedor en este evento' });
      const pR = await fetch(`${baseLiq}?evento_id=eq.${enc(slug)}&vendedor_id=eq.${enc(vendId)}`, {
        method: 'PATCH', headers: { ...kh, Prefer: 'return=representation' },
        body: JSON.stringify({ pagado_at: new Date().toISOString(), pagado_por: auth.user.correo || auth.user.rol || 'admin' }),
      });
      if (!pR.ok) return json(502, { error: 'No se pudo marcar como pagada', detail: await pR.text() });
      const arr = await pR.json().catch(() => []);
      return json(200, { ok: true, comision: Array.isArray(arr) ? arr[0] : arr });
    }

    // ── previsualizar / liquidar: leer utilidad + solicitudes → foto ──────────
    // Utilidad del Palacio (resumen_eventos, KH) por slug base.
    const uR = await fetch(`${env.KH_SB_URL}/rest/v1/resumen_eventos?id=eq.${enc(slug)}&select=id,nombre,utilidad_actual,total_viajeros&limit=1`, { headers: kh });
    if (!uR.ok) return json(502, { error: 'KH rechazó resumen_eventos', detail: await uR.text() });
    const evRow = ((await uR.json().catch(() => [])) || [])[0] || null;
    const utilidad = evRow ? (Number(evRow.utilidad_actual) || 0) : 0;
    const eventoNombre = (evRow && evRow.nombre) || slug;

    // Solicitudes NO canceladas del evento (slug base + slug#idx) — todos los canales.
    const orClause = `or=(evento_id.eq.${enc(slug)},evento_id.like.${enc(slug)}%23*)`;
    const sUrl = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?select=vendedor_id,paquete,num_personas,estado&${orClause}&estado=in.(${ESTADOS_CUENTAN.join(',')})&limit=10000`;
    const sR = await fetch(sUrl, { headers: portal });
    if (!sR.ok) return json(502, { error: 'Portal rechazó la consulta de solicitudes', detail: await sR.text() });
    const solicitudes = (await sR.json().catch(() => [])) || [];

    const foto = _calcular(utilidad, solicitudes);

    // Nombres de vendedor (KH usuarios) + estado ya-liquidado (comisiones_liquidadas).
    const ids = foto.vendedores.map(v => v.vendedor_id);
    let nombrePorId = {};
    if (ids.length) {
      const ur = await fetch(`${env.KH_SB_URL}/rest/v1/usuarios?id=in.(${ids.map(enc).join(',')})&select=id,nombre`, { headers: kh });
      if (ur.ok) (await ur.json().catch(() => [])).forEach(u => { if (u && u.id) nombrePorId[u.id] = u.nombre || null; });
    }
    const liqR = await fetch(`${baseLiq}?evento_id=eq.${enc(slug)}&select=vendedor_id,monto,pagado_at`, { headers: kh });
    const liqRows = liqR.ok ? ((await liqR.json().catch(() => [])) || []) : [];
    const liqPorVend = {}; liqRows.forEach(x => { liqPorVend[String(x.vendedor_id)] = x; });
    const yaLiquidado = liqRows.length > 0;

    const vendedores = foto.vendedores.map(v => {
      const ex = liqPorVend[v.vendedor_id];
      return {
        vendedor_id: v.vendedor_id,
        vendedor_nombre: nombrePorId[v.vendedor_id] || v.vendedor_id.slice(0, 8),
        paquetes: v.paquetes,
        comision: v.comision,
        liquidada: !!ex,
        estado: ex ? (ex.pagado_at ? 'pagada' : 'calculada') : null,
        monto_liquidado: ex ? (Number(ex.monto) || 0) : null,
      };
    });
    const snapshot = {
      evento_id: slug, evento_nombre: eventoNombre,
      utilidad: foto.utilidad, total_paquetes: foto.total_paquetes,
      ganancia_por_paquete: foto.ganancia_por_paquete, pct: foto.pct,
      evento_encontrado: !!evRow,   // si false: resumen_eventos no casó por id=slug → revisar
      ya_liquidado: yaLiquidado,
      vendedores,
    };

    if (accion === 'previsualizar') return json(200, { ok: true, ...snapshot });   // NO escribe

    // ── liquidar: candado de re-liquidación + escritura CONGELADA ─────────────
    if (yaLiquidado) {
      return json(409, { error: 'Este evento ya fue liquidado. Para rehacerlo, borra sus filas de comisiones_liquidadas (evento_id = ' + slug + ') a mano y vuelve a liquidar.' });
    }
    if (!vendedores.length) return json(400, { error: 'No hay ventas PLUS/STAY/RIDE de vendedor para liquidar en este evento' });

    const creado = new Date().toISOString();
    const detalleBase = { utilidad: foto.utilidad, total_paquetes: foto.total_paquetes, ganancia_por_paquete: foto.ganancia_por_paquete, pct: foto.pct };
    const filas = vendedores.map(v => ({
      evento_id: slug, vendedor_id: v.vendedor_id,
      ganancia_base: foto.ganancia_por_paquete,
      monto: v.comision,
      detalle: { ...detalleBase, paquetes_vendedor: v.paquetes, comision: v.comision },
      creado,
    }));
    // INSERT DIRECTO (jamás on_conflict). Una carrera choca contra el UNIQUE → 23505 → 409.
    const insR = await fetch(baseLiq, { method: 'POST', headers: { ...kh, Prefer: 'return=representation' }, body: JSON.stringify(filas) });
    if (!insR.ok) {
      const detail = await insR.text();
      if (insR.status === 409 || detail.includes('23505')) return json(409, { error: 'Este evento ya fue liquidado (carrera). Recarga la previsualización.' });
      return json(502, { error: 'No se pudieron escribir las liquidaciones', detail });
    }
    const escritas = await insR.json().catch(() => []);
    return json(200, { ok: true, evento_id: slug, evento_nombre: eventoNombre, liquidadas: Array.isArray(escritas) ? escritas.length : filas.length, ...snapshot });
  } catch (e) {
    return json(502, { error: 'Error en admin-liquidacion', detail: e.message });
  }
};

exports._calcular = _calcular;   // arnés

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) return { error: 'Faltan env vars Portal (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  return { KH_SB_URL, KH_SB_SERVICE, PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
