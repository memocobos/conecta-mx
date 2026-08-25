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

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { revisarSepCheap } = require('./_lib/separo-techo');
const { _parseZonas: parseZonas, _parseCheapZonas: parseCheapZonas,
  _parseMultifecha: parseMultifecha, fechaAbsurda, bancoValido } = require('./_lib/esferas-compile');
// [ESF-E1e] Las banderas de paquete, en un Set para que el saneador no las
// enumere a mano en dos archivos.
const PKG_FLAGS = new Set(['ride_only', 'cheap_only', 'no_stay', 'no_cheap', 'no_bus', 'cheap_soon', 'cheap_also_ok']);
// El servidor NO confía en que el navegador haya respetado la excluyencia: si
// llegan las dos, manda `rideOnly` — la misma regla que el compilador, dicha en
// los dos lados porque son dos puertas distintas a la misma tabla.
function _sanePkg(sane) {
  if (sane.ride_only) sane.cheap_only = false;
  if (!sane.ride_only) sane.cheap_also_ok = false;
  return sane;
}

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

// Whitelist EDITABLE. slug AUSENTE a propósito (identidad / PK, no se edita).
const CAMPOS_EDITABLES = new Set(['nombre', 'titulo', 'fecha_inicio', 'ciudad', 'tipo', 'status', 'venue', 'music', 'fechas_extra', 'zonas', 'hotel', 'mapa', 'inc', 'sep', 'sep_cheap', 'nota', 'festival', 'foto',
  // [ESF-E1a] el precio del paquete RIDE y su separo
  'ride', 'sep_ride',
  // [ESF-E1c] la lista CHEAP, independiente de las zonas PLUS
  'cheap_zonas',
  // [ESF-E1f] las fechas con sus zonas (nivel 4 de la granularidad)
  'multifecha',
  'banco',   // [ESF-E1g] identificador del banco; lista CERRADA (ver abajo).
  // [ESF-CAMPOS-1] Tres campos chicos que bloqueaban a 13 eventos vivos.
  'promo', 'promo_code', 'promo_label', 'deporte', 'music_search',
  // [ESF-E1e] las banderas de paquete (nivel 3 de la granularidad)
  'ride_only', 'cheap_only', 'no_stay', 'no_cheap', 'no_bus', 'cheap_soon', 'cheap_also_ok']);

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

