// =============================================================================
// esferas-subir-mapa
//
// Sube la imagen del MAPA del venue de una Esfera al bucket PÚBLICO
// 'mapas-eventos' (proyecto KH npgnhsmwpcipxgvfxrho) y devuelve la URL pública
// directa. El caller (kamehouse) guarda esa URL en el campo `mapa` del evento.
//
// Patrón de subida calcado de contrato-firmar.js (POST crudo a la REST de
// Storage con service_role + x-upsert). Auth/CORS calcados de esferas-crear.
//
// Body JSON: { slug, dataUrl }  — dataUrl = 'data:image/<sub>;base64,...'
// Respuesta: { ok:true, url:'<público>', path:'<slug>.<ext>' }
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const BUCKET = 'mapas-eventos';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const SLUG_RE = /^[a-z0-9-]+$/;

// Acepta data URL `data:image/<sub>;base64,XYZ`. Devuelve {bytes, mime, ext} o
// {error}/{tooBig}. Solo webp/jpg/png (el resto cae a jpg). Calcado de
// contrato-firmar.js#parseImageData pero acotado a los formatos de mapa.
function parseImageData(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return { error: 'dataUrl vacío' };
  const m = dataStr.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return { error: 'data URL inválido (se espera data:image/...;base64,...)' };
  const mime = m[1].toLowerCase();
  const b64 = m[2].replace(/\s+/g, '');
  let bytes;
  try { bytes = Buffer.from(b64, 'base64'); } catch (e) { return { error: 'base64 corrupta' }; }
  if (!bytes.length) return { error: 'bytes vacíos tras decodificar' };
  if (bytes.length > MAX_BYTES) return { tooBig: true, size: bytes.length };
  const ext =
    mime === 'image/png'  ? 'png'  :
    mime === 'image/webp' ? 'webp' :
    (mime === 'image/jpeg' || mime === 'image/jpg') ? 'jpg' :
    null;
  if (!ext) return { error: 'formato no soportado (usa webp, jpg o png)' };
  return { bytes, mime, ext };
}

async function uploadObject(path, bytes, contentType) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Storage ${r.status}: ${text}`);
  }
  return path;
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

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  if (!SB_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El slug es requerido' }) };
  if (!SLUG_RE.test(slug)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Slug inválido' }) };

  const parsed = parseImageData(body.dataUrl);
  if (parsed.error) return { statusCode: 400, headers, body: JSON.stringify({ error: parsed.error }) };
  if (parsed.tooBig) return { statusCode: 413, headers, body: JSON.stringify({ error: 'La imagen no puede pesar más de 5MB' }) };

  const path = `${slug}.${parsed.ext}`;
  try {
    await uploadObject(path, parsed.bytes, parsed.mime);
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase Storage rechazó la subida', detail: e.message }) };
  }

  // Bucket PÚBLICO → URL directa sin firmar.
  const url = `${SB_URL}/storage/v1/object/public/${BUCKET}/${encodeURI(path)}`;
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, url, path }) };
};
