// =============================================================================
// contrato-cliente — CONTRATO-CLIENTE-1 (27-oct-2026). PÚBLICO, gated por token.
//
//   POST { accion:'ver', token }
//        → 200 { ok, estado, html, datos:{nombre,evento,…}, firmado_at, firmante_nombre, firmante_rol }
//   POST { accion:'firmar', token, nombre, rol, acepto:true }
//        → 200 { ok, firmado_at }  ·  409 si no está pendiente  ·  410 anulado
//
// 🔒 El token ES el secreto (48 hex, CHECK de la tabla). Sin él no hay nada.
// 🔒 El TEXTO se renderiza aquí desde la FOTO guardada (`datos`) con el dueño
//    (`_lib/contrato-cliente`): lo que se lee es lo que se firma, y la página no
//    tiene una copia propia de las cláusulas.
// 🔒 Firmar es UN PATCH con `estado=eq.pendiente` en el filtro: el segundo clic
//    escribe cero filas y se contesta como «ya firmado» (idempotente), no como
//    error.
// 🔒 `rol` nace vacío en la página (DEFAULTS-1: es una atribución) y aquí se
//    exige: titular · madre · padre · tutor (palabra de Memo: firma cualquiera
//    de los tres si es menor).
// =============================================================================

const { corsCheck } = require('./_lib/verify-admin');
const { renderContratoHTML } = require('./_lib/contrato-cliente');

const ROLES = ['titular', 'madre', 'padre', 'tutor'];

function json(status, headers, body) { return { statusCode: status, headers, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  const origen = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': origen || 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (origen === null) return json(403, headers, { ok: false, error: 'Origen no permitido' });
  if (event.httpMethod !== 'POST') return json(405, headers, { ok: false, error: 'Method not allowed' });
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_URL || !KH_KEY) return json(500, headers, { ok: false, error: 'Configuración incompleta' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, headers, { ok: false, error: 'JSON inválido' }); }
  const token = String(b.token || '').trim().toLowerCase();
  if (!/^[a-f0-9]{48}$/.test(token)) return json(400, headers, { ok: false, error: 'Link inválido' });
  const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };

  const leer = async () => {
    const r = await fetch(`${KH_URL}/rest/v1/contratos_cliente?token=eq.${token}&select=id,estado,datos,firmado_at,firmante_nombre,firmante_rol,version_texto&limit=1`, { headers: h });
    if (!r.ok) throw new Error('no pude leer el contrato');
    return (await r.json())[0] || null;
  };

  try {
    const c = await leer();
    if (!c) return json(404, headers, { ok: false, error: 'No encontramos este contrato. Revisa que el link esté completo.' });
    if (c.estado === 'anulado') return json(410, headers, { ok: false, error: 'Este contrato fue reemplazado por uno nuevo. Revisa tu correo más reciente o escríbenos por WhatsApp.' });
    const accion = String(b.accion || 'ver');

    if (accion === 'ver') {
      const d = c.datos || {};
      return json(200, headers, {
        ok: true, estado: c.estado, version: c.version_texto,
        html: renderContratoHTML(d),
        datos: { nombre: d.nombre, evento: d.evento, fecha: d.fecha, paquete: d.paquete_txt },
        firmado_at: c.firmado_at, firmante_nombre: c.firmante_nombre, firmante_rol: c.firmante_rol,
      });
    }

    if (accion === 'firmar') {
      if (b.acepto !== true) return json(400, headers, { ok: false, error: 'Marca la casilla de que leíste y aceptas el contrato.' });
      const nombre = String(b.nombre || '').replace(/\s+/g, ' ').trim();
      if (nombre.length < 5 || nombre.split(' ').length < 2) return json(400, headers, { ok: false, error: 'Escribe tu nombre completo (nombre y apellido).' });
      if (nombre.length > 120) return json(400, headers, { ok: false, error: 'El nombre es demasiado largo.' });
      const rol = String(b.rol || '');
      if (!ROLES.includes(rol)) return json(400, headers, { ok: false, error: 'Elige quién firma: el viajero, su mamá, su papá o su tutor.' });
      if (c.estado === 'firmado') return json(200, headers, { ok: true, ya: true, firmado_at: c.firmado_at });
      const hdr = event.headers || {};
      const ip = String(hdr['x-nf-client-connection-ip'] || hdr['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 64) || null;
      const ua = String(hdr['user-agent'] || '').slice(0, 300) || null;
      const ahora = new Date().toISOString();
      const pR = await fetch(`${KH_URL}/rest/v1/contratos_cliente?id=eq.${c.id}&estado=eq.pendiente`, {
        method: 'PATCH', headers: Object.assign({}, h, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ estado: 'firmado', firmado_at: ahora, firmante_nombre: nombre, firmante_rol: rol, firma_ip: ip, firma_ua: ua }),
      });
      if (!pR.ok) return json(502, headers, { ok: false, error: 'No se pudo guardar tu firma. Intenta de nuevo en un momento.' });
      const fil = await pR.json().catch(() => []);
      if (!fil.length) {
        const otra = await leer();
        if (otra && otra.estado === 'firmado') return json(200, headers, { ok: true, ya: true, firmado_at: otra.firmado_at });
        return json(409, headers, { ok: false, error: 'Este contrato ya no se puede firmar. Escríbenos por WhatsApp.' });
      }
      return json(200, headers, { ok: true, firmado_at: fil[0].firmado_at });
    }
    return json(400, headers, { ok: false, error: 'Acción no válida' });
  } catch (e) {
    return json(502, headers, { ok: false, error: 'Algo falló de nuestro lado. Intenta de nuevo en un momento.' });
  }
};
