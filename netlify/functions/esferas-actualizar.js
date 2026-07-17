// =============================================================================
// esferas-actualizar
//
// Edita una fila de esferas_eventos (Esferas del Dragón). La fila es la fuente
// de verdad del objeto EV; al re-publicar, el compilador (UPSERT) reemplaza el
// objeto en index.html con estos valores.
//
// Body JSON: { slug, ...campos }. El slug es la identidad (PK), NO se edita.
// Whitelist editable EXACTA: { nombre, fecha_inicio, ciudad, tipo, status }.
//
// Seguridad/molde calcado de esferas-crear:
//   - corsCheck + verifyAdminAuth(['maestro_roshi'])
//   - PATCH a esferas_eventos por slug con service_role (bypass RLS)
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

// Whitelist EDITABLE. slug AUSENTE a propósito (identidad / PK, no se edita).
const CAMPOS_EDITABLES = new Set(['nombre', 'titulo', 'fecha_inicio', 'ciudad', 'tipo', 'status', 'venue', 'music', 'fechas_extra', 'zonas', 'hotel', 'mapa', 'inc', 'sep', 'sep_cheap', 'nota', 'festival', 'foto']);

// festival: JSON del festival (lineup/switches/paquetes) o null = concierto.
// Acepta string JSON o objeto; vacío/basura → null (nunca rompe). Igual que zonas.
function saneFestival(v) {
  if (v == null || v === '') return null;
  let obj = v;
  if (typeof v === 'string') { try { obj = JSON.parse(v); } catch { return null; } }
  if (!obj || typeof obj !== 'object') return null;
  return JSON.stringify(obj);
}

// inc: JSON array de strings ("qué incluye"). Acepta array o string JSON. Saneo:
// trim, descarta vacíos/no-strings. Sin filas → null (limpia). String JSON o null.
function saneInc(v) {
  let arr = v;
  if (typeof v === 'string') { try { arr = JSON.parse(v); } catch { return null; } }
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    const s = x.trim();
    if (s) out.push(s);
  }
  if (!out.length) return null;
  return JSON.stringify(out);
}

// sep / sep_cheap: entero >= 0. Basura/negativo/vacío → null. Devuelve number o null.
function saneInt(v) {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return (Number.isFinite(n) && n >= 0) ? Math.round(n) : null;
}

// nota: texto libre (aviso). Trim. Vacío → null. Devuelve string o null.
function saneNota(v) {
  const s = (typeof v === 'string') ? v.trim() : '';
  return s || null;
}

// hotel (B2b): JSON {custom, total, items:[{n,e,viaj}]}. `e` = extra POR PERSONA.
// Si custom falso / sin items válidos → null (limpia / cae a default de ciudad).
function saneHotel(v) {
  let obj = v;
  if (typeof v === 'string') { try { obj = JSON.parse(v); } catch { return null; } }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (!obj.custom || !Array.isArray(obj.items)) return null;
  const items = [];
  for (const it of obj.items) {
    if (!it || typeof it !== 'object') continue;
    const n = (typeof it.n === 'string' ? it.n : '').trim();
    if (!n) continue;
    const e = Number(it.e);
    const viaj = Array.isArray(it.viaj)
      ? it.viaj.map((x) => parseInt(x, 10)).filter((x) => Number.isInteger(x) && x >= 1 && x <= 4)
      : [];
    items.push({ n, e: (Number.isFinite(e) && e > 0) ? Math.round(e) : 0, viaj });
  }
  if (!items.length) return null;
  const total = Number(obj.total);
  return JSON.stringify({ custom: true, total: (Number.isFinite(total) && total > 0) ? Math.round(total) : 0, items });
}

// zonas (B1): JSON array de objetos {n,p,pc?,ag}. Acepta array o string
// JSON. Saneo: descarta filas sin nombre, normaliza números/flags. Basura o
// sin filas → null (limpia / cae a evento sin zonas). Devuelve string JSON o null.
// (VIP ignorado si llega: ya no se usa.)
function saneZonas(v) {
  let arr = v;
  if (typeof v === 'string') { try { arr = JSON.parse(v); } catch { return null; } }
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const z of arr) {
    if (!z || typeof z !== 'object') continue;
    const n = (typeof z.n === 'string' ? z.n : '').trim();
    if (!n) continue;
    const p = Number(z.p);
    const pc = Number(z.pc);
    const row = { n, p: (Number.isFinite(p) && p > 0) ? Math.round(p) : 0 };
    if (Number.isFinite(pc) && pc > 0) row.pc = Math.round(pc);
    if (z.ag === 1 || z.ag === true || z.ag === '1') row.ag = 1;
    out.push(row);
  }
  if (!out.length) return null;
  return JSON.stringify(out);
}

