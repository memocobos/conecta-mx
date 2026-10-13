// =============================================================================
// _lib/genkidama — GENKIDAMA-1 (13-oct-2026). El dueño de tres preguntas:
//   1. ¿Cuánta ENERGÍA queda hoy? (correos masivos enviados hoy en Reynosa vs
//      el límite diario que fija Memo). Cuenta Genkidama Y el blast de PN27:
//      el dominio es uno solo y Resend/Gmail no distinguen herramientas.
//   2. ¿El SITIO honra lo que el correo promete? (ley CONSUELO-VERDAD: se lee
//      el index SERVIDO — evento a la venta, código vivo AHORA y válido para
//      ese evento, y el slogan no promete un monto distinto al del código).
//   3. ¿Cómo se ve cada uno de los 4 correos? (Promoción · Descuento · Código ·
//      Últimos lugares). Todo derivado del catálogo; lo único tecleado es el
//      slogan de Memo.
// =============================================================================
const { _parseEV } = require('./catalogo-index');
const { evaluarPROMOS } = require('./promos-compile');

const TZ = 'America/Matamoros';
const SITE = (process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://conectareynosa.mx').replace(/\/$/, '');
const LINK_BASE = 'https://www.conectareynosa.mx/';
const ST_NO_VENDIBLE = ['agotado', 'por-confirmar', 'proceso', 'proximamente', 'pronto'];
const TIPOS = {
  promocion: { etiqueta: 'Promoción', pideCodigo: false },
  descuento: { etiqueta: 'Descuento', pideCodigo: true },
  codigo:    { etiqueta: 'Código', pideCodigo: true },
  ultimos:   { etiqueta: 'Últimos lugares', pideCodigo: false },
};

function baseSlug(id) { return String(id || '').split('#')[0]; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ── La fecha de HOY en Reynosa y el instante en que empezó (jamás toISOString) ──
function _partes(d) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return p;
}
function hoyReynosa(ahora) {
  const p = _partes(ahora || new Date());
  return `${p.year}-${p.month}-${p.day}`;
}
function inicioDiaReynosa(ahora) {
  const now = ahora || new Date();
  const p = _partes(now);
  // desfase = pared − UTC; el inicio del día es la medianoche de pared menos ese desfase
  const pared = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const desfase = pared - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - desfase).toISOString();
}

// ── 1 · LA ENERGÍA ────────────────────────────────────────────────────────────
async function _contar(url, h) {
  const r = await fetch(url, { headers: { ...h, Prefer: 'count=exact', Range: '0-0' } });
  if (!r.ok) throw new Error('no pude contar: ' + (await r.text()).slice(0, 120));
  return Number(String(r.headers.get('content-range') || '/0').split('/')[1] || 0);
}
async function energia({ KH_URL, KH_KEY, ahora }) {
  const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  const desde = encodeURIComponent(inicioDiaReynosa(ahora));
  const rc = await fetch(`${KH_URL}/rest/v1/genkidama_config?id=eq.1&select=limite_diario`, { headers: h });
  if (!rc.ok) throw new Error('no pude leer el límite diario (genkidama_config)');
  const limite = Number(((await rc.json())[0] || {}).limite_diario);
  if (!Number.isFinite(limite)) throw new Error('genkidama_config sin fila: ver migraciones/GENKIDAMA-1.sql');
  const g = await _contar(`${KH_URL}/rest/v1/genkidama_envios?select=id&enviado_at=gte.${desde}`, h);
  let b = 0;
  try { b = await _contar(`${KH_URL}/rest/v1/preventa_blast?select=id&enviado_at=gte.${desde}`, h); } catch (_) { b = 0; }
  const enviados = g + b;
  return { limite, enviados_hoy: enviados, genkidama_hoy: g, blast_hoy: b, restante: Math.max(0, limite - enviados), dia: hoyReynosa(ahora) };
}

