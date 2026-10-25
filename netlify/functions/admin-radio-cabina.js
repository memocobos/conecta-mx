// =============================================================================
// admin-radio-cabina  (KAIO-CABINA-1 · 24-oct-2026 — la cabina de transmisión)
//
// El servidor de la CABINA de Kaio-sama. Tres mesas, SOLO maestro_roshi:
//
//  SOUNDBOARD (tabla radio_samplers + bucket público radio-samplers):
//   POST { accion:'samplers_listar' }                         → { ok, samplers }
//   POST { accion:'sampler_crear', nombre, color?, audio_b64 } → { ok, sampler }
//   POST { accion:'sampler_editar', id, nombre?, color?, audio_b64? } → { ok }
//   POST { accion:'sampler_eliminar', id, confirmar:true }     → { ok }
//     🔒 El audio se valida por MAGIA DE BYTES (mp3/wav/ogg — jamás por el
//     nombre), tope 5 MB. Eliminar es DELETE deliberado (contenido, no dinero
//     — la forma de RADIO-V2a2): confirmar:true EN EL SERVIDOR y barre su
//     objeto del bucket.
//
//  MÚSICA DEL CATÁLOGO (la BÚSQUEDA ya es de admin-radio-media ?buscar= — aquí
//  solo vive la DESCARGA para tocarla dentro de la mezcla de la cabina):
//   POST { accion:'cancion_descargar', ruta, desde? }
//        → { ok, b64, mime? (solo rebanada 0), desde, bytes, bytes_total, completo }
//     [KAIO-CABINA-2] Por REBANADAS de 4 MB: el front pide {desde} en bucle y
//     concatena. Tope TOTAL 25 MB (los 10 s de Netlify), dicho en el 413 — más
//     grande va por archivo local.
//
//  LOCUTORES (streamers de AzuraCast — las cuentas de DJ para transmitir):
//   POST { accion:'streamers_listar' } → { ok, streamers:[{id,usuario,nombre,activo}] }
//     (SIN contraseñas: AzuraCast no las regresa y aquí tampoco viajarían)
//   POST { accion:'streamer_crear', usuario, contrasena, nombre? } → { ok, streamer, nota? }
//     [KAIO-CABINA-2] Si la estación tiene los DJs APAGADOS
//     (StationUnsupportedException), se ENCIENDEN por la API de admin + reinicio
//     de la estación y se reintenta; la `nota` le dice a la pantalla que hubo
//     reinicio. Sin poder de admin, el error trae el camino manual del panel.
//   POST { accion:'streamer_eliminar', id, confirmar:true }        → { ok }
//
// La TRANSMISIÓN en sí NO pasa por aquí: la cabina del navegador se conecta
// directo al webcast de AzuraCast (wss://radio…/webdj/radioconecta/) con las
// credenciales del locutor — este endpoint solo administra las piezas.
// Seguridad: patrón de admin-radio-control (guard #253). Env: AZURACAST_API_KEY,
// SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const AZ_BASE = 'https://radio.conectareynosa.mx';
const STATION = '1';
const TIMEOUT_MS = 8000;
// ⚠️ 3.5 MB y no 5: el REQUEST de la function también tiene tope (~6 MB) y el
// base64 infla 4/3 — un sampler de 5 MB jamás habría llegado. Un efecto de
// 10 s en MP3 128 kbps pesa ~160 KB: sobra. El error DICE el tope.
const MAX_SAMPLER_BYTES = 3.5 * 1024 * 1024;
// [KAIO-CABINA-2, cazado por Memo en la primera prueba: «11.3 MB y el tope es
// 4.2»] La canción ya NO topa en 4.2 MB: viaja por REBANADAS de 4 MB (4 MB
// crudos ≈ 5.4 MB en base64, bajo el techo de ~6 MB de la RESPUESTA de una
// function). El tope que queda es TOTAL y de tiempo: si AzuraCast no honra el
// header Range, cada rebanada baja el archivo entero servidor-a-servidor, y un
// archivo de 25 MB roza los 10 s de Netlify — más grande va por archivo local.
const MAX_CANCION_BYTES = 25 * 1024 * 1024;  // tope TOTAL del puente, dicho en el 413
const CHUNK_CANCION = 4 * 1024 * 1024;       // la rebanada que SÍ cabe en una respuesta

function azFetch(url, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(t));
}

