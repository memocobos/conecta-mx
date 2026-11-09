#!/usr/bin/env node
/* mide-grupo-wa-2 — GRUPO-WA-2 + GRUPO-LINK-VIVO-1 (9-nov-2026)
 * DOS grupos de WhatsApp por evento (CHEAP · viaje) y el link que «se borraba».
 *   [A] El dueño `linkPara`: CHEAP → link_cheap, los demás → link; con UNO solo
 *       capturado ese es el grupo de todos; sin ninguno → null.
 *   [B] `gruposDe` hereda CAMPO por CAMPO (la fecha gana, el campo que no trae
 *       cae al evento base) y con la tabla ilegible devuelve {} sin lanzar.
 *   [C] El handler REAL grupo_wa_guardar / grupo_wa_ver: dos cajas, '' quita,
 *       ausente no toca, las dos vacías → 400 sin escribir, coordi 403.
 *   [D] El correo único por el handler REAL (abono_crear): un buzón con un CHEAP
 *       y un PLUS del mismo evento trae los DOS botones rotulados; un buzón con
 *       un solo grupo trae el render de SIEMPRE (byte a byte el de HEAD).
 *   [E] El Portal: `_migGrupoHtml` REAL en vm dedupe por LINK (dos links del
 *       mismo evento → dos botones) y el reset de `_migGrupoVisto` vive PEGADO al
 *       .map; control positivo: la forma vieja (reset al arrancar + await) con
 *       dos pintadas concurrentes deja la segunda SIN botón — el «se borra».
 *   [F] gz-panel manda los dos links y los tres bebedores preguntan a linkPara.
 *   [S] Sabotaje al respaldo de linkPara (sha1 careado) → rojo → restaurado.
 * ⚠️ SIN ANCLA (árbol de trabajo). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), cp = require('child_process');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; m += ' · EXCEPCIÓN ' + e.message; } if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
function rebana(txt, ancla) {
  const i = txt.indexOf(ancla);
  if (i < 0) throw new Error('ancla no encontrada: ' + ancla);
  let d = 0, k = txt.indexOf('{', i), s = false, sc = '', esc = false;
  for (; k < txt.length; k++) {
    const c = txt[k];
    if (esc) { esc = false; continue; }
    if (s) { if (c === '\\') { esc = true; continue; } if (c === sc) s = false; continue; }
    if (c === '"' || c === "'" || c === '`') { s = true; sc = c; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } }
  }
  return txt.slice(i, k);
}
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'pt';
process.env.RESEND_API_KEY = 're_falsa';
process.env.JWT_SECRET = 'secreto';
process.env.CORREOS_MODO = 'real';

const LIB = path.join(RAIZ, 'netlify/functions/_lib/grupo-whatsapp.js');
const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const GV = 'https://chat.whatsapp.com/VIAJEviajeVIAJE000001', GC = 'https://chat.whatsapp.com/CHEAPcheapCHEAP000002', GB = 'https://chat.whatsapp.com/BASEbaseBASE0000000003';
const V1 = 'aaaaaaaa-0000-4000-8000-000000000001', V2 = 'aaaaaaaa-0000-4000-8000-000000000002', V3 = 'aaaaaaaa-0000-4000-8000-000000000003';

// Red falsa (la forma de mide-confirma-1): respeta eq/in/ilike, guarda estado, sin DELETE.
function red(o) {
  o = o || {};
  const st = {
    viajeros: o.viajeros || [], abonos: [], clientes: [], invitaciones: [], grupos: (o.grupos || []).slice(), correos: [], log: [], escrituras: [],
  };
  let seq = 1;
  const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)) });
  const casa = (row, url) => { for (const [k, v0] of new URL(url).searchParams) { const v = decodeURIComponent(v0);
      if (['select', 'limit', 'order'].includes(k)) continue;
      if (v.startsWith('eq.') && String(row[k]) !== v.slice(3)) return false;
      if (v.startsWith('ilike.') && String(row[k] || '').toLowerCase() !== v.slice(6).toLowerCase()) return false;
      if (v.startsWith('in.(') && !v.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(row[k]))) return false; }
    return true; };
  // El CHECK de la base, modelado: una fila de grupos sin ningún link REBOTA.
  const checkGrupos = (row) => { if (!row.link && !row.link_cheap) throw Object.assign(new Error('23514'), { status: 400 }); };
  st.fetch = async (url, init) => {
    init = init || {}; const m = (init.method || 'GET').toUpperCase(); url = String(url); st.log.push(m + ' ' + url);
    if (m === 'DELETE') throw new Error('DELETE prohibido');
    if (st.caida && url.includes('/grupos_whatsapp')) return resp(500, 'caída');
    if (url.includes('/index.html') || /conectareynosa\.mx\/?(\?|$)/.test(url)) return resp(200, INDEX);
    if (url === 'https://api.resend.com/emails') { st.correos.push(JSON.parse(init.body)); return resp(200, { id: 'em' + st.correos.length }); }
    if (url.includes('/rest/v1/usuarios') || url.includes('sesion')) throw new Error('fail-open');
    const T = url.includes('pt.falso.test/rest/v1/clientes') ? 'clientes' : url.includes('/viajeros_evento') ? 'viajeros'
      : url.includes('/abonos_viajero') ? 'abonos' : url.includes('/invitaciones_portal') ? 'invitaciones' : url.includes('/grupos_whatsapp') ? 'grupos' : null;
    if (!T) throw new Error('URL no contemplada ' + m + ' ' + url);
    if (T === 'clientes' && m === 'GET') return resp(200, []);
    if (m === 'GET') return resp(200, st[T].filter((r) => casa(r, url)).map((r) => Object.assign({}, r)));
    if (m === 'POST') { const b = JSON.parse(init.body); const rows = (Array.isArray(b) ? b : [b]).map((x) => Object.assign({ id: 'bbbbbbbb-0000-4000-8000-' + String(seq++).padStart(12, '0') }, x));
      if (T === 'grupos') { try { rows.forEach(checkGrupos); } catch (e) { return resp(400, 'check 23514'); } }
      rows.forEach((x) => st[T].push(x)); st.escrituras.push({ T, m, body: b }); return resp(201, rows); }
    if (m === 'PATCH') { const c = JSON.parse(init.body); const rows = st[T].filter((r) => casa(r, url));
      if (T === 'grupos') { try { rows.forEach((r) => checkGrupos(Object.assign({}, r, c))); } catch (e) { return resp(400, 'check 23514'); } }
      rows.forEach((r) => Object.assign(r, c)); st.escrituras.push({ T, m, body: c }); return resp(200, rows); }
    throw new Error('método ' + m);
  };
  return st;
}
function fresco() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions')) delete require.cache[k]; });
  return { h: require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler,
           jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
           gw: require(LIB), cc: require(path.join(RAIZ, 'netlify/functions/_lib/correo-confirmacion.js')) };
}
const ev = (b, t) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + t }, body: JSON.stringify(b) });

function bloqueA(gw, et) {
  console.log('\n[A] el dueño linkPara' + (et ? ' ' + et : ''));
  const dos = { link: GV, link_cheap: GC };
  af(gw.linkPara(dos, 'cheap') === GC && gw.linkPara(dos, 'CHEAP ') === GC, 'CHEAP → el grupo CHEAP (sin importar mayúsculas/espacios)');
  af(gw.linkPara(dos, 'plus') === GV && gw.linkPara(dos, 'stay') === GV && gw.linkPara(dos, 'ride') === GV, 'PLUS · STAY · RIDE → el grupo del viaje');
  af(gw.linkPara(dos, null) === GV && gw.linkPara(dos, '') === GV, 'sin paquete → el del viaje (no es CHEAP)');
  af(gw.linkPara({ link: GV, link_cheap: null }, 'cheap') === GV, 'solo el del viaje capturado → el CHEAP TAMBIÉN va ahí (lo de antes de la tuerca)');
  af(gw.linkPara({ link: null, link_cheap: GC }, 'plus') === GC, 'solo el CHEAP capturado → el PLUS también va ahí (un solo grupo = el de todos)');
  af(gw.linkPara({ link: null, link_cheap: null }, 'cheap') === null && gw.linkPara(null, 'plus') === null, 'sin ninguno → null (no se inventa)');
  af(JSON.stringify(gw.CAMPOS) === '["link","link_cheap"]', 'CAMPOS = link, link_cheap (lo que lee el select)');
}

(async () => {
  console.log('══ mide:grupo-wa-2 · dos grupos de WhatsApp por evento + el link que se borraba ══');
  let H = fresco();
  bloqueA(H.gw);

  console.log('\n[B] gruposDe: herencia campo a campo y fail-soft');
  let st = red({ grupos: [
    { evento_id: 'fr', link: GB, link_cheap: GC },           // base: los dos
    { evento_id: 'fr#1', link: GV, link_cheap: null },       // la fecha: solo el del viaje
    { evento_id: 'solo', link: null, link_cheap: GC },
  ] });
  global.fetch = st.fetch;
  let g = await H.gw.gruposDe(['fr#1', 'fr#2', 'solo', 'nada'], { KH_URL: 'https://kh.falso.test', KH_KEY: 'k' });
  af(g['fr#1'] && g['fr#1'].link === GV && g['fr#1'].link_cheap === GC, 'fr#1: su propio link del viaje + el CHEAP HEREDADO del evento base (campo a campo)');
  af(g['fr#2'] && g['fr#2'].link === GB && g['fr#2'].link_cheap === GC, 'fr#2 (sin fila): hereda los dos del base');
  af(g.solo && g.solo.link === null && g.solo.link_cheap === GC && !('nada' in g), 'solo-CHEAP viaja con link null; un evento sin fila no aparece');
  af(st.log.some((l) => /select=evento_id,link,link_cheap/.test(l)), 'el select pide las DOS columnas');
  st.caida = true;
  g = await H.gw.gruposDe(['fr#1'], { KH_URL: 'https://kh.falso.test', KH_KEY: 'k' });
  af(JSON.stringify(g) === '{}', 'tabla ilegible → {} sin lanzar (el botón simplemente no sale)');
  st.caida = false;

  console.log('\n[C] el handler REAL: grupo_wa_guardar / grupo_wa_ver');
  st = red(); global.fetch = st.fetch; H = fresco();
  const tok = H.jwtSign({ id: 'u-milk', rol: 'milk', nombre: 'Milk', correo: 'milk@x.mx' }, process.env.JWT_SECRET, 3600);
  let r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link: GV + '?mode=x', link_cheap: GC }, tok)); let j = JSON.parse(r.body);
  af(r.statusCode === 200 && st.grupos.length === 1 && st.grupos[0].link === GV && st.grupos[0].link_cheap === GC, `C1 nace la fila con los DOS links normalizados (${r.statusCode})`);
  af(j.propio === GV && j.propio_cheap === GC && j.link === GV && j.link_cheap === GC && j.heredado === false && j.heredado_cheap === false, 'C2 la respuesta trae propio/propio_cheap y lo que rige');
  const antes = st.escrituras.length;
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link_cheap: 'https://chat.whatsapp.com/OTROcheapOTRO00000009' }, tok));
  af(r.statusCode === 200 && st.grupos[0].link === GV && st.grupos[0].link_cheap.endsWith('OTROcheapOTRO00000009') && st.escrituras.length === antes + 1 && !('link' in st.escrituras[antes].body),
    'C3 mandar SOLO link_cheap reemplaza ese y NO toca el del viaje (el PATCH no lleva `link`)');
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link: GV, link_cheap: '' }, tok));
  af(r.statusCode === 200 && st.grupos[0].link === GV && st.grupos[0].link_cheap === null, 'C4 la caja CHEAP vacía QUITA ese grupo (la fila se queda con el del viaje)');
  const antes2 = st.escrituras.length;
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link: '', link_cheap: '' }, tok));
  af(r.statusCode === 400 && st.escrituras.length === antes2 && st.grupos[0].link === GV, 'C5 las DOS vacías → 400 con palabras y CERO escrituras (la casa no borra filas)');
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link: 'https://evil.com/x', link_cheap: GC }, tok));
  af(r.statusCode === 400 && st.escrituras.length === antes2, 'C6 un link que no es de grupo rebota ANTES de escribir, aunque el otro sea bueno');
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte' }, tok));
  af(r.statusCode === 400 && st.escrituras.length === antes2, 'C7 sin ninguna caja → 400 (nada que guardar)');
  await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link_cheap: GC }, tok));
  r = await H.h(ev({ accion: 'grupo_wa_ver', evento_id: 'palnorte#1' }, tok)); j = JSON.parse(r.body);
  af(j.propio === null && j.propio_cheap === null && j.link === GV && j.link_cheap === GC && j.heredado === true && j.heredado_cheap === true,
    'C8 la fecha sin fila hereda los DOS del evento, rotulados heredado/heredado_cheap');
  const tokC = H.jwtSign({ id: 'u-c', rol: 'coordinador', correo: 'c@x.mx' }, process.env.JWT_SECRET, 3600);
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link_cheap: GB }, tokC));
  af(r.statusCode === 403 && st.grupos[0].link_cheap === GC, 'C9 un coordinador no puede cambiarlos');
  af(!st.log.some((l) => l.startsWith('DELETE')), 'C10 cero DELETEs');

  console.log('\n[D] el correo único: cada quien su grupo; un buzón mixto trae los dos');
  const viaj = [
    { id: V1, evento_id: 'palnorte', nombre: 'Ana Cheap', correo: 'ana@prueba.mx', tipo_paquete: 'cheap', total_contrato: 300, abonado_previo: 0 },
    { id: V2, evento_id: 'palnorte', nombre: 'Ana Plus', correo: 'ana@prueba.mx', tipo_paquete: 'plus', total_contrato: 5000, abonado_previo: 0 },
    { id: V3, evento_id: 'palnorte', nombre: 'Beto Cheap', correo: 'beto@prueba.mx', tipo_paquete: 'cheap', total_contrato: 300, abonado_previo: 0 },
  ];
  st = red({ viajeros: viaj, grupos: [{ evento_id: 'palnorte', link: GV, link_cheap: GC }] }); global.fetch = st.fetch; H = fresco();
  r = await H.h(ev({ accion: 'abono_crear', viajero_id: V3, monto: 300 }, tok));
  let c = st.correos[0] || {};
  af(r.statusCode === 200 && st.correos.length === 1 && (c.html || '').includes('href="' + GC + '"') && !(c.html || '').includes(GV), `D1 un CHEAP solo recibe el grupo CHEAP (${r.statusCode})`);
  af(/Entrar al grupo de WhatsApp →/.test(c.html || '') && !/Grupo de los boletos CHEAP/.test(c.html || ''), 'D2 …con el botón de SIEMPRE (un solo grupo: sin rótulo de paquete)');
  st = red({ viajeros: viaj, grupos: [{ evento_id: 'palnorte', link: GV, link_cheap: GC }] }); global.fetch = st.fetch; H = fresco();
  // El buzón junta a Ana Cheap y Ana Plus cuando el llamador manda los DOS ids
  // (aprobar una requisición con acompañantes, el reparto): es el universo que
  // el propio dueño agrupa por correo — un abono suelto manda UN id y no mezcla.
  await H.cc.enviarCorreoPago({ tipo: 'pago', evento_id: 'palnorte', viajeroIds: [V1, V2], recibidoPorViajero: { [V2]: 500 }, enviado_por: 'careo', KH_URL: 'https://kh.falso.test', KH_KEY: 'svc' });
  c = st.correos[0] || {};
  af(st.correos.length === 1 && (c.html || '').includes('href="' + GV + '"') && (c.html || '').includes('href="' + GC + '"'), 'D3 el buzón con un CHEAP y un PLUS trae los DOS links');
  af(/Grupo de los boletos CHEAP →/.test(c.html || '') && /Grupo del viaje \(PLUS · STAY · RIDE\) →/.test(c.html || '') && /dos grupos/.test(c.html || ''), 'D4 …cada botón dice de qué es, y el texto avisa que son dos');
  st = red({ viajeros: viaj, grupos: [{ evento_id: 'palnorte', link: GV }] }); global.fetch = st.fetch; H = fresco();
  r = await H.h(ev({ accion: 'abono_crear', viajero_id: V3, monto: 300 }, tok));
  c = st.correos[0] || {};
  af(st.correos.length === 1 && (c.html || '').includes('href="' + GV + '"') && !/boletos CHEAP/.test(c.html || ''), 'D5 con UN solo grupo capturado, el CHEAP recibe ese (lo de antes, sin cambio)');
  // El render con `grupo` string es BYTE A BYTE el de HEAD (regresión).
  {
    const ccHead = cp.execSync('git show HEAD:netlify/functions/_lib/correo-confirmacion.js', { cwd: RAIZ }).toString();
    const tmp = path.join(RAIZ, 'netlify/functions/_lib/.cc-head-tmp.js');
    fs.writeFileSync(tmp, ccHead);
    try {
      const viejo = require(tmp);
      const { fetchEventosRaw } = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
      const EV = await fetchEventosRaw();
      const evx = EV.find((e) => e.id === 'palnorte');
      const args = { tipo: 'pago', correo: 'a@b.mx', ev: evx, evento_id: 'palnorte', nombres: ['Ana'], recibido: 300, total: 300, resta: 0, portal: null, grupo: GV, cambio: null };
      const a = viejo.renderConfirmacion(args), b = H.cc.renderConfirmacion(args);
      af(a.html && a.html === b.html, 'D6 con UN grupo el correo es BYTE A BYTE el de HEAD (' + sha1(a.html || '') + ')');
      af(a.html && a.html.includes(GV), 'D6b …y ese render sí trae el link (la igualdad no es sobre vacío)');
    } finally { fs.unlinkSync(tmp); }
  }

  console.log('\n[E] el Portal: dedupe por LINK y el reset pegado al .map (GRUPO-LINK-VIVO-1)');
  const ph = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
  const fn = rebana(ph, 'function _migGrupoHtml(t){');
  const sb = vm.createContext({ escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), _migGrupoVisto: new Set() });
  vm.runInContext(fn, sb);
  const pinta = (t) => vm.runInContext('_migGrupoHtml(' + JSON.stringify(t) + ')', sb);
  vm.runInContext('_migGrupoVisto = new Set()', sb);
  const h1 = pinta({ evento_id: 'palnorte', grupo_whatsapp: GC }), h2 = pinta({ evento_id: 'palnorte', grupo_whatsapp: GV }), h3 = pinta({ evento_id: 'palnorte#1', grupo_whatsapp: GV });
  af(h1.includes(GC) && h2.includes(GV), 'E1 dos links DISTINTOS del mismo evento → DOS botones (CHEAP y PLUS en la misma cuenta)');
  af(h3 === '', 'E2 el mismo link otra vez (otra fecha) → un solo botón (dedupe por link)');
  // El orden del código: el reset está pegado al .map, sin await entre medio, y ya no abre _migPlanPintar.
  const pintar = rebana(ph, 'async function _migPlanPintar(){');
  const iReset = pintar.indexOf('_migGrupoVisto = new Set()'), iMap = pintar.indexOf('j.tours.map(');
  af(iReset > 0 && iMap > iReset && !/await/.test(pintar.slice(iReset, iMap)), 'E3 el reset de _migGrupoVisto vive justo antes del .map, sin un await en medio');
  af(!/^async function _migPlanPintar\(\)\{\s*_migGrupoVisto = new Set\(\)/.test(pintar), 'E4 …y ya NO abre la función (donde cruzaba los awaits)');
  // Control positivo: la forma VIEJA con dos pintadas concurrentes se come el botón de la segunda.
  async function pintadaVieja(tag) { vm.runInContext('_migGrupoVisto = new Set()', sb); await new Promise((res) => setTimeout(res, 5)); return pinta({ evento_id: 'palnorte', grupo_whatsapp: GV }); }
  async function pintadaNueva(tag) { await new Promise((res) => setTimeout(res, 5)); vm.runInContext('_migGrupoVisto = new Set()', sb); return pinta({ evento_id: 'palnorte', grupo_whatsapp: GV }); }
  const [vA, vB] = await Promise.all([pintadaVieja('A'), pintadaVieja('B')]);
  af(vA.includes(GV) && vB === '', 'E5 CONTROL: con el reset al ARRANCAR, dos pintadas a la vez → la segunda (la que queda en pantalla) sale SIN botón — el «se borra»');
  const [nA, nB] = await Promise.all([pintadaNueva('A'), pintadaNueva('B')]);
  af(nA.includes(GV) && nB.includes(GV), 'E6 con el reset pegado al pintado, las dos traen su botón');

  console.log('\n[F] los bebedores preguntan al dueño');
  const pm = fs.readFileSync(path.join(RAIZ, 'netlify/functions/portal-mi-plan-migrado.js'), 'utf8');
  af(/grupo_whatsapp:\s*linkPara\(gruposWA\[v\.evento_id\],\s*v\.tipo_paquete\)/.test(pm) && !/linksWA\[v\.evento_id\]/.test(pm), 'F1 portal-mi-plan-migrado: el link del viajero sale de linkPara por SU paquete');
  const cc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/_lib/correo-confirmacion.js'), 'utf8');
  af(/linkPara\(gruposWA\[v\.evento_id\] \|\| gruposWA\[evento_id\], v\.tipo_paquete\)/.test(cc) && /tipo_paquete'/.test(cc.match(/const sel = '[^']*'/)[0]), 'F2 correo-confirmacion: linkPara por paquete, y el select pide tipo_paquete');
  const gz = fs.readFileSync(path.join(RAIZ, 'netlify/functions/gz-panel.js'), 'utf8');
  af(/grupo_whatsapp: \(grupos\[evento_id\] \|\| \{\}\)\.link \|\| null/.test(gz) && /grupo_whatsapp_cheap: \(grupos\[evento_id\] \|\| \{\}\)\.link_cheap/.test(gz), 'F3 gz-panel manda los dos (el coordi ve ambos grupos)');
  const khgz = fs.readFileSync(path.join(RAIZ, 'kamehouse-gz.js'), 'utf8');
  af(/tour\.grupo_whatsapp_cheap/.test(khgz) && /Grupo de WhatsApp \(CHEAP\)/.test(khgz), 'F4 la pestaña Tours del GZ pinta el botón del grupo CHEAP cuando existe');
  const khjs = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  af(/accion: 'grupo_wa_guardar', evento_id: _ccEventoActual, link, link_cheap/.test(khjs) && /cc-grupo-wa-link-cheap/.test(fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8')), 'F5 Capsule: dos cajas y las dos viajan al guardar');
  // Nadie más arma «cheap → cual link» por su cuenta.
  const otros = ['netlify/functions/portal-mi-plan-migrado.js', 'netlify/functions/_lib/correo-confirmacion.js', 'netlify/functions/gz-panel.js'].map((f) => fs.readFileSync(path.join(RAIZ, f), 'utf8')).join('\n');
  af(!/link_cheap \|\| [a-z.]*link\b|\.link \|\| [a-z.]*link_cheap/.test(otros.replace(/\/\/.*$/gm, '')), 'F6 ningún bebedor arma su propio respaldo link_cheap||link (eso es del dueño)');

  console.log('\n[S] sabotaje: el dueño sin respaldo (CHEAP sin grupo CHEAP se queda sin link)');
  const orig = fs.readFileSync(LIB, 'utf8'); const bak = LIB + '.bak';
  fs.copyFileSync(LIB, bak);
  const sab = orig.replace("return orden.find((x) => !!x) || null;", 'return orden[0] || null;');
  af(sha1(sab) !== sha1(orig), 'S0 el sabotaje MUTÓ el archivo (' + sha1(orig) + ' → ' + sha1(sab) + ')');
  fs.writeFileSync(LIB, sab);
  let rojos = 0; const afS = af; const V0 = V, R0 = R;
  { const gwS = (() => { delete require.cache[require.resolve(LIB)]; return require(LIB); })();
    const vS = V, rS = R; console.log('  (corriendo [A] saboteado — se esperan rojos)');
    bloqueA(gwS, '(SABOTEADO)'); rojos = R - rS; V = vS; R = rS; }
  fs.copyFileSync(bak, LIB); fs.unlinkSync(bak);
  af(sha1(fs.readFileSync(LIB, 'utf8')) === sha1(orig), 'S1 restaurado byte a byte');
  af(rojos >= 2, `S2 el sabotaje puso ${rojos} aserciones en rojo (el careo muerde)`);

  console.log(`\n${R ? '🔴 ROJO' : '✅ VERDE'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO', e); process.exit(2); });
