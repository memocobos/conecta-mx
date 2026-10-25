// =============================================================================
// admin-radio-cartelera  (RADIO-V2a · 24-oct-2026 — Kaio-sama captura la parrilla)
//
// CRUD de `radio_programas`, SOLO maestro_roshi (la radio es de Memo).
//
//   POST { accion:'listar' }   → { ok, programas:[todos, archivados incluidos] }
//   POST { accion:'crear',  programa:{...}, foto_b64? }     → { ok, programa, foto_error? }
//   POST { accion:'editar', id, programa:{...}, foto_b64?, foto_quitar? } → { ok, foto_error? }
//   POST { accion:'archivar', id, archivado:bool }           → { ok }
//   POST { accion:'eliminar', id, confirmar:true }           → { ok }
//
// 🔒 ELIMINAR existe desde RADIO-V2a2 (decisión de Memo, 24-oct): la cartelera
//    es CONTENIDO, no dinero — borrar un programa no borra un acta financiera.
//    El candado vive EN EL SERVIDOR: `confirmar:true` o 400 con cero
//    escrituras (COB-MIG-1: esconder el botón no basta). Archivar sigue
//    existiendo para pausar sin perder. Dinero/abonos siguen SIN DELETE.
// 🔒 Un programa es SEMANAL (dia_semana 0-6) O ESPECIAL (fecha) — exactamente
//    uno; el CHECK de la tabla lo exige y aquí se valida ANTES para contestar
//    con palabras en vez de un 23514.
// 🔒 DEFAULTS-1: ni el día ni el tipo traen default — elegir cuándo sale un
//    programa al aire es una ATRIBUCIÓN, y la pantalla nace con «— elige —».
// 🔒 Las horas van en HORA DE REYNOSA, 'HH:MM'. El FIN es OPCIONAL desde
//    RADIO-V2a2 (vacío = CIERRE LIBRE: «se extiende todo lo que ellos
//    quieran»); si viene, fin > inicio (cruce de medianoche = dos filas).
// 🔒 LA FOTO: viaja en base64, se valida por MAGIA DE BYTES (jpg/png/webp,
//    nunca por el nombre — los avatares SVG con nombre .png ya mordieron) y
//    sube al bucket PÚBLICO `radio-programas` (la página /radio es pública).
//    La foto JAMÁS tumba el programa: si falla, el programa queda y se DICE
//    (foto_error) — la forma de «el correo jamás tumba el dinero».
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Valida y arma la fila a escribir. Devuelve { fila } o { error }.
function filaDe(p) {
  const o = p || {};
  const nombre = String(o.nombre || '').trim();
  if (nombre.length < 2 || nombre.length > 80) return { error: 'El nombre va de 2 a 80 caracteres' };
  const descripcion = String(o.descripcion || '').trim().slice(0, 300) || null;
  const conductor = String(o.conductor || '').trim().slice(0, 80) || null;
  const tieneDia = o.dia_semana !== undefined && o.dia_semana !== null && o.dia_semana !== '';
  const tieneFecha = o.fecha !== undefined && o.fecha !== null && o.fecha !== '';
  if (tieneDia === tieneFecha) return { error: 'Un programa es SEMANAL (día) o ESPECIAL (fecha) — exactamente uno de los dos' };
  let dia_semana = null, fecha = null;
  if (tieneDia) {
    dia_semana = Math.round(Number(o.dia_semana));
    if (!(dia_semana >= 0 && dia_semana <= 6)) return { error: 'dia_semana va de 0 (domingo) a 6 (sábado)' };
  } else {
    fecha = String(o.fecha).slice(0, 10);
    if (!FECHA_RE.test(fecha)) return { error: 'fecha debe ser YYYY-MM-DD' };
  }
  const hora_inicio = String(o.hora_inicio || '').slice(0, 5);
  if (!HORA_RE.test(hora_inicio)) return { error: 'La hora de inicio va HH:MM (hora de Reynosa)' };
  // [RADIO-V2a2] El fin es OPCIONAL: vacío = CIERRE LIBRE (el programa se
  // extiende lo que quieran). Si viene, tiene forma y va después del inicio.
  const hora_fin = String(o.hora_fin || '').slice(0, 5) || null;
  if (hora_fin != null) {
    if (!HORA_RE.test(hora_fin)) return { error: 'La hora de fin va HH:MM, o se deja vacía (cierre libre)' };
    if (hora_fin <= hora_inicio) return { error: 'La hora de fin debe ser mayor que la de inicio (un programa que cruza medianoche se captura como dos filas, o se deja sin fin)' };
  }
  const color = String(o.color || '').trim() || null;
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'El color va como #RRGGBB' };
  const activo = o.activo === undefined ? true : o.activo !== false;
  return { fila: { nombre, descripcion, conductor, dia_semana, fecha, hora_inicio, hora_fin, color, activo } };
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = { 'Access-Control-Allow-Origin': __origin || 'null', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
  const res = (s, o) => ({ statusCode: s, headers, body: JSON.stringify(o) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  if (!__origin) return res(403, { error: 'Origen no permitido' });

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return res(auth.status, { error: auth.error });

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return res(400, { error: 'JSON inválido' }); }
  const accion = String(body.accion || '');

  const URL_ = process.env.SUPABASE_URL_KAMEHOUSE, KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!URL_ || !KEY) return res(500, { error: 'Faltan env vars KH' });
  const sb = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const T = `${URL_}/rest/v1/radio_programas`;
  const BUCKET = `${URL_}/storage/v1/object/radio-programas`;
  const PUB = `${URL_}/storage/v1/object/public/radio-programas`;

  // [RADIO-V2a2] base64 → bucket público. El TIPO se decide por MAGIA DE BYTES
  // (jamás por el nombre — los SVG con nombre .png ya mordieron); tope 3 MB.
  // Devuelve { url } o { error }: quien llama decide — la foto no tumba nada.
  async function subirFoto(b64, id) {
    try {
      const buf = Buffer.from(String(b64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (!buf.length) return { error: 'La foto llegó vacía' };
      if (buf.length > 3 * 1024 * 1024) return { error: 'La foto pasa de 3 MB — achícala' };
      let tipo = null, ext = null;
      if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) { tipo = 'image/jpeg'; ext = 'jpg'; }
      else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) { tipo = 'image/png'; ext = 'png'; }
      else if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') { tipo = 'image/webp'; ext = 'webp'; }
      if (!tipo) return { error: 'La foto no es JPG/PNG/WebP (se mira por los bytes, no por el nombre)' };
      const path = `programas/${id}-${Date.now()}.${ext}`;
      const r = await fetch(`${BUCKET}/${path}`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': tipo }, body: buf });
      if (!r.ok) return { error: 'El bucket no la aceptó: ' + (await r.text()).slice(0, 120) };
      return { url: `${PUB}/${path}` };
    } catch (e) { return { error: e.message }; }
  }

  try {
    if (accion === 'listar') {
      const r = await fetch(`${T}?select=*&order=archivado.asc,dia_semana.asc.nullslast,fecha.asc.nullslast,hora_inicio.asc&limit=500`, { headers: sb });
      if (!r.ok) throw new Error('Supabase ' + r.status);
      return res(200, { ok: true, programas: await r.json() });
    }

    if (accion === 'crear') {
      const v = filaDe(body.programa);
      if (v.error) return res(400, { error: v.error });
      // INSERT directo, sin on_conflict (regla de la casa).
      const r = await fetch(T, { method: 'POST', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify(v.fila) });
      if (!r.ok) return res(502, { error: 'No se pudo crear: ' + (await r.text()).slice(0, 200) });
      const filas = await r.json().catch(() => []);
      const prog = filas[0] || null;
      // La foto DESPUÉS del programa, y jamás lo tumba: si falla, se DICE.
      let foto_error;
      if (prog && body.foto_b64) {
        const f = await subirFoto(body.foto_b64, prog.id);
        if (f.url) {
          const rp = await fetch(`${T}?id=eq.${prog.id}`, { method: 'PATCH', headers: sb, body: JSON.stringify({ foto_url: f.url }) });
          if (rp.ok) prog.foto_url = f.url; else foto_error = 'La foto subió pero no se pudo anotar en el programa';
        } else foto_error = f.error;
      }
      return res(200, { ok: true, programa: prog, ...(foto_error ? { foto_error } : {}) });
    }

    if (accion === 'editar') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return res(400, { error: 'id inválido' });
      const v = filaDe(body.programa);
      if (v.error) return res(400, { error: v.error });
      // La foto se resuelve ANTES del PATCH para que viaje en la misma escritura;
      // si falla, el resto de la edición entra igual y se DICE (foto_error).
      let foto_error;
      if (body.foto_quitar === true) v.fila.foto_url = null;
      else if (body.foto_b64) {
        const f = await subirFoto(body.foto_b64, id);
        if (f.url) v.fila.foto_url = f.url; else foto_error = f.error;
      }
      const r = await fetch(`${T}?id=eq.${id}`, { method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify(v.fila) });
      if (!r.ok) return res(502, { error: 'No se pudo editar: ' + (await r.text()).slice(0, 200) });
      const filas = await r.json().catch(() => []);
      if (!filas.length) return res(404, { error: 'Ese programa no existe' });
      return res(200, { ok: true, ...(foto_error ? { foto_error } : {}) });
    }

    if (accion === 'archivar') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return res(400, { error: 'id inválido' });
      const archivado = body.archivado !== false;
      const r = await fetch(`${T}?id=eq.${id}`, { method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify({ archivado }) });
      if (!r.ok) return res(502, { error: 'No se pudo archivar: ' + (await r.text()).slice(0, 200) });
      const filas = await r.json().catch(() => []);
      if (!filas.length) return res(404, { error: 'Ese programa no existe' });
      return res(200, { ok: true, archivado });
    }

    if (accion === 'eliminar') {
      // [RADIO-V2a2] Eliminar DE VERDAD (palabra de Memo): la cartelera es
      // contenido, no dinero. El candado vive AQUÍ: confirmar:true o nada.
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return res(400, { error: 'id inválido' });
      if (body.confirmar !== true) return res(400, { error: 'Eliminar exige confirmar:true — sin eso, cero escrituras' });
      // Se lee ANTES para poder barrer su foto del bucket (best-effort).
      const r0 = await fetch(`${T}?id=eq.${id}&select=id,foto_url`, { headers: sb });
      const previas = r0.ok ? await r0.json().catch(() => []) : [];
      if (!previas.length) return res(404, { error: 'Ese programa no existe' });
      const r = await fetch(`${T}?id=eq.${id}`, { method: 'DELETE', headers: { ...sb, Prefer: 'return=representation' } });
      if (!r.ok) return res(502, { error: 'No se pudo eliminar: ' + (await r.text()).slice(0, 200) });
      const idas = await r.json().catch(() => []);
      if (!idas.length) return res(404, { error: 'Ese programa ya no existía' });
      // La foto huérfana se barre sin drama: si falla, el programa ya se fue igual.
      const fu = previas[0].foto_url || '';
      const m = fu.match(/\/object\/public\/radio-programas\/(.+)$/);
      if (m) await fetch(`${BUCKET}/${m[1]}`, { method: 'DELETE', headers: sb }).catch(() => {});
      return res(200, { ok: true });
    }

    return res(400, { error: "accion inválida: 'listar' | 'crear' | 'editar' | 'archivar' | 'eliminar'" });
  } catch (e) {
    return res(502, { error: 'La cartelera no se pudo leer/escribir: ' + e.message });
  }
};