// El TIPO del audio por sus BYTES (jamás por el nombre — los SVG con nombre
// .png ya mordieron): MP3 (ID3 o frame sync 0xFFEx), WAV (RIFF…WAVE), OGG (OggS).
function tipoAudio(buf) {
  if (buf.length > 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf.length > 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  if (buf.length > 4 && buf.slice(0, 4).toString('ascii') === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  return null;
}

exports.handler = async (event) => {
  const __rawOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const __origin = corsCheck(event);
  const headers = { 'Access-Control-Allow-Origin': __origin || 'null', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
  const res = (s, o) => ({ statusCode: s, headers, body: JSON.stringify(o) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  if (__rawOrigin && !__origin) return res(403, { error: 'Origen no permitido' });

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return res(auth.status, { error: auth.error });

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return res(400, { error: 'JSON inválido' }); }
  const accion = String(body.accion || '');

  const URL_ = process.env.SUPABASE_URL_KAMEHOUSE, KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!URL_ || !KEY) return res(500, { error: 'Faltan env vars KH' });
  const sb = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const T = `${URL_}/rest/v1/radio_samplers`;
  const BUCKET = `${URL_}/storage/v1/object/radio-samplers`;
  const PUB = `${URL_}/storage/v1/object/public/radio-samplers`;

  // base64 → bucket público. Devuelve { url, bytes } o { error } (la forma de
  // subirFoto de admin-radio-cartelera, con la magia de bytes de AUDIO).
  async function subirAudio(b64, id) {
    try {
      const buf = Buffer.from(String(b64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (!buf.length) return { error: 'El audio llegó vacío' };
      if (buf.length > MAX_SAMPLER_BYTES) return { error: `El audio pesa ${(buf.length / 1048576).toFixed(1)} MB y el tope es 3.5 MB — recórtalo o comprímelo (un efecto corto en MP3 pesa centavos)` };
      const tipo = tipoAudio(buf);
      if (!tipo) return { error: 'El audio no es MP3/WAV/OGG (se mira por los bytes, no por el nombre)' };
      const path = `samplers/${id}-${Date.now()}.${tipo.ext}`;
      const r = await fetch(`${BUCKET}/${path}`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': tipo.mime }, body: buf });
      if (!r.ok) return { error: 'El bucket no lo aceptó: ' + (await r.text()).slice(0, 120) };
      return { url: `${PUB}/${path}`, bytes: buf.length };
    } catch (e) { return { error: e.message }; }
  }
  const borrarObjeto = (url) => {
    const m = String(url || '').match(/\/object\/public\/radio-samplers\/(.+)$/);
    return m ? fetch(`${BUCKET}/${m[1]}`, { method: 'DELETE', headers: sb }).catch(() => {}) : Promise.resolve();
  };

  try {
    // ── SOUNDBOARD ──────────────────────────────────────────────────────────
    if (accion === 'samplers_listar') {
      const r = await fetch(`${T}?archivado=is.false&select=*&order=orden.asc,creado_en.asc&limit=200`, { headers: sb });
      if (!r.ok) throw new Error('Supabase ' + r.status);
      return res(200, { ok: true, samplers: await r.json() });
    }

    if (accion === 'sampler_crear') {
      const nombre = String(body.nombre || '').trim();
      if (nombre.length < 1 || nombre.length > 60) return res(400, { error: 'El nombre va de 1 a 60 caracteres' });
      const color = String(body.color || '').trim() || null;
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res(400, { error: 'El color va como #RRGGBB' });
      if (!body.audio_b64) return res(400, { error: 'Falta el audio (audio_b64)' });
      // El audio PRIMERO: un sampler sin audio no es un sampler — no nace la
      // fila si el bucket no lo aceptó (al revés que la foto, que es adorno).
      const f = await subirAudio(body.audio_b64, 'nuevo');
      if (f.error) return res(400, { error: f.error });
      const r = await fetch(T, { method: 'POST', headers: { ...sb, Prefer: 'return=representation' },
        body: JSON.stringify({ nombre, color, audio_url: f.url, orden: Math.round(Number(body.orden || 0)) }) });
      if (!r.ok) { await borrarObjeto(f.url); return res(502, { error: 'No se pudo crear: ' + (await r.text()).slice(0, 200) }); }
      const filas = await r.json().catch(() => []);
      return res(200, { ok: true, sampler: filas[0] || null });
    }

    if (accion === 'sampler_editar') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return res(400, { error: 'id inválido' });
      const fila = {};
      if (body.nombre !== undefined) {
        const nombre = String(body.nombre || '').trim();
        if (nombre.length < 1 || nombre.length > 60) return res(400, { error: 'El nombre va de 1 a 60 caracteres' });
        fila.nombre = nombre;
      }
      if (body.color !== undefined) {
        const color = String(body.color || '').trim() || null;
        if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res(400, { error: 'El color va como #RRGGBB' });
        fila.color = color;
      }
      if (body.orden !== undefined) fila.orden = Math.round(Number(body.orden || 0));
      let urlVieja = null;
      if (body.audio_b64) {
        const r0 = await fetch(`${T}?id=eq.${id}&select=audio_url`, { headers: sb });
        const previas = r0.ok ? await r0.json().catch(() => []) : [];
        if (!previas.length) return res(404, { error: 'Ese sampler no existe' });
        urlVieja = previas[0].audio_url;
        const f = await subirAudio(body.audio_b64, id);
        if (f.error) return res(400, { error: f.error });
        fila.audio_url = f.url;
      }
      if (!Object.keys(fila).length) return res(400, { error: 'Nada que editar' });
      const r = await fetch(`${T}?id=eq.${id}`, { method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify(fila) });
      if (!r.ok) return res(502, { error: 'No se pudo editar: ' + (await r.text()).slice(0, 200) });
      const filas = await r.json().catch(() => []);
      if (!filas.length) return res(404, { error: 'Ese sampler no existe' });
      if (urlVieja && fila.audio_url) await borrarObjeto(urlVieja);   // el audio viejo se barre tras el reemplazo
      return res(200, { ok: true, sampler: filas[0] });
    }

    if (accion === 'sampler_eliminar') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return res(400, { error: 'id inválido' });
      if (body.confirmar !== true) return res(400, { error: 'Eliminar exige confirmar:true — sin eso, cero escrituras' });
      const r0 = await fetch(`${T}?id=eq.${id}&select=id,audio_url`, { headers: sb });
      const previas = r0.ok ? await r0.json().catch(() => []) : [];
      if (!previas.length) return res(404, { error: 'Ese sampler no existe' });
      const r = await fetch(`${T}?id=eq.${id}`, { method: 'DELETE', headers: { ...sb, Prefer: 'return=representation' } });
      if (!r.ok) return res(502, { error: 'No se pudo eliminar: ' + (await r.text()).slice(0, 200) });
      const idas = await r.json().catch(() => []);
      if (!idas.length) return res(404, { error: 'Ese sampler ya no existía' });
      await borrarObjeto(previas[0].audio_url);
      return res(200, { ok: true });
    }

    // ── MÚSICA DEL CATÁLOGO ─────────────────────────────────────────────────
    if (accion === 'cancion_descargar') {
      const ruta = String(body.ruta || '').trim();
      if (!ruta || ruta.includes('..')) return res(400, { error: 'ruta inválida' });
      const API_KEY = process.env.AZURACAST_API_KEY;
      if (!API_KEY) return res(500, { error: 'Falta env var AZURACAST_API_KEY' });
      const desde = Math.max(0, Math.round(Number(body.desde) || 0));
      // Se le PIDE la rebanada a AzuraCast (Range): si contesta 206 solo baja lo
      // suyo; si contesta 200 con todo, se rebana AQUÍ — el límite era la
      // respuesta al navegador, no el cable servidor-a-servidor.
      const r = await azFetch(`${AZ_BASE}/api/station/${STATION}/files/download?file=${encodeURIComponent(ruta)}`,
        { headers: { 'X-API-Key': API_KEY, Range: `bytes=${desde}-${desde + CHUNK_CANCION - 1}` } });
      if (!r.ok) return res(502, { error: 'AzuraCast no soltó el archivo: HTTP ' + r.status });
      const cuerpo = Buffer.from(await r.arrayBuffer());
      let total, rebanada;
      if (r.status === 206) {
        const m = String((r.headers && r.headers.get && r.headers.get('content-range')) || '').match(/\/(\d+)\s*$/);
        total = m ? Number(m[1]) : desde + cuerpo.length;
        rebanada = cuerpo.length > CHUNK_CANCION ? cuerpo.slice(0, CHUNK_CANCION) : cuerpo;
      } else {
        total = cuerpo.length;
        rebanada = cuerpo.slice(desde, desde + CHUNK_CANCION);
      }
      if (total > MAX_CANCION_BYTES) {
        return res(413, { error: `La canción pesa ${(total / 1048576).toFixed(1)} MB y el tope de la cabina es 25 MB — esa tócala desde «archivo local» (el MP3 vive en tu NAS/compu)`, bytes: total });
      }
      if (!rebanada.length) return res(400, { error: `desde=${desde} queda fuera del archivo (${total} bytes)` });
      // El mime se lee por bytes SOLO en la rebanada 0 — la magia vive al inicio del archivo.
      const tipo = desde === 0 ? (tipoAudio(rebanada) || { mime: 'audio/mpeg' }) : null;
      return res(200, { ok: true, b64: rebanada.toString('base64'), mime: tipo ? tipo.mime : undefined,
        desde, bytes: rebanada.length, bytes_total: total, completo: desde + rebanada.length >= total });
    }

    // ── LOCUTORES (streamers de AzuraCast) ──────────────────────────────────
    if (accion === 'streamers_listar') {
      const API_KEY = process.env.AZURACAST_API_KEY;
      if (!API_KEY) return res(500, { error: 'Falta env var AZURACAST_API_KEY' });
      const r = await azFetch(`${AZ_BASE}/api/station/${STATION}/streamers`, { headers: { 'X-API-Key': API_KEY } });
      if (!r.ok) return res(502, { error: 'AzuraCast contestó HTTP ' + r.status });
      const lista = await r.json().catch(() => []);
      // Proyección SIN contraseñas: aunque AzuraCast las mandara, aquí no viajan.
      return res(200, { ok: true, streamers: (Array.isArray(lista) ? lista : []).map((s) => ({
        id: s.id, usuario: s.streamer_username, nombre: s.display_name || s.streamer_username, activo: s.is_active !== false })) });
    }

    if (accion === 'streamer_crear') {
      const usuario = String(body.usuario || '').trim();
      const contrasena = String(body.contrasena || '');
      const nombre = String(body.nombre || '').trim() || usuario;
      if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(usuario)) return res(400, { error: 'El usuario va de 3 a 40 caracteres (letras, números, _ . -)' });
      if (contrasena.length < 8) return res(400, { error: 'La contraseña va de 8 caracteres para arriba' });
      const API_KEY = process.env.AZURACAST_API_KEY;
      if (!API_KEY) return res(500, { error: 'Falta env var AZURACAST_API_KEY' });
      const crear = () => azFetch(`${AZ_BASE}/api/station/${STATION}/streamers`, {
        method: 'POST', headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamer_username: usuario, streamer_password: contrasena, display_name: nombre, is_active: true }) });
      let r = await crear();
      let nota = null;
      if (!r.ok) {
        const texto = (await r.text().catch(() => '')).slice(0, 300);
        // [KAIO-CABINA-2, cazado por Memo en la primera prueba] La estación nació
        // con la puerta de DJs APAGADA y AzuraCast contesta
        // StationUnsupportedException. Se enciende por la API de admin
        // (enable_streamers) + reinicio de la estación — liquidsoap abre el
        // puerto del webdj al reiniciar — y se reintenta UNA vez.
        if (/StationUnsupportedException|does not currently support/i.test(texto)) {
          const hab = await azFetch(`${AZ_BASE}/api/admin/station/${STATION}`, {
            method: 'PUT', headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ enable_streamers: true }) });
          if (!hab.ok) return res(502, { error: 'La estación tiene APAGADA la puerta de DJs y no se pudo encender por API (HTTP ' + hab.status + '). Camino manual: AzuraCast → Administrar estaciones → Editar → pestaña Transmisores → «Permitir transmisores/DJs» → Guardar, y reinicia la estación. Luego vuelve a crear la cuenta aquí.' });
          await azFetch(`${AZ_BASE}/api/station/${STATION}/restart`, { method: 'POST', headers: { 'X-API-Key': API_KEY } }).catch(() => {});
          r = await crear();
          nota = 'La estación tenía apagada la puerta de DJs: se encendió y la estación se reinició para abrirla (la radio vuelve sola en ~20 s).';
          if (!r.ok) return res(502, { error: 'Se encendió la puerta de DJs pero el alta siguió fallando: ' + (await r.text().catch(() => '')).slice(0, 200) + ' — espera ~30 s a que la estación termine de reiniciar y vuelve a intentar.' });
        } else {
          return res(502, { error: 'AzuraCast no lo creó: ' + texto.slice(0, 200) });
        }
      }
      const s = await r.json().catch(() => ({}));
      return res(200, { ok: true, streamer: { id: s.id, usuario, nombre }, nota });
    }

    if (accion === 'streamer_eliminar') {
      const id = Math.round(Number(body.id));
      if (!(id > 0)) return res(400, { error: 'id inválido' });
      if (body.confirmar !== true) return res(400, { error: 'Eliminar exige confirmar:true — sin eso, cero escrituras' });
      const API_KEY = process.env.AZURACAST_API_KEY;
      if (!API_KEY) return res(500, { error: 'Falta env var AZURACAST_API_KEY' });
      const r = await azFetch(`${AZ_BASE}/api/station/${STATION}/streamer/${id}`, { method: 'DELETE', headers: { 'X-API-Key': API_KEY } });
      if (!r.ok) return res(502, { error: 'AzuraCast no lo eliminó: HTTP ' + r.status });
      return res(200, { ok: true });
    }

    return res(400, { error: "accion inválida: samplers_listar | sampler_crear | sampler_editar | sampler_eliminar | cancion_descargar | streamers_listar | streamer_crear | streamer_eliminar" });
  } catch (e) {
    return res(502, { error: 'La cabina no pudo con eso: ' + e.message });
  }
};
