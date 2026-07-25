// =============================================================================
// contrato-viajero-obtener  (Contratos F2a — LEER un contrato por token)
//
// Público, gated por el token del contrato (el token ES el secreto; el viajero
// abre /contrato-viajero.html?token=... y la página POSTea el token aquí). Lee
// con service_role (bypass RLS). Devuelve TODO lo necesario para pintar el
// contrato: estado/tipo, nombre del lugar y del titular, evento (nombre/fecha/
// venue/ciudad — del catálogo vía _lib), paquete/zona/habitación, precio del
// lugar, plan de cuotas del lugar, cuenta bancaria según paquete, y edad si
// tipo=menor.
//
//   POST { token } → 200 { ok, contrato:{...} } | 404 no existe | 410 anulado
//
// Env vars: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const { fetchCatalogo, cuentaParaPaquete } = require('./_lib/catalogo-index');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const SB_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_SERVICE) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars (PORTAL_SUPABASE_*)' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }
  const token = (body && typeof body.token === 'string') ? body.token.trim() : '';
  if (!token || !/^[a-f0-9]{16,80}$/i.test(token)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'token inválido' }) };
  }

  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE };

  try {
    // 1) contrato por token
    const cr = await fetch(
      `${SB_URL}/rest/v1/contratos_viajeros?token=eq.${encodeURIComponent(token)}`
      + `&select=id,lugar_id,solicitud_id,evento_id,tipo,estado,version_texto,firmado_at,emergencia,firmante_nombre&limit=1`,
      { headers: sb }
    );
    if (!cr.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta' }) };
    const carr = await cr.json().catch(() => []);
    const c = Array.isArray(carr) ? carr[0] : null;
    if (!c) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Contrato no encontrado' }) };
    if (c.estado === 'anulado') {
      return { statusCode: 410, headers, body: JSON.stringify({ error: 'Este contrato fue anulado. Si crees que es un error, contáctanos.' }) };
    }

    // 2) lugar (paquete/zona/habitación/precio/nombre/fnac) + 3) solicitud + titular
    const [lr, sr] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/lugares?id=eq.${encodeURIComponent(c.lugar_id)}&select=numero,nombre,paquete,zona,tipo_habitacion,precio,fecha_nacimiento&limit=1`, { headers: sb }),
      fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(c.solicitud_id)}&select=evento_nombre,cliente_id&limit=1`, { headers: sb }),
    ]);
    const lugar = lr.ok ? ((await lr.json().catch(() => []))[0] || {}) : {};
    const solicitud = sr.ok ? ((await sr.json().catch(() => []))[0] || {}) : {};

    // titular: nombre del cliente de la solicitud (fallback: lugar #1)
    let titularNombre = '';
    if (solicitud.cliente_id) {
      const tr = await fetch(`${SB_URL}/rest/v1/clientes?id=eq.${encodeURIComponent(solicitud.cliente_id)}&select=nombre_completo&limit=1`, { headers: sb });
      if (tr.ok) { const a = await tr.json().catch(() => []); titularNombre = (a[0] && a[0].nombre_completo) || ''; }
    }
    if (!titularNombre) {
      const t1 = await fetch(`${SB_URL}/rest/v1/lugares?solicitud_id=eq.${encodeURIComponent(c.solicitud_id)}&numero=eq.1&select=nombre&limit=1`, { headers: sb });
      if (t1.ok) { const a = await t1.json().catch(() => []); titularNombre = (a[0] && a[0].nombre) || ''; }
    }

    // 4) plan de cuotas del lugar
    let plan = [];
    const pr = await fetch(`${SB_URL}/rest/v1/pagos?lugar_id=eq.${encodeURIComponent(c.lugar_id)}&select=numero_pago,concepto,fecha_esperada,monto,estado&order=numero_pago.asc`, { headers: sb });
    if (pr.ok) {
      const a = await pr.json().catch(() => []);
      plan = (Array.isArray(a) ? a : []).map((p) => ({
        numero: p.numero_pago,
        etiqueta: p.concepto || '',
        fecha: p.fecha_esperada || null,
        monto: Number(p.monto) || 0,
        estado: p.estado || 'pendiente',
      }));
    }

    // 5) catálogo (evento + cuenta según paquete)
    const catalogo = await fetchCatalogo(); // best-effort: null si falla
    const [slug, idxStr] = String(c.evento_id || '').split('#');
    const ce = (catalogo && catalogo[slug]) || null;
    let eFecha = ce ? (ce.fecha || ce.ds || null) : null;
    if (ce && ce.multifecha && idxStr != null) {
      const mf = ce.multifecha[Number(idxStr)];
      if (mf) eFecha = mf.lbl || mf.ds || eFecha;
    }
    const evento = {
      nombre: solicitud.evento_nombre || (ce && ce.nombre) || slug || '',
      fecha:  eFecha,
      venue:  ce ? ce.venue : null,
      ciudad: ce ? ce.ciudad : null,
    };
    // AUD-2: cuentaParaPaquete truena ante un paquete desconocido. Aquí se
    // degrada a null: el contrato se debe poder ver aunque el lugar traiga un
    // paquete raro (mejor sin caja de depósito que un 500 en la cara del cliente).
    let cuenta = null;
    try { cuenta = cuentaParaPaquete(ce, lugar.paquete); }
    catch (e) { console.warn('[contrato-viajero-obtener] paquete no reconocido:', e.message); }

    const contrato = {
      estado: c.estado,
      tipo: c.tipo,
      version_texto: c.version_texto,
      firmado_at: c.firmado_at,
      lugar_nombre: lugar.nombre || '',
      titular_nombre: titularNombre,
      evento,
      paquete: lugar.paquete || null,
      zona: lugar.zona || null,
      habitacion: lugar.tipo_habitacion || null,
      precio: Number(lugar.precio) || 0,
      plan,
      cuenta,
    };
    if (c.tipo === 'menor') contrato.edad = edadDe(lugar.fecha_nacimiento);
    // Snapshot de la firma solo cuando ya está firmado (para que el PDF recargado
    // salga completo con el contacto de emergencia y el nombre del tutor).
    if (c.estado === 'firmado') {
      contrato.emergencia = (c.emergencia && typeof c.emergencia === 'object') ? c.emergencia : null;
      contrato.firmante_nombre = c.firmante_nombre || null;
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, contrato }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error obteniendo el contrato', detail: e.message }) };
  }
};

// Edad en años a partir de 'YYYY-MM-DD'. null si no hay fecha válida.
function edadDe(fnac) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fnac || '').slice(0, 10));
  if (!m) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - Number(m[1]);
  const mm = hoy.getMonth() + 1, dd = hoy.getDate();
  if (mm < Number(m[2]) || (mm === Number(m[2]) && dd < Number(m[3]))) edad--;
  return edad;
}
