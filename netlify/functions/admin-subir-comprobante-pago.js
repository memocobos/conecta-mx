// =============================================================================
// admin-subir-comprobante-pago  (Fase 3 — comprobante por pago, ESCRITURA)
//
// Sube el comprobante (captura de la transferencia) de UN pago al bucket privado
// 'comprobantes' del Supabase del portal y guarda el PATH en pagos.comprobante_url.
// El admin (Bulma/Roshi) NO tiene sesión de Supabase (usa JWT de KH) y NO cumple
// las policies del bucket (orientadas al cliente por auth.uid()), así que la subida
// va por aquí con service_role (bypassa RLS). Mismo bucket y misma convención de
// "guardar el path, firmar al ver" que el comprobante del separo
// (admin-solicitud-comprobante).
//
// Body JSON: { pago_id: uuid, file_base64, mime, ext }
//   - mime permitido: image/jpeg, image/png, image/webp, application/pdf.
//   - La extensión se deriva del mime (no se confía en `ext` del cliente → evita
//     path injection). `ext` se acepta en el body por compatibilidad pero se ignora.
//   - Si el archivo decodificado supera ~4 MB → 413 (Netlify limita el payload).
//
// Path en Storage: pagos/{solicitud_id}/{pago_id}_{timestamp}.{ext}
//
// Devuelve { ok, url, path }: `url` es una signed URL (1h) para mostrar el archivo
// de inmediato; lo persistido en la BD es el `path` (las signed URLs caducan).
//
// Seguridad: corsCheck + verifyAdminAuth(['maestro_roshi','bulma']).
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const MAX_BYTES = 4 * 1024 * 1024; // ~4 MB
const SIGN_EXPIRES_IN = 60 * 60;   // 1 hora, igual que el separo

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

  const auth = verifyAdminAuth(event, ['maestro_roshi', 'bulma', 'milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const pagoId = body.pago_id;
  if (!pagoId || !/^[0-9a-f-]{36}$/i.test(pagoId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pago_id inválido' }) };
  }

  const mime = body.mime;
  const ext = MIME_EXT[mime];
  if (!ext) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Tipo de archivo no permitido (usa JPG, PNG, WEBP o PDF)' }) };
  }

  const fileB64 = body.file_base64;
  if (!fileB64 || typeof fileB64 !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta file_base64' }) };
  }

  const buf = Buffer.from(fileB64, 'base64');
  if (!buf.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Archivo vacío o base64 inválido' }) };
  }
  if (buf.length > MAX_BYTES) {
    return { statusCode: 413, headers, body: JSON.stringify({ error: 'El archivo es muy grande, súbelo más liviano (máx 4 MB)' }) };
  }

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1) Traer el pago para sacar solicitud_id (arma el path).
    const pagoR = await fetch(
      `${env.PORTAL_SB_URL}/rest/v1/pagos?id=eq.${pagoId}&select=id,solicitud_id`,
      { headers: sbHeaders }
    );
    if (!pagoR.ok) {
      const detail = await pagoR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta del pago', detail }) };
    }
    const pagoArr = await pagoR.json();
    const pago = Array.isArray(pagoArr) ? pagoArr[0] : null;
    if (!pago) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Pago no encontrado' }) };

    const path = `pagos/${pago.solicitud_id}/${pagoId}_${Date.now()}.${ext}`;

    // 2) Subir al Storage con service_role (bypassa RLS). El path lleva timestamp
    //    → único, así que POST (create) no choca con archivos previos.
    const upR = await fetch(
      `${env.PORTAL_SB_URL}/storage/v1/object/comprobantes/${encodeURI(path)}`,
      {
        method: 'POST',
        headers: {
          apikey: env.PORTAL_SB_SERVICE,
          Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
          'Content-Type': mime,
        },
        body: buf,
      }
    );
    if (!upR.ok) {
      const detail = await upR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase Storage rechazó la subida', detail }) };
    }

    // 3) Guardar el PATH en el pago (no la signed URL — esa caduca).
    const patchR = await fetch(`${env.PORTAL_SB_URL}/rest/v1/pagos?id=eq.${pagoId}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ comprobante_url: path }),
    });
    if (!patchR.ok) {
      const detail = await patchR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Archivo subido, pero falló guardar comprobante_url', detail }) };
    }

    // 4) Firmar para mostrarlo de inmediato (igual que el separo: signed url 1h).
    let url = null;
    const signR = await fetch(
      `${env.PORTAL_SB_URL}/storage/v1/object/sign/comprobantes/${encodeURI(path)}`,
      { method: 'POST', headers: sbHeaders, body: JSON.stringify({ expiresIn: SIGN_EXPIRES_IN }) }
    );
    if (signR.ok) {
      const signData = await signR.json();
      const signedPath = signData.signedURL || signData.signedUrl;
      if (signedPath) {
        url = signedPath.startsWith('http') ? signedPath : `${env.PORTAL_SB_URL}/storage/v1${signedPath}`;
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, url, path }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error subiendo el comprobante', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