// fechas_extra: JSON array de fechas ADICIONALES 'YYYY-MM-DD' (multifecha-ficha).
// Acepta array o string JSON. Saneo: descarta no-fechas, dedupe, ordena. Si no
// queda nada útil → null (limpia/cae a fecha única). Devuelve string JSON o null.
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
function saneFechasExtra(v) {
  let arr = v;
  if (typeof v === 'string') { try { arr = JSON.parse(v); } catch { return null; } }
  if (!Array.isArray(arr)) return null;
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    const s = x.slice(0, 10);
    if (!FECHA_RE.test(s)) continue;
    const mo = parseInt(s.slice(5, 7), 10);
    const d = parseInt(s.slice(8, 10), 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  if (!out.length) return null;
  out.sort();
  return JSON.stringify(out);
}
// mapa: URL pública del mapa del venue (subido a bucket mapas-eventos). Acepta
// URL http(s) o ruta absoluta; cualquier otra cosa → '' (limpia / sin mapa). El
// compilador solo emite mapa si no está vacío. Devuelve string ('' = limpiar).
function saneMapa(v) {
  const s = (typeof v === 'string') ? v.trim() : '';
  if (!s) return '';
  return (/^https?:\/\//.test(s) || s.charAt(0) === '/') ? s : '';
}

// foto: URL pública de la portada del CONCIERTO (bucket mapas-eventos, tipo
// portada). Igual que mapa: acepta URL http(s) o ruta absoluta; otra cosa → ''
// (limpia / sin foto). El compilador emite staticImg+img:false solo si no vacío.
function saneFoto(v) {
  const s = (typeof v === 'string') ? v.trim() : '';
  if (!s) return '';
  return (/^https?:\/\//.test(s) || s.charAt(0) === '/') ? s : '';
}

// Status de Esferas (simplificado): Disponible / Próximamente / Últimos / Agotado.
const STATUS_PERMITIDOS = new Set(['', 'proximamente', 'ultimos', 'agotado']);

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

  if (!SB_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El slug es requerido' }) };

  // Solo columnas whitelisted. status vacío = '' (A la venta); el resto vacío = null.
  const sane = {};
  for (const [k, v] of Object.entries(body)) {
    if (!CAMPOS_EDITABLES.has(k)) continue;
    if (k === 'fechas_extra') { sane[k] = saneFechasExtra(v); continue; }
    if (k === 'zonas') { sane[k] = saneZonas(v); continue; }
    if (k === 'hotel') { sane[k] = saneHotel(v); continue; }
    if (k === 'mapa') { sane[k] = saneMapa(v); continue; }
    if (k === 'foto') { sane[k] = saneFoto(v); continue; }
    if (k === 'inc') { sane[k] = saneInc(v); continue; }
    if (k === 'sep' || k === 'sep_cheap') { sane[k] = saneInt(v); continue; }
    if (k === 'nota') { sane[k] = saneNota(v); continue; }
    if (k === 'festival') { sane[k] = saneFestival(v); continue; }
    if (v === null || v === '') sane[k] = (k === 'status') ? '' : null;
    else sane[k] = String(v);
  }

  // nombre, si viene, no puede quedar vacío.
  if ('nombre' in sane && !sane.nombre) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'El nombre no puede quedar vacío' }) };
  }
  // status, si viene, debe estar permitido.
  if ('status' in sane && !STATUS_PERMITIDOS.has(sane.status)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Status no permitido' }) };
  }
  if (Object.keys(sane).length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No hay campos editables en el body' }) };
  }

  sane.updated_at = new Date().toISOString();

  try {
    // SALVAGUARDA: el slug debe existir en esferas_eventos.
    const chkRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&select=slug`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!chkRes.ok) {
      const detail = await chkRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la query', detail }) };
    }
    const existentes = await chkRes.json();
    if (!Array.isArray(existentes) || existentes.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: `No existe un evento con slug '${slug}'` }) };
    }

    // PATCH por slug. return=representation para devolver la fila actualizada.
    const patchRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(sane),
    });
    if (!patchRes.ok) {
      const detail = await patchRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó el update', detail }) };
    }
    const rows = await patchRes.json();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, evento: (Array.isArray(rows) ? rows[0] : rows) || {} }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error escribiendo a Supabase', detail: e.message }) };
  }
};
