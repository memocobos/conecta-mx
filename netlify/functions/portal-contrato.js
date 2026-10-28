// =============================================================================
// portal-contrato — CONTRATO-CLIENTE-2 (27-oct-2026): EL CLIENTE FIRMA SU
// CONTRATO DENTRO DEL PORTAL.
// =============================================================================
// Palabra de Memo: «si les das la opción de elegir quién firma pueden empezar a
// falsificarnos». Por eso aquí NADIE elige quién firma:
//   · la FECHA DE NACIMIENTO del viajero (capturada una vez, ya no la cambia el
//     cliente) decide: 18+ firma el propio viajero; menor firma mamá/papá/tutor;
//   · el que firma sube su INE (frente y reverso) al bucket PRIVADO
//     contratos-cliente-ine, y Bulma/Milk la revisan en KameHouse;
//   · la sesión es la del Portal con correo VERIFICADO: «suyo» se decide como
//     en portal-viajero (correo del JWT == correo del viajero, en minúsculas).
//
//   POST (Bearer <jwt del Portal>)
//     { accion:'listar' }                                   → sus contratos
//     { accion:'fecha', viajero_id, fecha:'YYYY-MM-DD' }    → una sola vez
//     { accion:'firmar', contrato_id, acepto:true, ine_frente, ine_reverso,
//       tutor_nombre?, parentesco? }                        → firma
//
// 🔒 El rol lo DERIVA el servidor de la edad; un `rol` en el cuerpo se ignora.
// 🔒 Adulto: el firmante ES el viajero (su nombre de la ficha, no tecleado).
// 🔒 La fecha se escribe con `fecha_nacimiento=is.null` en el filtro: una vez
//    puesta, desde aquí ya no se mueve (la corrige Bulma/Milk).
// 🔒 Firmar es PATCH con `estado=eq.pendiente`: el 2º clic no escribe nada.
// 🔒 Mientras el interruptor CONTRATO_CLIENTE_VIVO esté apagado, firmar → 409.
// =============================================================================
const { tipoImagen } = require('./_lib/imagen-magia');
const cc = require('./_lib/contrato-cliente');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARENTESCOS = ['madre', 'padre', 'tutor'];
const MAX_INE = 4 * 1024 * 1024;

