// =============================================================================
// admin-venta-crear  (VENDEDORES F2 — motor de creación de venta)
//
// La ejecuta un VENDEDOR (o admin) desde KameHouse. Crea una venta como
// solicitud_tour PENDIENTE del Portal, atribuida al vendedor, con el precio
// SELLADO desde el catálogo (candado — el precio JAMÁS viene del request) y un
// límite de 8 días naturales para completarla. Por D5, NO dispara plan de pagos
// ni contratos: eso sale del flujo de aprobación de Bulma, sin tocarlo.
//
// Body JSON:
//   { evento_id, fecha_idx?, paquete, zona, hotel?, num_personas,
//     cliente: { nombre, correo, telefono? } }
//
// Flujo: (1) disponibilidad (reusa _lib/disponibilidad = lógica de
// disponibilidad-evento) → zona sin cupo = 409; (2) sella precio con
// resolverPrecioVenta (F1); (3) vende_limite = hoy MX + 8; (4) cliente: reusa por
// correo o crea walk-in (patrón admin-crear-viajero); (5) INSERT DIRECTO de la
// solicitud pendiente con vendedor_id/precio_sellado/vende_limite. Jamás on_conflict.
//
// Roles: vendedor, maestro_roshi, bulma. vendedor_id = usuarios.id del JWT (D4).
// Env: PORTAL_SUPABASE_URL/SERVICE_KEY (ventas/clientes) + SUPABASE_URL_KAMEHOUSE/
//      SERVICE_KEY_KAMEHOUSE (compras/stock) + JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { resolverPrecioVenta, hoyMx } = require('./_lib/precio-zona');
const { fetchCatalogo } = require('./_lib/catalogo-index');
const { cargarDisponibilidad, evaluarZona } = require('./_lib/disponibilidad');
const { verificarVendedorActivo, AVISO_INACTIVO } = require('./_lib/vendedor-activo');
const { estaPausado, respuestaPausa } = require('./_lib/modulos-pausados');

const ROLES = ['vendedor', 'maestro_roshi', 'bulma'];
const PAQUETES = ['plus', 'ride', 'stay', 'cheap'];
const HABITACIONES = ['compartida', 'triple', 'doble', 'individual'];
const EVENTO_RE = /^[A-Za-z0-9_.#-]+$/;
const CARGO_DIAS_LIMITE = 8; // 8 días naturales (D6)

// hoy 'YYYY-MM-DD' + N días naturales → 'YYYY-MM-DD'.
function _vendeLimite(hoyISO, dias) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hoyISO || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + (dias || CARGO_DIAS_LIMITE));
  return d.toISOString().slice(0, 10);
}

// Snapshot inmutable del precio sellado (candado): SOLO valores calculados del
// catálogo, nunca del request. fuente:'EV' + sellado_at.
function _snapshotPrecio(pr, extra) {
  return {
    paquete: pr.paquete,
    zona: pr.zona,
    num_personas: pr.num_personas,
    precio_unit: pr.precio_unit,
    total: pr.total,
    separo: pr.separo,          // = ganancia de Memo
    resto: pr.resto,
    hotel: (extra && extra.hotel) || null,
    fecha_idx: (extra && extra.fecha_idx) || 0,
    requiere_hotel: !!pr.requiere_hotel,
    requiere_transporte: !!pr.requiere_transporte,
    fuente: pr.fuente || 'EV',   // 'EV' (web) o 'COMISION_ZONA' (CHEAP de vendedor)
    sellado_at: (extra && extra.sellado_at) || new Date().toISOString(),
  };
}

