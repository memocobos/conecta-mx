#!/usr/bin/env node
// =============================================================================
// mide-cotiza-vend-1.js — [COTIZA-VEND-1] el cotizador de vendedor
// =============================================================================
// Entra por el HANDLER REAL (`admin-cotizador`) con el index REAL del árbol
// servido por una red falsa, y carea cada número contra su DUEÑO preguntado por
// separado (`_calcularPrecio`, `planDelViaje`). Si el arnés repitiera la cuenta,
// los dos podrían estar igual de equivocados.
//
// ⚠️ SIN ANCLA de commit a propósito (carga del árbol de trabajo, como
// mide:req-b1): mide lo que acabas de escribir y no puede traer control
// positivo por commit. Los controles son por construcción (sabotaje en vm).
// =============================================================================
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const FN = path.join(RAIZ, 'netlify/functions');

let verdes = 0, rojos = 0;
function af(cond, msg) {
  let ok = false, m = msg;
  try { ok = typeof cond === 'function' ? !!cond() : !!cond; } catch (e) { ok = false; m = msg + ' (lanzó: ' + e.message + ')'; }
  if (ok) { verdes++; } else { rojos++; console.log('  ✗ ' + (typeof m === 'function' ? m() : m)); }
}

// ── el mundo falso ─────────────────────────────────────────────────────────
const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const ESCRITURAS = [];
let NUBE_FILAS = [];
global.fetch = async (url, init) => {
  const u = String(url);
  const metodo = (init && init.method) || 'GET';
  if (metodo !== 'GET') ESCRITURAS.push(metodo + ' ' + u);
  if (/\/index\.html$/.test(u)) return { ok: true, status: 200, text: async () => INDEX };
  if (/\/rest\/v1\/nube_cotizaciones/.test(u)) {
    const q = decodeURIComponent(u);
    const modo = (/modo=eq\.(\w+)/.exec(q) || [])[1];
    const ev = (/evento_id=eq\.([^&]+)/.exec(q) || [])[1];
    const general = /evento_id=is\.null/.test(q);
    const filas = NUBE_FILAS.filter((f) => f.modo === modo && (general ? f.evento_id == null : f.evento_id === ev));
    return { ok: true, status: 200, json: async () => filas };
  }
  throw new Error('la red falsa no entiende: ' + u);
};
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k-falsa';
process.env.URL = 'https://conectareynosa.mx';

const vaPath = path.join(FN, '_lib/verify-admin.js');
const va = require(vaPath);
let ROL = 'bulma';
require.cache[vaPath].exports = Object.assign({}, va, {
  verifyAdminAuthLive: async (ev, roles) => roles.includes(ROL) ? { valid: true, user: { rol: ROL } } : { valid: false, status: 403, error: 'sin permiso' },
});
const H = require(path.join(FN, 'admin-cotizador.js')).handler;
const { _calcularPrecio, hoyMx, esCDMX } = require(path.join(FN, '_lib/precio-zona'));
const { planDelViaje, dsDeEvento } = require(path.join(FN, '_lib/plan-pagos'));
const { fetchEventosRaw, fetchHotelesGlobales } = require(path.join(FN, '_lib/catalogo-index'));

async function llamar(body) {
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx' }, body: JSON.stringify(body) });
  let j = {}; try { j = JSON.parse(r.body); } catch (_) {}
  return { code: r.statusCode, j };
}