function json(status, headers, body) { return { statusCode: status, headers, body: JSON.stringify(body) }; }
const hoyMx = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, headers, { ok: false, error: 'Solo POST' });
  const PT_URL = process.env.PORTAL_SUPABASE_URL;
  const PT_ANON = process.env.PORTAL_SUPABASE_ANON_KEY;
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!PT_URL || !PT_ANON || !KH_URL || !KH_KEY) return json(500, headers, { ok: false, error: 'Faltan env vars' });

  const auth = event.headers.authorization || event.headers.Authorization || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return json(401, headers, { ok: false, error: 'Inicia sesión otra vez' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, headers, { ok: false, error: 'Cuerpo inválido' }); }
  const accion = String(body.accion || '');
  if (!['listar', 'fecha', 'firmar'].includes(accion)) return json(400, headers, { ok: false, error: 'Acción desconocida' });

  // ── Quién es (correo VERIFICADO del JWT del Portal) ──────────────────────
  let user;
  try {
    const r = await fetch(`${PT_URL}/auth/v1/user`, { headers: { apikey: PT_ANON, Authorization: 'Bearer ' + jwt } });
    if (!r.ok) return json(401, headers, { ok: false, error: 'Tu sesión venció: entra otra vez' });
    user = await r.json();
  } catch (_) { return json(502, headers, { ok: false, error: 'No pude validar tu sesión' }); }
  const correo = (user && typeof user.email === 'string') ? user.email.trim().toLowerCase() : '';
  if (!correo || !user.email_confirmed_at) return json(403, headers, { ok: false, error: 'Confirma tu correo para poder firmar' });

  const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  const hj = Object.assign({}, h, { 'Content-Type': 'application/json', Prefer: 'return=representation' });
  // Sus viajeros: `ilike` estrecha, la comparación exacta en minúsculas MANDA
  // (la forma de PLAN-CASE-1: el patrón solo puede sobre-pescar).
  const misViajeros = async () => {
    const r = await fetch(`${KH_URL}/rest/v1/viajeros_evento?correo=ilike.${encodeURIComponent(correo)}&select=id,evento_id,nombre,correo,fecha_nacimiento,portal_revisado_at,usuario_id,tipo_viajero&limit=200`, { headers: h });
    if (!r.ok) throw new Error('viajeros');
    // 🔒 [PORTAL-SOLO-1] Solo las filas REVISADAS: un contrato no se firma sobre
    // números que nadie del equipo ha visto.
    return (await r.json()).filter((v) => String(v.correo || '').trim().toLowerCase() === correo && !!v.portal_revisado_at && !require('./_lib/portal-revision').esDelEquipo(v));
  };

  try {
    // ── LISTAR ─────────────────────────────────────────────────────────────
    if (accion === 'listar') {
      const vs = await misViajeros();
      if (!vs.length) return json(200, headers, { ok: true, contratos: [], vivo: cc.CONTRATO_CLIENTE_VIVO });
      const ids = vs.map((v) => '"' + v.id + '"').join(',');
      const r = await fetch(`${KH_URL}/rest/v1/contratos_cliente?viajero_id=in.(${encodeURIComponent(ids)})&estado=neq.anulado&select=id,viajero_id,estado,datos,firmado_at,firmante_nombre,firmante_rol,edad_al_firmar&order=created_at.asc`, { headers: h });
      if (!r.ok) return json(502, headers, { ok: false, error: 'No pude leer tus contratos' });
      const porId = {}; vs.forEach((v) => { porId[v.id] = v; });
      const hoy = hoyMx();
      const contratos = (await r.json()).map((c) => {
        const v = porId[c.viajero_id] || {};
        const edad = cc.edadEn(v.fecha_nacimiento, hoy);
        return {
          contrato_id: c.id, viajero_id: c.viajero_id, nombre: v.nombre || (c.datos && c.datos.nombre) || '',
          evento: (c.datos && c.datos.evento) || '', estado: c.estado,
          fecha_nacimiento: v.fecha_nacimiento || null, edad,
          firma: edad == null ? null : (edad >= 18 ? 'titular' : 'tutor'),
          html: cc.renderContratoHTML(c.datos || {}),
          firmado_at: c.firmado_at, firmante_nombre: c.firmante_nombre, firmante_rol: c.firmante_rol,
        };
      });
      return json(200, headers, { ok: true, contratos, vivo: cc.CONTRATO_CLIENTE_VIVO });
    }

    // ── FECHA DE NACIMIENTO (una sola vez) ─────────────────────────────────
    if (accion === 'fecha') {
      const viajero_id = String(body.viajero_id || '');
      if (!UUID_RE.test(viajero_id)) return json(400, headers, { ok: false, error: 'Viajero inválido' });
      const f = String(body.fecha || '').trim();
      const hoy = hoyMx();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || isNaN(Date.parse(f + 'T12:00:00Z')) || f < '1920-01-01' || f > hoy) {
        return json(400, headers, { ok: false, error: 'Escribe una fecha de nacimiento válida' });
      }
      const v = (await misViajeros()).find((x) => x.id === viajero_id);
      if (!v) return json(404, headers, { ok: false, error: 'No encontramos ese viajero en tu cuenta' });
      if (v.fecha_nacimiento) return json(409, headers, { ok: false, error: 'La fecha de nacimiento ya está registrada. Si está mal, escríbenos por WhatsApp.' });
      const p = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=eq.${viajero_id}&fecha_nacimiento=is.null`, {
        method: 'PATCH', headers: hj, body: JSON.stringify({ fecha_nacimiento: f, editado_portal_at: new Date().toISOString() }) });
      if (!p.ok) return json(502, headers, { ok: false, error: 'No se pudo guardar la fecha' });
      const filas = await p.json().catch(() => []);
      if (!filas.length) return json(409, headers, { ok: false, error: 'La fecha de nacimiento ya está registrada. Si está mal, escríbenos por WhatsApp.' });
      const edad = cc.edadEn(f, hoy);
      return json(200, headers, { ok: true, fecha_nacimiento: f, edad, firma: edad >= 18 ? 'titular' : 'tutor' });
    }

    // ── FIRMAR ─────────────────────────────────────────────────────────────
    if (!cc.CONTRATO_CLIENTE_VIVO) return json(409, headers, { ok: false, error: 'La firma de contratos todavía no está abierta. Te avisaremos por correo.' });
    const contrato_id = String(body.contrato_id || '');
    if (!UUID_RE.test(contrato_id)) return json(400, headers, { ok: false, error: 'Contrato inválido' });
    if (body.acepto !== true) return json(400, headers, { ok: false, error: 'Marca la casilla de que leíste y aceptas el contrato' });
    const cR = await fetch(`${KH_URL}/rest/v1/contratos_cliente?id=eq.${contrato_id}&select=id,viajero_id,estado,firmado_at&limit=1`, { headers: h });
    if (!cR.ok) return json(502, headers, { ok: false, error: 'No pude leer tu contrato' });
    const c = (await cR.json())[0];
    const v = c && (await misViajeros()).find((x) => x.id === c.viajero_id);
    // 🔒 Ajeno e inexistente contestan igual.
    if (!c || !v) return json(404, headers, { ok: false, error: 'No encontramos ese contrato en tu cuenta' });
    if (c.estado === 'firmado') return json(200, headers, { ok: true, ya: true, firmado_at: c.firmado_at });
    if (c.estado !== 'pendiente') return json(409, headers, { ok: false, error: 'Este contrato ya no se puede firmar. Escríbenos por WhatsApp.' });
    if (!v.fecha_nacimiento) return json(409, headers, { ok: false, error: 'Primero registra la fecha de nacimiento del viajero' });
    const hoy = hoyMx();
    const edad = cc.edadEn(v.fecha_nacimiento, hoy);
    let firmante_nombre, firmante_rol;
    if (edad >= 18) {
      firmante_nombre = String(v.nombre || '').trim();
      firmante_rol = 'titular';
      if (firmante_nombre.length < 3) return json(409, headers, { ok: false, error: 'Falta el nombre completo del viajero en su ficha' });
    } else {
      firmante_nombre = String(body.tutor_nombre || '').replace(/\s+/g, ' ').trim();
      firmante_rol = String(body.parentesco || '');
      if (firmante_nombre.length < 5 || firmante_nombre.split(' ').length < 2 || firmante_nombre.length > 120) {
        return json(400, headers, { ok: false, error: 'Escribe el nombre completo de la mamá, papá o tutor que firma' });
      }
      if (!PARENTESCOS.includes(firmante_rol)) return json(400, headers, { ok: false, error: 'Elige si firma la mamá, el papá o el tutor' });
    }
    // INE: dos fotos por sus BYTES (la extensión es una opinión).
    const subir = async (dataUrl, lado) => {
      const b64 = String(dataUrl || '').replace(/^data:[^;]+;base64,/, '');
      if (!b64) return { error: `Falta la foto del ${lado} de la INE` };
      let buf;
      try { buf = Buffer.from(b64, 'base64'); } catch (_) { return { error: 'Foto inválida' }; }
      if (buf.length > MAX_INE) return { error: `La foto del ${lado} pesa más de 4 MB` };
      const t = tipoImagen(buf);
      if (!t) return { error: `La foto del ${lado} no es una imagen (jpg/png/webp)` };
      const path = `${contrato_id}/${lado}-${Date.now()}-${require('crypto').randomBytes(4).toString('hex')}.${t.ext}`;
      const up = await fetch(`${KH_URL}/storage/v1/object/contratos-cliente-ine/${path}`, {
        method: 'POST', headers: Object.assign({}, h, { 'Content-Type': t.mime }), body: buf });
      if (!up.ok) return { error: 'No se pudo subir la INE. Intenta de nuevo.' };
      return { path };
    };
    const fr = await subir(body.ine_frente, 'frente');
    if (fr.error) return json(400, headers, { ok: false, error: fr.error });
    const rv = await subir(body.ine_reverso, 'reverso');
    if (rv.error) return json(400, headers, { ok: false, error: rv.error });
    const hdr = event.headers || {};
    const p = await fetch(`${KH_URL}/rest/v1/contratos_cliente?id=eq.${contrato_id}&estado=eq.pendiente`, {
      method: 'PATCH', headers: hj,
      body: JSON.stringify({
        estado: 'firmado', firmado_at: new Date().toISOString(), firmante_nombre, firmante_rol,
        ine_frente_path: fr.path, ine_reverso_path: rv.path,
        fecha_nacimiento_usada: v.fecha_nacimiento, edad_al_firmar: edad, firmado_por_correo: correo,
        firma_ip: String(hdr['x-nf-client-connection-ip'] || hdr['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 64) || null,
        firma_ua: String(hdr['user-agent'] || '').slice(0, 300) || null,
      }),
    });
    if (!p.ok) return json(502, headers, { ok: false, error: 'No se pudo guardar tu firma. Intenta de nuevo.' });
    const filas = await p.json().catch(() => []);
    if (!filas.length) return json(200, headers, { ok: true, ya: true });
    return json(200, headers, { ok: true, firmado_at: filas[0].firmado_at, firmante_rol, edad });
  } catch (e) {
    return json(502, headers, { ok: false, error: 'Algo falló de nuestro lado. Intenta de nuevo.' });
  }
};
