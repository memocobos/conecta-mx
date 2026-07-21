// =============================================================================
// contrato-viajero-firmar  (Contratos F2a — FIRMAR un contrato por token)
//
// Público, gated por el token del contrato. Valida los 3 obligatorios de Memo
// (firma + INE frente + INE reverso) + acepto:true + contacto de emergencia
// completo (y firmante_nombre si el contrato es de un menor). Sube las 3
// imágenes al bucket PRIVADO 'contratos-clientes' con service key, marca
// estado='firmado', guarda urls (paths), snapshot de emergencia, firmante y
// firmado_at.
//
//   POST { token, firma(dataURL), ine_frente(dataURL), ine_reverso(dataURL),
//          emergencia:{nombre,telefono,parentesco}, firmante_nombre?, acepto:true }
//     → 200 { ok } | 400 faltan datos | 404 no existe | 409 ya firmado | 410 anulado
//
// Las imágenes llegan ya comprimidas del navegador (#280); cap defensivo 5MB/pieza.
// Env vars: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const BUCKET = 'contratos-clientes';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB por pieza
const MIME_EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };

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

  // ---- Validación de obligatorios ----
  if (body.acepto !== true) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Debes aceptar los términos.' }) };

  const firma = decodeDataUrl(body.firma);
  const ineFrente = decodeDataUrl(body.ine_frente);
  const ineReverso = decodeDataUrl(body.ine_reverso);
  if (!firma) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta la firma.' }) };
  if (!ineFrente) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el frente de tu INE.' }) };
  if (!ineReverso) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el reverso de tu INE.' }) };
  for (const [nom, p] of [['firma', firma], ['INE frente', ineFrente], ['INE reverso', ineReverso]]) {
    if (!MIME_EXT[p.mime]) return { statusCode: 400, headers, body: JSON.stringify({ error: `Formato no soportado en ${nom} (usa WEBP/PNG/JPG).` }) };
    if (p.bytes.length > MAX_BYTES) return { statusCode: 400, headers, body: JSON.stringify({ error: `La imagen de ${nom} supera 5MB.` }) };
    if (!p.bytes.length) return { statusCode: 400, headers, body: JSON.stringify({ error: `La imagen de ${nom} está vacía.` }) };
  }

  const emergencia = (body && typeof body.emergencia === 'object' && body.emergencia) ? body.emergencia : {};
  const emNombre = String(emergencia.nombre || '').trim();
  const emTel = String(emergencia.telefono || '').trim();
  const emParen = String(emergencia.parentesco || '').trim();
  if (!emNombre || !emTel || !emParen) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Completa el contacto de emergencia (nombre, teléfono y parentesco).' }) };
  }
  const firmanteNombre = String(body.firmante_nombre || '').trim();

  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE };
  const sbJson = { ...sb, 'Content-Type': 'application/json' };

  try {
    // ---- Contrato por token: estado + tipo ----
    const cr = await fetch(
      `${SB_URL}/rest/v1/contratos_viajeros?token=eq.${encodeURIComponent(token)}&select=id,estado,tipo&limit=1`,
      { headers: sb }
    );
    if (!cr.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta' }) };
    const c = (await cr.json().catch(() => []))[0];
    if (!c) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Contrato no encontrado' }) };
    if (c.estado === 'anulado') return { statusCode: 410, headers, body: JSON.stringify({ error: 'Este contrato fue anulado.' }) };
    if (c.estado === 'firmado') return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este contrato ya fue firmado.' }) };

    // Menor: firmante_nombre (el adulto responsable) es obligatorio.
    if (c.tipo === 'menor' && !firmanteNombre) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Para un menor, escribe el nombre del padre/madre o tutor que firma.' }) };
    }

    // ---- Subir las 3 imágenes al bucket privado ----
    const paths = {
      firma:       `${c.id}/firma.${MIME_EXT[firma.mime]}`,
      ine_frente:  `${c.id}/ine_frente.${MIME_EXT[ineFrente.mime]}`,
      ine_reverso: `${c.id}/ine_reverso.${MIME_EXT[ineReverso.mime]}`,
    };
    await subir(SB_URL, sb, paths.firma, firma);
    await subir(SB_URL, sb, paths.ine_frente, ineFrente);
    await subir(SB_URL, sb, paths.ine_reverso, ineReverso);

    // ---- Marcar firmado — PATCH condicional (estado=pendiente) como candado
    //      atómico anti doble-firma. Si 0 filas → alguien firmó/anuló en paralelo.
    const nowISO = new Date().toISOString();
    const patch = {
      estado: 'firmado',
      firma_url: paths.firma,
      ine_frente_url: paths.ine_frente,
      ine_reverso_url: paths.ine_reverso,
      emergencia: { nombre: emNombre, telefono: emTel, parentesco: emParen },
      firmante_nombre: firmanteNombre || null,
      acepto_terminos: true,
      firmado_at: nowISO,
    };
    const up = await fetch(
      `${SB_URL}/rest/v1/contratos_viajeros?id=eq.${encodeURIComponent(c.id)}&estado=eq.pendiente`,
      { method: 'PATCH', headers: { ...sbJson, Prefer: 'return=representation' }, body: JSON.stringify(patch) }
    );
    if (!up.ok) {
      const detail = await up.text().catch(() => '');
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo guardar la firma', detail }) };
    }
    const updated = await up.json().catch(() => []);
    if (!Array.isArray(updated) || !updated.length) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este contrato ya fue firmado.' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error firmando el contrato', detail: e.message }) };
  }
};

// ----- helpers -----

// 'data:image/webp;base64,AAAA' → { mime, bytes:Buffer }. null si no es dataURL válido.
function decodeDataUrl(s) {
  if (typeof s !== 'string') return null;
  const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(s.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  let bytes;
  try { bytes = Buffer.from(m[2].replace(/\s+/g, ''), 'base64'); } catch (e) { return null; }
  return { mime, bytes };
}

// Sube un objeto al bucket privado (upsert). Lanza si falla.
async function subir(SB_URL, sb, path, piece) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...sb, 'Content-Type': piece.mime, 'x-upsert': 'true', 'Cache-Control': '3600' },
    body: piece.bytes,
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error('storage ' + r.status + ' (' + path + '): ' + detail.slice(0, 160));
  }
}