// VENDEDORES F5a — precio CHEAP del vendedor: NO viene del catálogo web, sino de
// comisiones_zona (Palacio KH). costo del vendedor = costo_matriz + comision;
// separo = comision (ganancia de Memo, se cobra primero). Rechaza si la zona no
// tiene comisión asignada. Best-effort: sin comisión → no se puede vender.
async function _precioCheapVendedor(khUrl, khKey, eventoId, zona, num) {
  const enc = encodeURIComponent;
  const r = await fetch(`${khUrl}/rest/v1/comisiones_zona?evento_id=eq.${enc(eventoId)}&zona=eq.${enc(zona)}&select=costo_matriz,comision&limit=1`,
    { headers: { apikey: khKey, Authorization: 'Bearer ' + khKey } });
  if (!r.ok) return { ok: false, motivo: 'No se pudo leer la comisión de la zona' };
  const row = ((await r.json().catch(() => [])) || [])[0] || null;
  if (!row) return { ok: false, motivo: 'Esta zona CHEAP no tiene comisión asignada — pídele a Memo que la configure en el Palacio.' };
  const matriz = Number(row.costo_matriz) || 0;
  const comision = Number(row.comision) || 0;
  const unit = matriz + comision;
  if (!(unit > 0)) return { ok: false, motivo: 'El costo/comisión de esta zona es 0 — Memo debe configurarlo.' };
  return { ok: true, paquete: 'cheap', zona, num_personas: num, precio_unit: unit, total: unit * num, separo: comision * num, resto: matriz * num, fuente: 'COMISION_ZONA' };
}

function _bad(headers, status, error, extra) {
  return { statusCode: status, headers, body: JSON.stringify({ ok: false, error, ...(extra || {}) }) };
}