(async () => {
  const EV = await fetchEventosRaw();
  const HOT = await fetchHotelesGlobales();
  af(Array.isArray(EV) && EV.length > 50, 'el catálogo real del árbol se lee (' + (EV && EV.length) + ' eventos)');

  console.log('[A] permisos y acciones');
  ROL = 'coordinador';
  af((await llamar({ accion: 'eventos' })).code === 403, 'un coordinador NO cotiza (403)');
  ROL = 'bulma';
  af((await llamar({ accion: 'borrar' })).code === 400, 'acción desconocida → 400');
  for (const r of ['maestro_roshi', 'milk']) { ROL = r; af((await llamar({ accion: 'eventos' })).code === 200, r + ' cotiza'); }
  ROL = 'bulma';

  console.log('[B] la lista de eventos');
  const le = await llamar({ accion: 'eventos' });
  const evs = le.j.eventos || [];
  af(le.code === 200 && evs.length > 10, 'lista de eventos vivos (' + evs.length + ')');
  const hoy = hoyMx();
  af(evs.every((e) => e.fechas.every((f) => !f.ds || f.ds >= hoy)), 'ninguna fecha pasada en la lista');
  const multi = evs.find((e) => e.fechas.some((f) => /#\d+$/.test(f.evento_id)));
  af(!!multi, 'un multifecha sale con sus fechas slug#N');

  // Elegir casos preguntándole al catálogo, no tecleándolos.
  console.log('[C] un PLUS de Monterrey, careado contra el dueño');
  let caso = null;
  for (const e of evs) {
    if (e.cdmx) continue;
    for (const f of e.fechas) {
      const o = await llamar({ accion: 'opciones', evento_id: f.evento_id });
      if (o.code !== 200) continue;
      const plus = (o.j.paquetes || []).find((p) => p.paquete === 'plus' && p.zonas && p.zonas.length);
      if (plus && o.j.hoteles.length) { caso = { f, o: o.j, plus }; break; }
    }
    if (caso) break;
  }
  af(!!caso, 'hay un PLUS de Monterrey cotizable');
  if (caso) {
    const zona = caso.plus.zonas[0].zona;
    const hab = caso.o.hoteles.find((h) => !h.viaj || h.viaj.includes(2));
    const c = await llamar({ accion: 'cotizar', evento_id: caso.f.evento_id, paquete: 'plus', zona, hotel: hab && hab.nombre, personas: 2 });
    af(c.code === 200, () => 'cotiza 2 personas PLUS (' + c.code + ' ' + (c.j.error || '') + ')');
    const [slug, ix] = caso.f.evento_id.split('#');
    const ev = EV.find((x) => x.id === slug);
    const dueno = _calcularPrecio(ev, { hoteles: HOT, paquete: 'plus', zona, hotel_nombre: hab && hab.nombre, num_personas: 2, fecha_idx: ix ? Number(ix) : 0, hoyISO: hoy });
    af(c.j.cotizacion && c.j.cotizacion.total === dueno.total && c.j.cotizacion.separo === dueno.separo,
      () => 'total y separo = los del dueño (' + (c.j.cotizacion || {}).total + ' vs ' + dueno.total + ')');
    const planD = planDelViaje({ total: dueno.total, abonado: dueno.separo, ds: dsDeEvento(ev, caso.f.evento_id), paquete: 'plus' });
    af(JSON.stringify(c.j.plan) === JSON.stringify(planD), 'el rol = planDelViaje con el separo como abonado (byte a byte)');
    af(c.j.cotizacion && c.j.cotizacion.transporte === null, 'Monterrey no lleva transporte de la Nube');
    // el precio del cuerpo se ignora
    const tramp = await llamar({ accion: 'cotizar', evento_id: caso.f.evento_id, paquete: 'plus', zona, hotel: hab && hab.nombre, personas: 2, total: 1 });
    af(tramp.j.cotizacion && tramp.j.cotizacion.total === dueno.total, 'un total en el cuerpo se IGNORA');
    const sinHab = await llamar({ accion: 'cotizar', evento_id: caso.f.evento_id, paquete: 'plus', zona, personas: 2 });
    af(sinHab.code === 400, 'PLUS sin habitación → 400');
    const zonaMala = await llamar({ accion: 'cotizar', evento_id: caso.f.evento_id, paquete: 'plus', zona: 'Zona Inventada 99', hotel: hab && hab.nombre, personas: 2 });
    af(zonaMala.code === 409, 'zona inventada → 409');
  }

  console.log('[D] CDMX con la Nube');
  const cd = evs.find((e) => e.cdmx && e.fechas.length);
  af(!!cd, 'hay un evento de CDMX en la lista');
  if (cd) {
    const f = cd.fechas[0];
    const o0 = await llamar({ accion: 'opciones', evento_id: f.evento_id });
    const p = (o0.j.paquetes || []).find((x) => x.paquete === 'plus' && x.zonas && x.zonas.length) || (o0.j.paquetes || []).find((x) => x.paquete === 'ride');
    af(!!p, 'el CDMX ofrece PLUS o RIDE');
    if (p) {
      const base = { accion: 'cotizar', evento_id: f.evento_id, paquete: p.paquete, zona: p.zonas ? p.zonas[0].zona : undefined, hotel: (o0.j.hoteles[0] || {}).nombre, personas: 1 };
      NUBE_FILAS = [];
      const sinNube = await llamar(Object.assign({ transporte: 'bus' }, base));
      af(sinNube.code === 409, 'sin Nube vigente, «autobús» → 409 (no se inventa)');
      af((await llamar(base)).code === 400, 'CDMX sin elegir transporte → 400');
      const ahora = Date.now();
      NUBE_FILAS = [{ id: 'g1', modo: 'bus', evento_id: null, precio_pp: 2500, vigente_desde: new Date(ahora - 864e5).toISOString(), vigente_hasta: new Date(ahora + 6 * 864e5).toISOString(), horarios: null, creado_en: new Date(ahora).toISOString() }];
      const conNube = await llamar(Object.assign({ transporte: 'bus' }, base));
      af(conNube.code === 200 && conNube.j.cotizacion.transporte.precio === 2500, 'la Nube general pone $2,500 de autobús');
      af(conNube.j.cotizacion && /general/.test(conNube.j.cotizacion.transporte.fuente), 'la tarifa heredada se ROTULA «general»');
      const [slug, ix] = f.evento_id.split('#');
      const ev = EV.find((x) => x.id === slug);
      const dueno = _calcularPrecio(ev, { hoteles: HOT, paquete: p.paquete, zona: base.zona, hotel_nombre: base.hotel, num_personas: 1, transporte_cost: 2500, fecha_idx: ix ? Number(ix) : 0, hoyISO: hoy });
      af(conNube.j.cotizacion && conNube.j.cotizacion.total === dueno.total, () => 'el total CDMX = el del dueño con el transporte (' + (conNube.j.cotizacion || {}).total + ' vs ' + dueno.total + ')');
      NUBE_FILAS.push({ id: 'e1', modo: 'bus', evento_id: slug, precio_pp: 2300, vigente_desde: new Date(ahora - 864e5).toISOString(), vigente_hasta: new Date(ahora + 6 * 864e5).toISOString(), horarios: 'Sale 6am', creado_en: new Date(ahora - 5e6).toISOString() });
      const propia = await llamar(Object.assign({ transporte: 'bus' }, base));
      af(propia.j.cotizacion && propia.j.cotizacion.transporte.precio === 2300, 'la cotización DEL evento le gana a la general');
      const man = await llamar(Object.assign({ transporte: 'manual', transporte_monto: 4100 }, base));
      af(man.code === 200 && man.j.cotizacion.transporte.precio === 4100 && /tecleado/.test(man.j.cotizacion.transporte.fuente), 'monto manual entra rotulado');
      af((await llamar(Object.assign({ transporte: 'manual', transporte_monto: -5 }, base))).code === 400, 'monto manual negativo → 400');
    }
  }

  console.log('[E] multifecha');
  if (multi) {
    af((await llamar({ accion: 'opciones', evento_id: multi.id })).code === 400, 'multifecha sin #N → 400 «elige la fecha»');
    const f = multi.fechas[0];
    const o = await llamar({ accion: 'opciones', evento_id: f.evento_id });
    af(o.code === 200 || o.code === 409, 'multifecha con #N contesta opciones (' + o.code + ')');
  }

  console.log('[F] cero escrituras · y el Portal sigue igual');
  af(ESCRITURAS.length === 0, () => 'el cotizador no escribió nada (' + ESCRITURAS.join(', ') + ')');
  const { _opciones } = require(path.join(FN, '_lib/opciones-paquete'));
  const mfEv = EV.find((x) => Array.isArray(x.multifecha) && x.multifecha.length);
  af(mfEv && _opciones(mfEv, HOT).ok === false, 'sin fecha, _opciones sigue rebotando el multifecha (el Portal no cambia)');

  console.log('[G] la pantalla');
  const js = fs.readFileSync(path.join(RAIZ, 'kamehouse-cotizador.js'), 'utf8');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  af(/id="page-cotizador"/.test(html) && /kamehouse-cotizador\.js/.test(html), 'la página y su script existen');
  af(/showHerramienta\('cotizador'\)/.test(html), 'el botón abre la herramienta');
  af(/name === 'cotizador'/.test(kh), 'showHerramienta carga el cotizador');
  ['maestro_roshi', 'bulma', 'milk'].forEach((r) => af(new RegExp(r + ':\\s*\\[[^\\]]*\'cotizador\'').test(kh), r + ' tiene el permiso'));
  const sinCom = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  af(!/precio_unit\s*\*|\.p\s*\*|zonaP|sepCheap|STAY_DESCUENTO/.test(sinCom), 'la pantalla no calcula precios (pinta lo que manda el servidor)');
  af(/toBlob|toDataURL/.test(js), 'la pantalla descarga el PNG');

  console.log(`\n${rojos ? '🔴' : '✅'} mide:cotiza-vend-1 · ${verdes} en verde · ${rojos} en rojo`);
  if (!verdes) console.log('NADA MEDIDO · esto NO es un verde');
  process.exit(rojos || !verdes ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(2); });