// zonas (B1): JSON array de objetos {n,p,pc?,ag?,prox?}. Acepta array o string
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
    // [E1] PRÓXIMAMENTE. Sin esta línea el campo moría AQUÍ: saneZonas
    // reconstruye la fila campo por campo, así que lo que no se nombra se
    // pierde en silencio entre el editor y la base.
    // Excluyente con ag, y prox manda (una zona sin precio anunciada como
    // "agotada" le miente al cliente sobre algo que nunca estuvo a la venta).
    const prox = (z.prox === 1 || z.prox === true || z.prox === '1') ? 1 : 0;
    if (prox) row.prox = 1;
    else if (z.ag === 1 || z.ag === true || z.ag === '1') row.ag = 1;
    // [ESF-E1b] VIP, por la MISMA razón que dice el comentario de arriba:
    // `saneZonas` reconstruye la fila campo por campo, así que lo que no se
    // nombra aquí muere en silencio entre el editor y la base. Es independiente
    // de `ag` y de `prox`: una zona preferente lo sigue siendo aunque se acabe.
    if (z.vip === 1 || z.vip === true || z.vip === '1') row.vip = 1;
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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
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
    if (k === 'sep' || k === 'sep_cheap' || k === 'sep_ride') { sane[k] = saneInt(v); continue; }
    // [ESF-E1a] `ride` pasa por el MISMO saneador: entero >= 0 o null. Un
    // precio que llega como texto no se guarda "a ver qué pasa".
    if (k === 'ride') { sane[k] = saneInt(v); continue; }
    // [ESF-E1c] La lista CHEAP se sanea con el MISMO parser que la compila
    // (`_parseCheapZonas` del lib): un segundo saneador aquí sería la copia que
    // acaba divergiendo. `null` significa "no capturada" y se guarda como null.
    // [ESF-E1e] Las banderas son BOOLEANAS y se guardan como tales: nada de
    // 'true' en texto, que Postgres aceptaría y el compilador leería como
    // verdadero para siempre aunque después llegara 'false'.
    if (PKG_FLAGS.has(k)) { sane[k] = (v === true || v === 1 || v === 'true' || v === '1'); continue; }
    // [ESF-E1f] La multifecha se sanea con el MISMO parser que la compila.
    // `null` = el evento no tiene fechas propias.
    // [ESF-E1g] El banco sale al index como IDENTIFICADOR CRUDO
    // (`banco:BANCO_HEY`), no entre comillas: cualquier cosa fuera de la lista
    // conocida sería CÓDIGO inyectado en el catálogo público. Validar la forma
    // no basta — la lista es cerrada.
    if (k === 'banco') { sane[k] = bancoValido(v); continue; }
    // promo/deporte son BANDERAS: se guardan como booleano, no como el literal
    // del catálogo. El compilador se encarga de emitir `promo:true` y
    // `deporte:1` — cada uno con el suyo, que es como viven en el EV.
    if (k === 'promo' || k === 'deporte') { sane[k] = (v === true || v === 1 || v === '1' || v === 'true'); continue; }
    // musicSearch es el texto con el que se busca la música cuando el nombre
    // del evento no da con ella. Se recorta: es una consulta, no un ensayo.
    // [ESF-PROMO-PAR] El código y la etiqueta del badge. Se recortan: los
    // reales miden 9 y 53 caracteres, y un tope generoso evita que un pegado
    // accidental acabe impreso sobre la tarjeta del evento.
    if (k === 'promo_code') { sane[k] = (typeof v === 'string' && v.trim()) ? v.trim().slice(0, 40) : null; continue; }
    if (k === 'promo_label') { sane[k] = (typeof v === 'string' && v.trim()) ? v.trim().slice(0, 160) : null; continue; }
    if (k === 'music_search') { sane[k] = (typeof v === 'string' && v.trim()) ? v.trim().slice(0, 120) : null; continue; }
    if (k === 'multifecha') {
      const filas = parseMultifecha(v);
      sane[k] = (filas == null) ? null : JSON.stringify(filas);
      continue;
    }
    if (k === 'cheap_zonas') {
      const filas = parseCheapZonas(v);
      sane[k] = (filas == null) ? null : JSON.stringify(filas);
      continue;
    }
    if (k === 'nota') { sane[k] = saneNota(v); continue; }
    if (k === 'festival') { sane[k] = saneFestival(v); continue; }
    if (v === null || v === '') sane[k] = (k === 'status') ? '' : null;
    else sane[k] = String(v);
  }

  // [ESF-E1e] La excluyencia se aplica DESPUÉS del bucle, sobre el objeto ya
  // saneado: dentro no se puede, porque `ride_only` y `cheap_only` pueden
  // llegar en cualquier orden y el que llegara segundo ganaría.
  _sanePkg(sane);

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
    // [COT-FIX-1] Se piden también `zonas` y `sep_cheap` en el MISMO select que
    // ya se hacía — sin consulta extra. Hacen falta porque esto es un PATCH:
    // editar SOLO el separo (que es justo como nació el dedazo de yandel) no
    // manda las zonas en el body, y sin la fila guardada el techo no tendría
    // contra qué comparar y dejaría pasar el dato imposible.
    const chkRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&select=slug,zonas,sep_cheap`, {
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

    // [COT-FIX-1] El techo del separo CHEAP, sobre el estado RESULTANTE: lo que
    // trae el patch si viene, y lo guardado si no. Así se cubren los tres
    // caminos — cambiar solo el separo, cambiar solo las zonas (que puede
    // volver imposible un separo que ya estaba bien) y cambiar los dos.
    // 422 y no 400: el formato está bien; lo que no puede existir es el hecho.
    const _fila = existentes[0] || {};
    const _sepFinal   = ('sep_cheap' in sane) ? sane.sep_cheap : _fila.sep_cheap;
    const _zonasFinal = ('zonas' in sane) ? sane.zonas : _fila.zonas;
    const _techo = revisarSepCheap(_sepFinal, parseZonas(_zonasFinal));
    if (_techo) return { statusCode: 422, headers, body: JSON.stringify(_techo) };

    // [ESF-FECHA] LA FECHA IMPOSIBLE, misma familia que el techo de arriba: el
    // formato está bien, lo que no puede existir es el hecho. Memo capturó
    // `0026-08-18` (dedazo de 2026) y el evento desapareció del sitio por
    // "pasado hace dos mil años", sin un solo error.
    //
    // Se miran la fecha principal Y las extra: una fecha absurda escondida en
    // las adicionales rompe el display y el orden igual de bien.
    const _fechas = [['fecha_inicio', 'La fecha del evento']];
    let _errFecha = null;
    for (const [k, etiqueta] of _fechas) {
      if (k in sane) { _errFecha = fechaAbsurda(sane[k], etiqueta); if (_errFecha) break; }
    }
    if (!_errFecha && 'fechas_extra' in sane && sane.fechas_extra) {
      let _ex = [];
      try { _ex = JSON.parse(sane.fechas_extra) || []; } catch (_) { _ex = []; }
      for (const d of _ex) { _errFecha = fechaAbsurda(d, 'Una de las fechas adicionales'); if (_errFecha) break; }
    }
    if (_errFecha) return { statusCode: 422, headers, body: JSON.stringify({ ok: false, error: _errFecha }) };

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