exports.handler = async (event) => {
  // [VEN-PAUSA-1] El módulo está pausado: se rebota ANTES de cualquier trabajo
  // (sin leer body, sin tocar la base, sin verificar sesión). Esconder no es
  // impedir — el candado del navegador no alcanza a quien llama esto a mano.
  if (estaPausado('vendedores')) return respuestaPausa('vendedores');

  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return _bad(headers, 405, 'Method not allowed');
  if (!__origin) return _bad(headers, 403, 'Origen no permitido');

  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return _bad(headers, auth.status, auth.error);
  const vendedorId = auth.user && auth.user.id ? String(auth.user.id) : null;

  // 💤 F6: candado de inactividad — vendedor con 3+ meses y CERO ventas queda
  // bloqueado EN LA PUERTA (evaluado en vivo, best-effort: en error entra).
  if (auth.user.rol === 'vendedor') {
    const chk = await verificarVendedorActivo(auth.user);
    if (!chk.activo) return { statusCode: 403, headers, body: JSON.stringify({ error: AVISO_INACTIVO, codigo: 'vendedor_inactivo' }) };
  }

  const env = readEnv();
  if (env.error) return _bad(headers, 500, env.error);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return _bad(headers, 400, 'JSON inválido'); }

  // ── Validación de la venta ──────────────────────────────────────────────
  const eventoId = typeof body.evento_id === 'string' ? body.evento_id.trim() : '';
  if (!eventoId || eventoId.length > 120 || !EVENTO_RE.test(eventoId)) return _bad(headers, 400, 'evento_id inválido');

  const paquete = typeof body.paquete === 'string' ? body.paquete.trim().toLowerCase() : '';
  if (!PAQUETES.includes(paquete)) return _bad(headers, 400, 'paquete inválido (plus/ride/stay/cheap)');

  const zona = typeof body.zona === 'string' ? body.zona.trim() : '';
  if (!zona || zona.length > 120) return _bad(headers, 400, 'zona es requerida');

  let numPersonas = parseInt(body.num_personas, 10);
  if (!Number.isInteger(numPersonas) || numPersonas < 1 || numPersonas > 12) return _bad(headers, 400, 'num_personas debe estar entre 1 y 12');

  const hotel = (body.hotel != null && String(body.hotel).trim() !== '') ? String(body.hotel).trim() : null;
  const fechaIdx = Number.isInteger(parseInt(body.fecha_idx, 10)) ? parseInt(body.fecha_idx, 10) : 0;

  const cli = (body && body.cliente) || {};
  const cliNombre = typeof cli.nombre === 'string' ? cli.nombre.trim() : '';
  const cliCorreo = typeof cli.correo === 'string' ? cli.correo.trim().toLowerCase() : '';
  const cliTelefono = (cli.telefono != null && String(cli.telefono).trim() !== '') ? String(cli.telefono).trim() : null;
  if (!cliNombre || cliNombre.length > 200) return _bad(headers, 400, 'cliente.nombre es requerido');
  if (!cliCorreo || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(cliCorreo)) return _bad(headers, 400, 'cliente.correo con formato inválido');
  if (cliTelefono && cliTelefono.length > 40) return _bad(headers, 400, 'cliente.telefono demasiado largo');

  const hoyISO = hoyMx();
  const [slug] = eventoId.split('#');

  const khHeaders = { apikey: env.KH_SB_SERVICE, Authorization: 'Bearer ' + env.KH_SB_SERVICE };
  const sbHeaders = { apikey: env.PORTAL_SB_SERVICE, Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE, 'Content-Type': 'application/json' };
  const restBase = `${env.PORTAL_SB_URL}/rest/v1`;

  try {
    // ── 1. Disponibilidad (anti-sobreventa). Conservador: si no se puede calcular,
    //       no vendemos a ciegas. Solo bloquea si la zona está GESTIONADA y sin cupo.
    const disp = await cargarDisponibilidad({
      khUrl: env.KH_SB_URL, khKey: env.KH_SB_SERVICE,
      portalUrl: env.PORTAL_SB_URL, portalKey: env.PORTAL_SB_SERVICE,
      evento_id: eventoId,
    });
    if (disp.error) return _bad(headers, 502, 'No se pudo verificar la disponibilidad; intenta de nuevo');
    const ev = evaluarZona(disp, zona, numPersonas);
    if (ev.gestionada && ev.sinCupo) {
      const msg = ev.agotada ? `La zona "${zona}" está AGOTADA` : `La zona "${zona}" no tiene cupo para ${numPersonas} (quedan ${ev.restante})`;
      return _bad(headers, 409, msg, { restante: ev.restante });
    }

    // ── 2. SELLA el precio (candado). El precio NUNCA viene del request.
    //    CHEAP de vendedor = economía propia (comisiones_zona, Palacio KH); el resto
    //    de paquetes = precio web (resolverPrecioVenta). El CHEAP web del cliente NO
    //    pasa por aquí (esto es solo el motor del vendedor).
    let pr;
    if (paquete === 'cheap') {
      pr = await _precioCheapVendedor(env.KH_SB_URL, env.KH_SB_SERVICE, eventoId, zona, numPersonas);
      if (!pr.ok) return _bad(headers, /comisión asignada|configur/i.test(pr.motivo || '') ? 409 : 400, pr.motivo || 'No se pudo sellar el precio CHEAP');
    } else {
      pr = await resolverPrecioVenta({ evento_id: eventoId, paquete, zona, num_personas: numPersonas, hotel_nombre: hotel, hoyISO });
      if (!pr.ok) {
        if (pr.indeterminado) return _bad(headers, 502, 'No se pudo sellar el precio: catálogo no disponible. Intenta de nuevo (nunca se inventa un precio).');
        const status = /agotada|no encontrada|no disponible/i.test(pr.motivo || '') ? 409 : 400;
        return _bad(headers, status, pr.motivo || 'No se pudo sellar el precio');
      }
    }

    // Nombre del evento (display) desde el catálogo curado (best-effort → slug).
    let eventoNombre = slug;
    try { const cat = await fetchCatalogo(); if (cat && cat[slug] && cat[slug].nombre) eventoNombre = cat[slug].nombre; } catch (_) { /* fallback slug */ }

    const tipoHabitacion = (hotel && HABITACIONES.includes(hotel.toLowerCase())) ? hotel.toLowerCase() : null;
    const precioSellado = _snapshotPrecio(pr, { hotel, fecha_idx: fechaIdx });
    const vendeLimite = _vendeLimite(hoyISO, CARGO_DIAS_LIMITE);

    // ── 3. Cliente: reusar por correo o crear walk-in (no inventar uno).
    let clienteId = null, clienteReusado = false;
    const cliQ = await fetch(`${restBase}/clientes?correo=eq.${encodeURIComponent(cliCorreo)}&select=id&limit=1`, { headers: sbHeaders });
    if (cliQ.ok) {
      const arr = await cliQ.json().catch(() => []);
      if (Array.isArray(arr) && arr[0] && arr[0].id) { clienteId = arr[0].id; clienteReusado = true; }
    }
    if (!clienteId) {
      const cliR = await fetch(`${restBase}/clientes`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ auth_user_id: null, creado_por_admin: true, nombre_completo: cliNombre, celular: cliTelefono, correo: cliCorreo }),
      });
      if (!cliR.ok) {
        const detail = await cliR.text();
        // Carrera: si otro lo creó justo ahora (23505 correo), reintenta el lookup.
        if (cliR.status === 409 || detail.includes('23505')) {
          const again = await fetch(`${restBase}/clientes?correo=eq.${encodeURIComponent(cliCorreo)}&select=id&limit=1`, { headers: sbHeaders });
          const arr2 = again.ok ? await again.json().catch(() => []) : [];
          if (Array.isArray(arr2) && arr2[0] && arr2[0].id) { clienteId = arr2[0].id; clienteReusado = true; }
        }
        if (!clienteId) return _bad(headers, 502, 'No se pudo registrar el cliente', { detail });
      } else {
        const arr = await cliR.json().catch(() => []);
        clienteId = Array.isArray(arr) && arr[0] ? arr[0].id : null;
      }
    }
    if (!clienteId) return _bad(headers, 502, 'No se pudo resolver el cliente');

    // ── 4. INSERT DIRECTO de la solicitud PENDIENTE (jamás on_conflict). Por D5 no
    //       genera plan ni contratos: Bulma aprueba con su flujo existente.
    const solicitudRow = {
      cliente_id: clienteId,
      auth_user_id: null,
      evento_id: eventoId,
      evento_nombre: eventoNombre,
      paquete: paquete.toUpperCase(),
      zona: pr.zona || zona,
      num_personas: numPersonas,
      tipo_habitacion: tipoHabitacion,
      precio_total: pr.total,       // SELLADO del catálogo
      monto_separo: pr.separo,      // SELLADO del catálogo (= ganancia)
      estado: 'pendiente',
      vendedor_id: vendedorId,
      precio_sellado: precioSellado,
      vende_limite: vendeLimite,
    };
    const solR = await fetch(`${restBase}/solicitudes_tour`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(solicitudRow),
    });
    if (!solR.ok) {
      const detail = await solR.text();
      return _bad(headers, 502, 'No se pudo crear la venta', { detail, cliente_id: clienteId });
    }
    const solArr = await solR.json().catch(() => []);
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    if (!solicitud || !solicitud.id) return _bad(headers, 502, 'No se pudo crear la venta', { cliente_id: clienteId });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        solicitud_id: solicitud.id,
        cliente_id: clienteId,
        cliente_reusado: clienteReusado,
        vendedor_id: vendedorId,
        estado: 'pendiente',
        precio_total: pr.total,
        monto_separo: pr.separo,
        vende_limite: vendeLimite,
        precio_sellado: precioSellado,
      }),
    };
  } catch (e) {
    return _bad(headers, 502, 'Error creando la venta', { detail: e.message });
  }
};

function readEnv() {
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  if (!KH_SB_URL || !KH_SB_SERVICE) return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE, KH_SB_URL, KH_SB_SERVICE };
}

// Exports para el arnés (Netlify solo usa exports.handler).
exports._vendeLimite = _vendeLimite;
exports._snapshotPrecio = _snapshotPrecio;
exports._precioCheapVendedor = _precioCheapVendedor;
