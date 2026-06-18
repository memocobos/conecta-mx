// =============================================================================
// scripts/seed-venues-catalogo.js — SEED one-shot de `venues_catalogo` (KH legacy)
// a partir del array EV de index.html. Script LOCAL de un solo uso. NO se
// despliega (Netlify solo publica netlify/functions/ + estáticos).
//
// ⚠️ ONE-SHOT PRE-EDICIÓN: sobrescribe las zonas de cada venue con el set
//   computado del EV. Si lo corres DESPUÉS de curar la libreta a mano (agregar/
//   borrar zonas desde la UI), REVIERTE cada venue a su set del EV. Córrelo UNA
//   sola vez, antes de empezar a curar.
//
// Qué hace:
//   1. Lee index.html de DISCO (no lo reescribe) y extrae EV con la técnica de
//      rol.html (new Function + window stub) — evita evaluar precios/hoteles mal.
//   2. Toma SOLO venue (string) + nombres de zona (z.n trim) de
//      zonas/cheapZonas/multifecha[].zonas/cheapZonas. NUNCA precios.
//   3. Fusiona variantes del MISMO venue por clave conservadora
//      (lowercase + sin acentos + sin comas/puntos + espacios colapsados).
//      Nombre oficial = variante más usada → si empata, la más acentuada
//      (ortografía correcta) → si sigue empate, alfabética.
//   4. Upsert de cada venue vía la acción `guardar` de admin-venues-catalogo
//      (Origin permitido + Bearer maestro_roshi). Idempotente (upsert por venue).
//
// Uso (Node 18+, que trae fetch global):
//   MAESTRO_TOKEN=<jwt_maestro_roshi> node scripts/seed-venues-catalogo.js --dry-run
//   MAESTRO_TOKEN=<jwt_maestro_roshi> node scripts/seed-venues-catalogo.js
// Opcionales:
//   --url   https://deploy-preview-NN--conectareynosa.netlify.app  (default: prod)
//   --index ./index.html                                           (default: ../index.html)
// =============================================================================

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function argVal(flag, def) { const i = args.indexOf(flag); return (i >= 0 && args[i + 1]) ? args[i + 1] : def; }

const DRY = args.includes('--dry-run');
const BASE_URL = argVal('--url', 'https://conectareynosa.mx').replace(/\/$/, '');
const INDEX_PATH = argVal('--index', path.join(__dirname, '..', 'index.html'));
const ORIGIN = 'https://conectareynosa.mx';            // debe estar en ALLOWED_ORIGINS del backend
const FN_URL = BASE_URL + '/.netlify/functions/admin-venues-catalogo';
const TOKEN = process.env.MAESTRO_TOKEN || '';

// Extrae el array EV evaluando el bloque de constantes de index.html con un
// window stub (mismo patrón que rol.html loadEV()).
function extractEV(html) {
  const startIdx = html.indexOf("var WA='");
  let endIdx = html.indexOf('var _promoActivo');
  if (endIdx < 0) endIdx = html.indexOf('function $$(');
  if (startIdx < 0 || endIdx < 0) throw new Error('Bloque EV no localizado en index.html');
  const block = html.slice(startIdx, endIdx);
  const _noop = function () {};
  const winStub = {
    STATIC_IMGS: {}, MAPAS: {}, LINEUPS: {},
    addEventListener: _noop, removeEventListener: _noop,
    matchMedia: function () { return { matches: false, addEventListener: _noop, removeEventListener: _noop }; },
    location: { pathname: '/', search: '', hash: '' }, history: { state: null, pushState: _noop, replaceState: _noop },
  };
  const fn = new Function('window', block + '\nreturn {EV:EV};');
  return fn(winStub).EV;
}