// ── 2 · EL SITIO SERVIDO ─────────────────────────────────────────────────────
async function leerSitio() {
  const r = await fetch(SITE + '/index.html', { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('el sitio contestó ' + r.status + ' al pedir index.html');
  const html = await r.text();
  const EV = _parseEV(html);
  const PROMOS = evaluarPROMOS(html);
  if (!Array.isArray(EV)) throw new Error('no pude leer el catálogo (var EV) del sitio');
  if (!PROMOS) throw new Error('no pude leer var PROMOS del sitio');
  return { EV, PROMOS };
}

function _fechaDe(ev, idx) {
  const mf = Array.isArray(ev.multifecha) && idx != null ? ev.multifecha[idx] : null;
  return { etiqueta: mf ? (mf.lbl || mf.sublbl || ev.f) : (ev.f || ''), ds: (mf && mf.ds) || ev.ds || null };
}
function eventoVendible(ev, idx, ahora) {
  if (!ev) return 'el evento no está en el catálogo del sitio';
  if (ev._past) return 'el evento ya pasó';
  if (ST_NO_VENDIBLE.includes(ev.st)) return `el evento está en «${ev.st}» en el sitio: no se puede promover lo que no se vende`;
  if (Array.isArray(ev.multifecha) && idx != null && !ev.multifecha[idx]) return 'esa fecha no existe en el evento';
  const { ds } = _fechaDe(ev, idx);
  if (ds && ds < hoyReynosa(ahora)) return 'esa fecha ya pasó';
  return null;
}
// Eventos que el wizard ofrece: a la venta HOY, por fecha.
function eventosParaWizard(EV, ahora) {
  return EV.filter((e) => e && e.id && !eventoVendible(e, null, ahora))
    .sort((a, b) => String(a.ds || '9').localeCompare(String(b.ds || '9')))
    .map((e) => ({ id: e.id, a: e.a, f: e.f, v: e.v, fechas: Array.isArray(e.multifecha) ? e.multifecha.map((m, i) => ({ idx: i, lbl: m.lbl || m.sublbl, vendible: !eventoVendible(e, i, ahora) })) : [] }));
}

function _codigoAplica(p, evId) {
  const b = baseSlug(evId);
  if (p.onlyEvent) return baseSlug(p.onlyEvent) === b;
  if (Array.isArray(p.onlyEvents)) return p.onlyEvents.map(baseSlug).includes(b);
  return true;
}
function _montoCodigo(p) { return p.amount ? '$' + Number(p.amount).toLocaleString('es-MX') : (p.pct ? p.pct + '%' : null); }
// «Válido hasta el sábado 31 de octubre» — con el año si no es el actual (un
// «domingo 17 de octubre» que en realidad es de 2027 se lee como esta semana),
// y la hora solo si no es el final o el inicio del día (23:59 / 00:00).
function _vigencia(ms, ahora) {
  if (!ms) return null;
  const d = new Date(ms);
  const p = _partes(d), hoy = _partes(ahora || new Date());
  const opc = { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' };
  if (p.year !== hoy.year) opc.year = 'numeric';
  let s = 'Válido hasta el ' + new Intl.DateTimeFormat('es-MX', opc).format(d).replace(',', '');
  const hm = p.hour + ':' + p.minute;
  if (hm !== '23:59' && hm !== '00:00') { const h = Number(p.hour); s += ` a las ${((h + 11) % 12) + 1}:${p.minute} ${h < 12 ? 'AM' : 'PM'}`; }
  return s;
}
// Códigos vivos AHORA en el sitio, con a qué eventos aplican.
function promosVivas(PROMOS, ahora) {
  const t = (ahora || new Date()).getTime();
  return Object.keys(PROMOS).filter((k) => {
    const p = PROMOS[k];
    return p && !(p.startTs && t < p.startTs) && !(p.expiresTs && t > p.expiresTs) && !(p.maxUsos && p.usos >= p.maxUsos);
  }).map((k) => {
    const p = PROMOS[k];
    return { codigo: k, desc: p.desc || '', monto: _montoCodigo(p), eventos: p.onlyEvent ? [p.onlyEvent] : (p.onlyEvents || null), excludePkg: p.excludePkg || [], vence: p.expiresTs || null };
  });
}

// Valida una campaña contra el sitio. Devuelve { ok, ev, fecha, promo, avisos } | { ok:false, error }.
function validarCampana(sitio, c, ahora) {
  const tipo = String(c.tipo || '');
  if (!TIPOS[tipo]) return { ok: false, error: 'tipo de correo inválido' };
  const slogan = String(c.slogan || '').trim();
  if (slogan.length < 3 || slogan.length > 140) return { ok: false, error: 'el slogan va de 3 a 140 caracteres' };
  const ev = sitio.EV.find((e) => e && e.id === String(c.evento_id || ''));
  const idx = c.fecha_idx === '' || c.fecha_idx == null ? null : Number(c.fecha_idx);
  const malo = eventoVendible(ev, idx, ahora);
  if (malo) return { ok: false, error: malo };
  const codigo = String(c.codigo || '').trim().toUpperCase();
  if (TIPOS[tipo].pideCodigo && !codigo) return { ok: false, error: `el correo de «${TIPOS[tipo].etiqueta}» necesita un código` };
  let promo = null;
  if (codigo) {
    const p = sitio.PROMOS[codigo];
    const baba = ' — publícalo desde Baba y vuelve a intentar';
    if (!p) return { ok: false, error: `el sitio no conoce el código ${codigo}` + baba };
    const t = (ahora || new Date()).getTime();
    if (p.startTs && t < p.startTs) return { ok: false, error: `el sitio dice que ${codigo} todavía no empieza` + baba };
    if (p.expiresTs && t > p.expiresTs) return { ok: false, error: `el sitio dice que ${codigo} ya venció` + baba };
    if (!_codigoAplica(p, ev.id)) return { ok: false, error: `${codigo} no aplica en ${ev.a} en el sitio: el cliente lo vería rechazado` };
    promo = { codigo, monto: _montoCodigo(p), vence: p.expiresTs || null, excludePkg: (p.excludePkg || []).map((x) => String(x).toUpperCase()) };
    // 🔒 El slogan no puede prometer otro monto que el del código.
    const enSlogan = slogan.match(/\$\s?[\d,]+|\d+\s?%/g) || [];
    const montoCod = promo.monto ? promo.monto.replace(/[\s,]/g, '') : '';
    const distinto = enSlogan.map((m) => m.replace(/[\s,]/g, '')).find((m) => m !== montoCod);
    if (distinto) return { ok: false, error: `el slogan promete ${distinto} pero el código ${codigo} da ${promo.monto} en el sitio` };
  }
  return { ok: true, tipo, slogan, ev, idx, fecha: _fechaDe(ev, idx), promo };
}

// ── 3 · LOS CUATRO CORREOS ───────────────────────────────────────────────────
function asuntoDe(v) {
  const n = v.ev.a;
  if (v.tipo === 'promocion') return `${v.slogan} · ${n}`;
  if (v.tipo === 'descuento') return `💸 ${v.slogan} — ${n}`;
  if (v.tipo === 'codigo') return `🎟️ Tu código ${v.promo.codigo} para ${n}`;
  return `⏳ Últimos lugares para ${n}`;
}
function renderGenkidama(v, nombre) {
  const hola = nombre ? `¡Hola ${esc(String(nombre).trim().split(/\s+/)[0])}!` : '¡Hola!';
  const link = LINK_BASE + baseSlug(v.ev.id);
  const eyebrow = { promocion: 'Promoción', descuento: 'Descuento', codigo: 'Código exclusivo', ultimos: 'Últimos lugares' }[v.tipo];
  const titulo = v.tipo === 'ultimos' ? 'Quedan los últimos lugares' : (v.tipo === 'codigo' ? 'Tienes un código para ti' : v.slogan);
  const cta = { promocion: 'Ver paquetes →', descuento: 'Aprovechar mi descuento →', codigo: 'Usar mi código →', ultimos: 'Apartar mi lugar →' }[v.tipo];
  const detalle = [v.fecha.etiqueta, v.ev.v].filter(Boolean).map(esc).join(' · ');
  const sub = (v.tipo === 'ultimos' || v.tipo === 'codigo') ? `<p style="margin:0 0 16px;font-size:16px;color:#ffffff;font-weight:700">${esc(v.slogan)}</p>` : '';
  let caja = '';
  if (v.promo) {
    const vig = _vigencia(v.promo.vence);
    const fuera = v.promo.excludePkg.length ? `No aplica en paquete ${v.promo.excludePkg.join(', ')}.` : '';
    caja = `<div style="margin:0 0 18px;padding:16px;border:2px dashed #e8ff4c;border-radius:12px;text-align:center">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b3b3b3;margin-bottom:6px">Tu código</div>
        <div style="font-size:30px;font-weight:900;letter-spacing:.08em;color:#e8ff4c">${esc(v.promo.codigo)}</div>
        ${v.promo.monto ? `<div style="font-size:14px;color:#ffffff;margin-top:6px">${esc(v.promo.monto)} de descuento al reservar</div>` : ''}
        ${vig || fuera ? `<div style="font-size:12px;color:#b3b3b3;margin-top:6px">${esc([vig, fuera].filter(Boolean).join(' · '))}</div>` : ''}
      </div>`;
  }
  return `
  <div style="background:#000000;padding:24px 14px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:540px;margin:0 auto;background:#0d0d0d;border:1px solid #222222;border-radius:14px;overflow:hidden">
      <div style="background:#e8ff4c;color:#000000;padding:16px 22px;border-bottom:4px solid #ff283b">
        <div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">Conecta Reynosa · ${esc(eyebrow)}</div>
        <div style="font-size:22px;font-weight:900;margin-top:4px;line-height:1.2">${esc(v.ev.a)}</div>
      </div>
      <div style="padding:22px">
        ${detalle ? `<p style="margin:0 0 14px;font-size:13px;color:#e8ff4c;font-weight:700">${detalle}</p>` : ''}
        <p style="margin:0 0 8px;font-size:14px;color:#d9d9d9">${hola}</p>
        <p style="margin:0 0 14px;font-size:22px;color:#ffffff;font-weight:900;line-height:1.25">${esc(titulo)}</p>
        ${sub}
        ${caja}
        <a href="${link}" style="display:block;text-align:center;background:#e8ff4c;color:#000000;font-weight:900;font-size:15px;letter-spacing:.04em;text-transform:uppercase;padding:14px;border-radius:10px;text-decoration:none;margin-bottom:8px">${cta}</a>
        <div style="text-align:center;font-size:12px;color:#8c8c8c;margin-bottom:16px">${link.replace('https://', '')}</div>
        <div style="font-size:13px;color:#d9d9d9;text-align:center;margin-bottom:14px">¡Ya te la sabes! <b>#ViajaConExpertos</b></div>
        <div style="border-top:1px solid #222222;padding-top:12px;font-size:11px;color:#8c8c8c;line-height:1.5">
          Recibes este correo porque has viajado con Conecta Reynosa o te registraste en nuestras dinámicas.
          ¿No quieres recibir promociones? Responde <b>BAJA</b> a este correo y te quitamos de la lista.
        </div>
      </div>
    </div>
  </div>`;
}

module.exports = {
  TIPOS, TZ, energia, inicioDiaReynosa, hoyReynosa, leerSitio, validarCampana, eventosParaWizard,
  promosVivas, asuntoDe, renderGenkidama, baseSlug, eventoVendible,
};
