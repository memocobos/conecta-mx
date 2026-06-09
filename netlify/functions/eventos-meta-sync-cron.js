// =============================================================================
// eventos-meta-sync-cron  (U1 — auto-sync de eventos_meta, versión CRON)
//
// Hace SOLO lo que hoy hace el botón manual "Sincronizar eventos"
// (_sincronizarEventosMeta en kamehouse.html), pero SIN intervención humana y
// parseando el EV server-side:
//   1. fetch del index.html desplegado (mismo host) → extrae el array `var EV`.
//   2. lo parsea de forma acotada (new Function con stubs auto-resueltos; la
//      función NO ejecuta el sitio, solo materializa el literal del array).
//   3. deriva por evento { slug, nombre, fecha, fecha_fin, tipo, dias } con la
//      MISMA lógica que _eventoMetaFila, + corrige fecha_fin de eventos multifecha
//      (la última fecha real) leyendo multifecha[].lbl y el string `f`.
//   4. UPSERT por slug a eventos_meta (service_role, on_conflict=slug, merge).
//
// ❗ SOLO agrega/actualiza — NUNCA borra filas de eventos_meta (un slug viejo es
//    inofensivo; borrar rompería crons que aún cuelgan de ese slug).
//
// Disparado por el schedule en netlify.toml (antes de recordatorio-eventos-diario).
// Sin auth: no recibe input externo; lee el index.html público y escribe con
// service_role. NUNCA expone la service key. Mismo estilo que check-strikes-diario.
//
// Env vars (reusa las existentes):
//   - SUPABASE_URL_KAMEHOUSE (|| SUPABASE_URL), SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - URL (Netlify la setea al dominio del sitio; fallback a producción)
// =============================================================================

const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://conectareynosa.mx';

// Festivales: días por slug (igual que FESTIVALES en kamehouse.html).
const FESTIVALES = {
  palnorte: 3, edc2026: 3, edc2027: 3, coronacapital: 3,
  emblema: 2, arre: 2, ultramexico: 2, flowfest: 2,
};

const SLUG_RE = /^[A-Za-z0-9_.\-]+$/;
const TIPOS_VALIDOS = ['concierto', 'festival'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const MES_ABBR = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
};
const MES_FULL = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

exports.handler = async function () {
  const env = readEnv();
  if (env.error) {
    console.error('[meta-sync-cron]', env.error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: env.error }) };
  }

  let ev;
  try {
    ev = await fetchEV();
  } catch (e) {
    console.error('[meta-sync-cron] no se pudo leer/parsear EV:', e.message);
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'EV: ' + e.message }) };
  }

  // Derivar filas (misma lógica que _eventoMetaFila + fecha_fin multifecha real).
  const derivadas = (ev || [])
    .filter((e) => e && e.id)
    .map(_eventoMetaFila)
    .filter(Boolean);

  // Saneo idéntico a eventos-meta-sync.js: slug válido, sin '#', len<80, dedup.
  const filas = [];
  const vistos = new Set();
  for (const e of derivadas) {
    const slug = typeof e.slug === 'string' ? e.slug.trim() : '';
    if (!slug || slug.length >= 80 || slug.includes('#') || !SLUG_RE.test(slug)) continue;
    if (vistos.has(slug)) continue;
    vistos.add(slug);
    const tipo = TIPOS_VALIDOS.includes(e.tipo) ? e.tipo : 'concierto';
    let dias = parseInt(e.dias, 10);
    if (!Number.isFinite(dias) || dias < 1) dias = 1;
    filas.push({
      slug,
      nombre: typeof e.nombre === 'string' ? e.nombre.trim() : slug,
      fecha: limpiaFecha(e.fecha),
      fecha_fin: limpiaFecha(e.fecha_fin),
      tipo,
      dias,
      updated_at: new Date().toISOString(),
    });
  }

  if (!filas.length) {
    console.warn('[meta-sync-cron] 0 filas con slug válido (¿EV vacío?)');
    return { statusCode: 200, body: JSON.stringify({ ok: true, upserted: 0 }) };
  }

  // UPSERT por slug (merge-duplicates). NUNCA delete.
  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };
  try {
    const r = await fetch(`${env.KH_SB_URL}/rest/v1/eventos_meta?on_conflict=slug`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify(filas),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('[meta-sync-cron] KH rechazó el upsert:', detail);
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'upsert', detail }) };
    }
    const slugs = filas.map((f) => f.slug);
    console.log(`[meta-sync-cron] upserted:${filas.length} slugs:`, slugs.join(','));
    return { statusCode: 200, body: JSON.stringify({ ok: true, upserted: filas.length, slugs }) };
  } catch (e) {
    console.error('[meta-sync-cron] error de red:', e.message);
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EV: fetch + extracción + parseo acotado
// ─────────────────────────────────────────────────────────────────────────────

async function fetchEV() {
  const url = `${SITE_URL.replace(/\/$/, '')}/index.html`;
  const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' al leer ' + url);
  const html = await r.text();
  return parseEV(html);
}

