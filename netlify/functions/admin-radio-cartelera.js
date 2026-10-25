// =============================================================================
// admin-radio-cartelera  (RADIO-V2a · 24-oct-2026 — Kaio-sama captura la parrilla)
//
// CRUD de `radio_programas`, SOLO maestro_roshi (la radio es de Memo).
//
//   POST { accion:'listar' }   → { ok, programas:[todos, archivados incluidos] }
//   POST { accion:'crear',  programa:{...} }        → { ok, programa }
//   POST { accion:'editar', id, programa:{...} }    → { ok }
//   POST { accion:'archivar', id, archivado:bool }  → { ok }
//
// 🔒 SIN DELETE: un programa se ARCHIVA (la fila es el acta de que existió).
// 🔒 Un programa es SEMANAL (dia_semana 0-6) O ESPECIAL (fecha) — exactamente
//    uno; el CHECK de la tabla lo exige y aquí se valida ANTES para contestar
//    con palabras en vez de un 23514.
// 🔒 DEFAULTS-1: ni el día ni el tipo traen default — elegir cuándo sale un
//    programa al aire es una ATRIBUCIÓN, y la pantalla nace con «— elige —».
// 🔒 Las horas van en HORA DE REYNOSA, 'HH:MM'; fin > inicio (un programa que
//    cruza medianoche se captura como dos filas — dicho en el acta).
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
  const hora_fin = String(o.hora_fin || '').slice(0, 5);
  if (!HORA_RE.test(hora_inicio) || !HORA_RE.test(hora_fin)) return { error: 'Las horas van HH:MM (hora de Reynosa)' };
  if (hora_fin <= hora_inicio) return { error: 'La hora de fin debe ser mayor que la de inicio (un programa que cruza medianoche se captura como dos filas)' };
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
      return res(200, { ok: true, programa: filas[0] || null });
    }

    if (accion === 'editar') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return res(400, { error: 'id inválido' });
      const v = filaDe(body.programa);
      if (v.error) return res(400, { error: v.error });
      const r = await fetch(`${T}?id=eq.${id}`, { method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify(v.fila) });
      if (!r.ok) return res(502, { error: 'No se pudo editar: ' + (await r.text()).slice(0, 200) });
      const filas = await r.json().catch(() => []);
      if (!filas.length) return res(404, { error: 'Ese programa no existe' });
      return res(200, { ok: true });
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

    return res(400, { error: "accion inválida: 'listar' | 'crear' | 'editar' | 'archivar'" });
  } catch (e) {
    return res(502, { error: 'La cartelera no se pudo leer/escribir: ' + e.message });
  }
};