// Nombres de zona de un evento (todas las fuentes). SOLO nombres, nunca precios.
function zonaNames(ev) {
  const out = [];
  const push = (arr) => { if (Array.isArray(arr)) arr.forEach((z) => { if (z && typeof z.n === 'string' && z.n.trim()) out.push(z.n.trim()); }); };
  push(ev.zonas); push(ev.cheapZonas);
  if (Array.isArray(ev.multifecha)) ev.multifecha.forEach((mf) => { push(mf.zonas); push(mf.cheapZonas); });
  return out;
}

const normKey = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
// Cuenta marcas combinantes sobre la forma NFD (é precompuesto = 1 char, por eso
// hay que comparar NFD-length, no la longitud original). Más acentos → "más correcto".
const diacritics = (s) => { const d = (s || '').normalize('NFD'); return d.length - d.replace(/[̀-ͯ]/g, '').length; };

// Agrupa EV por venue normalizado y devuelve [{venue, zonas, variants}].
function build(EV) {
  const groups = {};
  EV.forEach((ev) => {
    const v = (ev.v || '').trim(); if (!v) return;
    const k = normKey(v); if (!k) return;
    const g = (groups[k] = groups[k] || { variants: {}, zonas: [], _seen: new Set() });
    g.variants[v] = (g.variants[v] || 0) + 1;
    zonaNames(ev).forEach((n) => { const low = n.toLowerCase(); if (!g._seen.has(low)) { g._seen.add(low); g.zonas.push(n); } });
  });
  return Object.values(groups).map((g) => {
    // oficial: más usada → más acentuada → alfabética
    const oficial = Object.entries(g.variants).sort((a, b) =>
      (b[1] - a[1]) || (diacritics(b[0]) - diacritics(a[0])) || a[0].localeCompare(b[0])
    )[0][0];
    return { venue: oficial, zonas: g.zonas, variants: g.variants };
  }).sort((a, b) => a.venue.localeCompare(b.venue));
}

// Llama a la acción `guardar`. Devuelve {ok} o {ok:false, error} (sin throw).
async function guardar(venue, zonas) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN, 'Authorization': 'Bearer ' + TOKEN },
    body: JSON.stringify({ accion: 'guardar', venue, zonas }),
  }).catch((e) => ({ _neterr: e.message }));
  if (res._neterr) return { ok: false, error: 'red: ' + res._neterr };
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) return { ok: false, error: 'HTTP ' + res.status + ' ' + (j.error || '') };
  return { ok: true };
}

async function main() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const EV = extractEV(html);
  const venues = build(EV);
  const merges = venues.filter((v) => Object.keys(v.variants).length > 1);
  console.log(`EV: ${EV.length} eventos → ${venues.length} venues (${merges.length} fusionados)`);
  merges.forEach((v) => console.log(`  fusión → "${v.venue}"  ${JSON.stringify(v.variants)}  (${v.zonas.length} zonas)`));

  if (DRY) {
    console.log('\n[DRY-RUN] No se escribe nada. Venues a sembrar:');
    venues.forEach((v) => console.log(`  ${v.venue} → ${v.zonas.length} zonas`));
    console.log('\nVuelve a correr SIN --dry-run para escribir (requiere MAESTRO_TOKEN).');
    return;
  }
  if (!TOKEN) {
    console.error('FALTA MAESTRO_TOKEN. Exporta el JWT de maestro_roshi: export MAESTRO_TOKEN=<jwt>');
    process.exit(1);
  }
  console.log(`\nSembrando ${venues.length} venues en ${FN_URL} …`);
  let okc = 0, fail = 0;
  for (const v of venues) {
    const r = await guardar(v.venue, v.zonas);
    if (r.ok) { okc++; console.log(`  ✓ ${v.venue} (${v.zonas.length})`); }
    else { fail++; console.error(`  ✗ ${v.venue}: ${r.error}`); }
  }
  console.log(`\nListo: ${okc} ok, ${fail} fallidos, de ${venues.length} venues.`);
  if (fail) process.exit(1);
}

main();