// Extrae el literal `var EV = [ ... ]` por balanceo de corchetes (ignorando
// strings) y lo materializa con new Function. Los globals que el array referencia
// (BANCO_*, HOTEL_*, etc.) se stubbean a `undefined` automáticamente: solo se usan
// como VALORES dentro del literal, nunca para derivar la meta (slug/fechas/tipo).
function parseEV(html) {
  const m = html.match(/var\s+EV\s*=\s*\[/);
  if (!m) throw new Error('var EV no encontrado en index.html');
  const start = m.index + m[0].length - 1;
  let depth = 0, inStr = false, sc = '', esc = false, end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (ch === '\\') { esc = true; continue; } if (ch === sc) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; sc = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (!depth) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('Array EV sin cerrar');
  const arrText = html.slice(start, end);

  // Resolución de stubs: intenta materializar; si truena por un global no definido,
  // lo declara como undefined y reintenta (cota dura de iteraciones).
  const stubs = new Set();
  for (let intento = 0; intento < 60; intento++) {
    const prelude = stubs.size ? 'var ' + [...stubs].map((s) => s + '=undefined').join(',') + ';' : '';
    try {
      const out = new Function(prelude + 'return ' + arrText + ';')();
      if (!Array.isArray(out)) throw new Error('EV no es array');
      return out;
    } catch (e) {
      const mm = /(\w+) is not defined/.exec(e.message || '');
      if (mm && !stubs.has(mm[1])) { stubs.add(mm[1]); continue; }
      throw e;
    }
  }
  throw new Error('demasiados globals sin resolver al parsear EV');
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivación (port de _eventoMetaFila + corrección de fecha_fin multifecha)
// ─────────────────────────────────────────────────────────────────────────────

function _fechaMetaToISO(d) {
  if (typeof d !== 'string' || !d.trim()) return null;
  const s = d.trim().slice(0, 10);
  return FECHA_RE.test(s) ? s : null;
}

function _eventoMetaFila(e) {
  const slug = e.id;
  if (!slug) return null;
  const esFest = !!FESTIVALES[slug];
  const dias = FESTIVALES[slug] || 1;
  const tipo = esFest ? 'festival' : 'concierto';

  // Candidatas ISO directas (igual que el cliente): ds, dsList[], multifecha[].ds.
  const cand = [];
  const push = (x) => { const f = _fechaMetaToISO(x); if (f) cand.push(f); };
  push(e.ds);
  if (Array.isArray(e.dsList)) e.dsList.forEach(push);
  if (Array.isArray(e.multifecha)) e.multifecha.forEach((mf) => mf && push(mf.ds));

  const fecha = _fechaMetaToISO(e.ds)
    || (Array.isArray(e.multifecha) && e.multifecha[0] ? _fechaMetaToISO(e.multifecha[0].ds) : null)
    || (Array.isArray(e.dsList) ? _fechaMetaToISO(e.dsList[0]) : null)
    || (cand.length ? cand.slice().sort()[0] : null);

  let fecha_fin;
  if (esFest && fecha) {
    // Festival: regla por días (idéntica al cliente; no se toca).
    const d = new Date(fecha + 'T12:00:00');
    d.setDate(d.getDate() + (Math.min(dias, 3) - 1));
    fecha_fin = d.toISOString().slice(0, 10);
  } else {
    // Concierto: la ÚLTIMA fecha real. Además de las ISO directas, sumamos las
    // fechas que solo viven como texto en multifecha[].lbl ('7 Agosto') y en `f`
    // ('1, 7 y 8 ago 2026' / '12-13 sep 2026') — eventos como harry/karolg/warped
    // cuyo último día NO está en ds. Solo extendemos hacia adelante y con cota
    // (≤60 días de `fecha`) para no sobre-pasar por ruido.
    if (fecha) {
      const baseYear = fecha.slice(0, 4);
      if (Array.isArray(e.multifecha)) {
        e.multifecha.forEach((mf) => addCand(cand, isoFromLbl(mf && mf.lbl, baseYear), fecha));
      }
      addCand(cand, isoFromF(e.f), fecha);
    }
    fecha_fin = cand.length ? cand.slice().sort().slice(-1)[0] : fecha;
  }

  return { slug, nombre: e.a || slug, fecha, fecha_fin, tipo, dias };
}

// Agrega `iso` a cand solo si es válido, no anterior a `fecha` y dentro de 60 días.
function addCand(cand, iso, fecha) {
  if (!iso || !fecha || iso < fecha) return;
  if (diasEntre(fecha, iso) > 60) return;
  cand.push(iso);
}

// 'DD[, DD y DD | DD-DD] mon YYYY' → ISO del día MÁXIMO (última fecha del evento).
function isoFromF(f) {
  if (typeof f !== 'string') return null;
  const s = f.toLowerCase();
  const ym = s.match(/\b(20\d\d)\b/);
  if (!ym) return null;
  const year = ym[1];
  let month = null;
  for (const k in MES_ABBR) { if (new RegExp('\\b' + k).test(s)) { month = MES_ABBR[k]; break; } }
  if (!month) return null;
  const nums = (s.match(/\b\d{1,2}\b/g) || []).map(Number).filter((n) => n >= 1 && n <= 31);
  if (!nums.length) return null;
  return mkISO(year, month, Math.max.apply(null, nums));
}

// 'DD MesCompleto' (p.ej. '7 Agosto') + año del evento → ISO.
function isoFromLbl(lbl, year) {
  if (typeof lbl !== 'string' || !year) return null;
  const s = lbl.toLowerCase();
  const dm = s.match(/\b(\d{1,2})\b/);
  if (!dm) return null;
  let month = null;
  for (const k in MES_FULL) { if (s.indexOf(k) !== -1) { month = MES_FULL[k]; break; } }
  if (!month) { for (const k in MES_ABBR) { if (s.indexOf(k) !== -1) { month = MES_ABBR[k]; break; } } }
  if (!month) return null;
  return mkISO(year, month, Number(dm[1]));
}

function mkISO(year, month, day) {
  const dd = String(day).padStart(2, '0');
  const iso = `${year}-${month}-${dd}`;
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  // Rechaza días imposibles (p.ej. 31 en un mes de 30).
  if (d.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function diasEntre(isoA, isoB) {
  const a = new Date(isoA + 'T12:00:00').getTime();
  const b = new Date(isoB + 'T12:00:00').getTime();
  return Math.abs(b - a) / 86400000;
}

// ─────────────────────────────────────────────────────────────────────────────

function limpiaFecha(v) {
  return (typeof v === 'string' && FECHA_RE.test(v)) ? v : null;
}

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
