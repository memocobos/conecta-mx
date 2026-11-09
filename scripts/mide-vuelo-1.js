#!/usr/bin/env node
// =============================================================================
// mide-vuelo-1.js — [VUELO-1 · 5-nov-2026]
//
// Palabra de Memo (pedido de Bulma y Milk): el costo del vuelo se captura en la
// card del viajero, se suma a su paquete, se reparte en sus fechas de pago y el
// Portal lo refleja. Sus cinco respuestas:
//   1 · un solo total (sin desglose al cliente)   2 · entre las cuotas que faltan
//   3 · uno por uno                               4 · precargado de la Nube, editable
//   5 · se le avisa al cliente de todo
//
//   [A] vuelo_prellenar: trae la Nube vigente (la del evento gana; sin ella, la
//       general rotulada) y CERO escrituras.
//   [B] vuelo_guardar por el handler REAL: el total sube EXACTO el costo, el
//       trigger (espejo `rerepartir`) reparte en las cuotas que faltan y las ya
//       empezadas conservan su monto; nota anexada; UN correo con los datos del
//       vuelo y SIN el costo desglosado.
//   [C] editar = la DIFERENCIA (4,000 → 4,500 suma 500) · quitar resta lo suyo.
//   [D] candados: valor esperado (carrera → 409 sin escribir) · sin total 409 ·
//       sin cambios 400 · costo 0 400 · viaje sin publicar = sin correo, DICHO.
//   [E] Portal: viajan aerolínea/horarios/clave y NO el costo; la tarjeta lo pinta.
//   [F] Capsule: botón ✈️ en la fila + la pantalla no suma un peso.
//
// SIN ANCLA a propósito (carga del árbol de trabajo, como mide:plan-vj-1).
// =============================================================================
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://portal.falso.test';
process.env.PORTAL_SUPABASE_SERVICE = 'svc2';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'svc2';
process.env.RESEND_API_KEY = 're_falsa';
process.env.CORREOS_MODO = 'real';
process.env.CONTRATO_CLIENTE_APAGAR_ARNES = '1';

let V = 0, R = 0;
const af = (c, m) => {
  let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {}
  const t = typeof m === 'function' ? (() => { try { return m(); } catch (e) { return '(msg) ' + e.message; } })() : m;
  if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); }
};
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const PF = require(path.join(RAIZ, 'netlify/functions/_lib/plan-fijo.js'));

const INDEX = `<script>var EV=[
 {id:'cdmxx',a:'Concierto CDMX',f:'1 feb 2027',ds:'2027-02-01',v:'Estadio GNP, CDMX',cdmx:true,st:'',sep:300,
  zonas:[{n:'Pista',p:5000}],cheapZonas:[],hotel:[]}
];</script>`;

let DB, CARRERA = false;
const ESCR = [], CORREOS = [];
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const val = (u, c, op) => { const m = u.match(new RegExp('[?&]' + c.replace(/[>]/g, '\\$&') + '=' + op + '\\.([^&]*)')); return m ? decodeURIComponent(m[1]) : null; };

global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  if (u.includes('api.resend.com')) { const b = JSON.parse(init.body || '{}'); CORREOS.push(b); return resp(200, { id: 'em_' + CORREOS.length }); }
  if (m !== 'GET') {
    ESCR.push(m + ' ' + u);
    if (m === 'PATCH' && u.includes('/rest/v1/viajeros_evento')) {
      const id = val(u, 'id', 'eq'); const b = JSON.parse(init.body || '{}');
      if (CARRERA) { const x = DB.v.find((y) => y.id === id); if (x) x.total_contrato = Number(x.total_contrato) + 1; CARRERA = false; }
      // El valor esperado, como PostgREST: total_contrato y vuelo.
      const filas = DB.v.filter((x) => {
        if (x.id !== id) return false;
        const te = val(u, 'total_contrato', 'eq');
        if (te !== null && Number(x.total_contrato) !== Number(te)) return false;
        if (/total_contrato=is\.null/.test(u) && x.total_contrato != null) return false;
        if (/vuelo=is\.null/.test(u) && x.vuelo != null) return false;
        if (/vuelo=not\.is\.null/.test(u) && x.vuelo == null) return false;
        const at = val(u, 'vuelo->>at', 'eq');
        if (at !== null && !(x.vuelo && x.vuelo.at === at)) return false;
        return true;
      });
      filas.forEach((x) => {
        const totalAntes = x.total_contrato;
        Object.assign(x, b);
        // El TRIGGER de la base (plan_pagos_resplit), por su espejo JS careado.
        if (x.plan_pagos && 'total_contrato' in b && Number(totalAntes) !== Number(b.total_contrato)) {
          x.plan_pagos = PF.rerepartir(x.plan_pagos, { total: Number(b.total_contrato), paquete: x.tipo_paquete, ahora: new Date() });
        }
      });
      return resp(200, filas.map((x) => Object.assign({}, x)));
    }
    return resp(500, { error: 'escritura no modelada' });
  }
  if (u.includes('/index.html') || /conectareynosa\.mx\/?($|\?)/.test(u)) return resp(200, INDEX);
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'bulma' }]);
  if (u.includes('/rest/v1/nube_cotizaciones')) {
    const modo = val(u, 'modo', 'eq'); const ev = val(u, 'evento_id', 'eq');
    return resp(200, DB.nube.filter((f) => f.modo === modo && (/evento_id=is\.null/.test(u) ? f.evento_id == null : f.evento_id === ev)));
  }
  if (u.includes('/rest/v1/abonos_viajero')) { const vid = val(u, 'viajero_id', 'eq'); return resp(200, DB.abonos.filter((a) => a.viajero_id === vid)); }
  if (u.includes('/rest/v1/viajeros_evento')) { const id = val(u, 'id', 'eq'); return resp(200, DB.v.filter((x) => !id || x.id === id).map((x) => Object.assign({}, x))); }
  return resp(200, []);
};

const semilla = () => {
  const plan = PF.armarPlanFijo({ separo_fecha: '2026-09-01', separo_monto: 300, total: 5000, paquete: 'plus', ds: '2027-02-01' });
  const desde = new Date(Date.now() - 86400e3).toISOString(), hasta = new Date(Date.now() + 6 * 86400e3).toISOString();
  DB = {
    v: [
      { id: U(1), evento_id: 'cdmxx', nombre: 'Laura Pérez', correo: 'laura@x.mx', tipo_paquete: 'plus', zona_boleto: 'Pista', total_contrato: 5000, abonado_previo: 0,
        notas: 'Migración', portal_revisado_at: '2026-10-21T00:00:00Z', fecha_separo: '2026-10-20', plan_pagos: plan, vuelo: null },
      { id: U(2), evento_id: 'cdmxx', nombre: 'Sin Total', correo: 's@x.mx', tipo_paquete: 'plus', total_contrato: null, abonado_previo: 0, notas: null, portal_revisado_at: '2026-10-21T00:00:00Z', vuelo: null },
      { id: U(3), evento_id: 'cdmxx', nombre: 'Beto NoPublicado', correo: 'b@x.mx', tipo_paquete: 'plus', total_contrato: 5000, abonado_previo: 0, notas: null, portal_revisado_at: null, vuelo: null },
    ],
    abonos: [{ id: U(101), viajero_id: U(1), monto: 300, fecha: '2026-10-20' }],
    nube: [
      { id: U(301), modo: 'avion', evento_id: null, precio_pp: 3800, vigente_desde: desde, vigente_hasta: hasta, horarios: 'general', creado_en: desde },
      { id: U(302), modo: 'avion', evento_id: 'cdmxx', precio_pp: 4200, vigente_desde: desde, vigente_hasta: hasta, horarios: 'Viva · sale 7:05 AM', creado_en: desde },
    ],
  };
};

const llamar = async (b) => {
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(b) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};

(async () => {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });

  console.log('[A] vuelo_prellenar');
  semilla(); ESCR.length = 0;
  const a = await llamar({ accion: 'vuelo_prellenar', viajero_id: U(1) });
  af(a.s === 200 && a.j.nube && a.j.nube.precio === 4200 && /del evento/.test(a.j.nube.fuente), () => 'precarga la Nube DEL EVENTO (4,200), no la general: ' + JSON.stringify(a.j.nube || a.j.error));
  af(a.j.nube && a.j.nube.horarios === 'Viva · sale 7:05 AM', 'y sus horarios');
  DB.nube = DB.nube.filter((f) => f.evento_id == null);
  const a2 = await llamar({ accion: 'vuelo_prellenar', viajero_id: U(1) });
  // ⚰️ [NUBE-6b · 9-nov-2026] Aquí se exigía «sin cotización del evento → la
  // general de avión, ROTULADA». Palabra de Memo: «el avión cambia bastante en
  // cada evento, no puede ser general el costo» — el dueño (`_lib/nube`) ya NO
  // deja heredar el avión, así que sin cotización del evento la respuesta
  // correcta es NULL (se captura a mano), aunque exista una general de avión en
  // la tabla. La fila general sigue sembrada A PROPÓSITO: es el control de que
  // no se hereda. Esta aserción se actualizó a la verdad nueva, no se silenció.
  af(DB.nube.some((f) => f.evento_id == null && f.modo === 'avion'), 'premisa: sigue habiendo una general de avión sembrada (el control tiene dientes)');
  af(a2.s === 200 && a2.j.nube === null, () => 'sin cotización del evento → NULL aunque haya general de avión (el avión no hereda, NUBE-6b): ' + JSON.stringify(a2.j.nube));
  DB.nube = [];
  const a3 = await llamar({ accion: 'vuelo_prellenar', viajero_id: U(1) });
  af(a3.s === 200 && a3.j.nube === null, 'sin Nube vigente → null (se captura a mano), no un precio inventado');
  af(ESCR.length === 0, () => 'CERO escrituras al precargar: ' + ESCR.join(' | '));

  console.log('[B] vuelo_guardar · agregar');
  semilla(); ESCR.length = 0; CORREOS.length = 0;
  const cuotasAntes = DB.v[0].plan_pagos.cuotas.map((c) => ({ ini: c.ini, monto: c.monto }));
  const b = await llamar({ accion: 'vuelo_guardar', viajero_id: U(1), costo: 4200, aerolinea: 'Viva Aerobus', salida: 'VB 1234 · 31 ene 7:05 AM', regreso: 'VB 4321 · 2 feb 9:40 PM', clave: 'ABC123', origen: 'nube' });
  const f = DB.v[0];
  af(b.s === 200 && b.j.total_de === 5000 && b.j.total_a === 9200 && f.total_contrato === 9200, () => 'el total sube EXACTO el costo (5,000 → 9,200): ' + b.s + ' ' + JSON.stringify(b.j.error || [b.j.total_de, b.j.total_a]));
  af(f.vuelo && f.vuelo.costo === 4200 && f.vuelo.aerolinea === 'Viva Aerobus' && f.vuelo.clave === 'ABC123' && f.vuelo.origen === 'nube' && f.vuelo.por === 'Bulma', () => 'guarda TODOS los datos del vuelo + quién: ' + JSON.stringify(f.vuelo));
  const nuevas = f.plan_pagos.cuotas;
  const empezadas = cuotasAntes.filter((c) => c.ini <= hoy && c.monto > 0);
  af(empezadas.length > 0, () => 'candado: el fixture SÍ trae cuotas ya empezadas (' + empezadas.length + ') — si no, la siguiente aserción pasaría en vacío');
  af(empezadas.length > 0 && empezadas.every((c) => (nuevas.find((n) => n.ini === c.ini) || {}).monto === c.monto), () => 'las cuotas YA empezadas conservan su monto: ' + JSON.stringify(empezadas));
  const sumaNueva = nuevas.reduce((x, c) => x + c.monto, 0);
  af(Math.round(sumaNueva) === 9200 - 300, () => 'las cuotas suman el total nuevo menos el separo (8,900): ' + sumaNueva);
  af(nuevas.filter((c) => c.ini > hoy).length > 0 && nuevas.filter((c) => c.ini > hoy).every((c) => c.monto > (cuotasAntes.find((o) => o.ini === c.ini) || { monto: 0 }).monto), 'el vuelo se repartió en las cuotas que FALTAN');
  af(/\[VUELO \d{4}-\d{2}-\d{2}\] vuelo agregado \$4200 · Viva Aerobus · clave ABC123 · total \$5000 → \$9200 · Bulma/.test(f.notas) && /^Migración · /.test(f.notas), () => 'nota ANEXADA (la de siempre se conserva): ' + f.notas);
  af(ESCR.filter((e) => /^PATCH/.test(e)).length === 1 && /total_contrato=eq\.5000/.test(ESCR[0]) && /vuelo=is\.null/.test(ESCR[0]), () => 'UN PATCH con valor esperado (total y vuelo): ' + ESCR.join(' | '));
  af(CORREOS.length === 1 && CORREOS[0].to[0] === 'laura@x.mx' && /Ya está tu vuelo/.test(CORREOS[0].subject), () => 'UN correo al cliente: ' + JSON.stringify(CORREOS.map((c) => [c.to, c.subject])));
  const h = (CORREOS[0] || {}).html || '';
  af(/Viva Aerobus/.test(h) && /ABC123/.test(h) && /VB 1234/.test(h) && /VB 4321/.test(h), 'el correo trae aerolínea, salida, regreso y clave');
  af(/\$9,200/.test(h) && !/\$4,200/.test(h), 'y UN SOLO total ($9,200) — el costo del vuelo NO se desglosa (decisión 1)');
  af(/Tus pagos que faltan/.test(h), 'y las cuotas que le faltan, ya repartidas');
  af(b.j.aviso && b.j.aviso.ok === true && b.j.plan_repartido === true, 'la respuesta dice que el correo salió y que se repartió');

  console.log('[C] editar = la diferencia · quitar');
  ESCR.length = 0; CORREOS.length = 0;
  const c = await llamar({ accion: 'vuelo_guardar', viajero_id: U(1), costo: 4500, aerolinea: 'Viva Aerobus', salida: 'VB 1234 · 31 ene 7:05 AM', regreso: 'VB 4321 · 2 feb 9:40 PM', clave: 'ABC123' });
  af(c.s === 200 && DB.v[0].total_contrato === 9500, () => 'cambiar 4,200 → 4,500 suma 300, no 4,500 (total 9,500): ' + DB.v[0].total_contrato);
  af(/vuelo->>at=eq\./.test(ESCR[0] || ''), 'el valor esperado del vuelo es su sello `at`');
  af(CORREOS.length === 1 && /Actualizamos tu vuelo/.test(CORREOS[0].subject), 'y se le avisa otra vez (decisión 5)');
  const c2 = await llamar({ accion: 'vuelo_guardar', viajero_id: U(1), costo: 4500, aerolinea: 'Viva Aerobus', salida: 'VB 1234 · 31 ene 7:05 AM', regreso: 'VB 4321 · 2 feb 9:40 PM', clave: 'ABC123' });
  af(c2.s === 400 && DB.v[0].total_contrato === 9500, 'sin cambios → 400, cero escrituras');
  CORREOS.length = 0;
  const c3 = await llamar({ accion: 'vuelo_guardar', viajero_id: U(1), quitar: true });
  af(c3.s === 200 && DB.v[0].total_contrato === 5000 && DB.v[0].vuelo === null, () => 'quitar resta SU costo (vuelve a 5,000) y borra la ficha: ' + DB.v[0].total_contrato);
  af(CORREOS.length === 1 && /Quitamos el vuelo/.test(CORREOS[0].html), 'quitar también avisa');
  const c4 = await llamar({ accion: 'vuelo_guardar', viajero_id: U(1), quitar: true });
  af(c4.s === 400, 'quitar sin vuelo → 400');

  console.log('[D] candados');
  semilla(); ESCR.length = 0; CORREOS.length = 0; CARRERA = true;
  const d1 = await llamar({ accion: 'vuelo_guardar', viajero_id: U(1), costo: 4200 });
  af(d1.s === 409 && DB.v[0].vuelo === null && CORREOS.length === 0, () => 'otro movió el total en medio → 409, sin escribir y sin correo: ' + d1.s);
  CARRERA = false;
  const d2 = await llamar({ accion: 'vuelo_guardar', viajero_id: U(2), costo: 4200 });
  af(d2.s === 409 && DB.v[1].total_contrato === null, 'sin total del paquete → 409 (el total no puede quedar siendo solo el vuelo)');
  const d3 = await llamar({ accion: 'vuelo_guardar', viajero_id: U(1), costo: 0 });
  af(d3.s === 400, 'costo 0 → 400 (para quitar se usa «Quitar vuelo»)');
  const d4 = await llamar({ accion: 'vuelo_guardar', viajero_id: 'nope', costo: 100 });
  af(d4.s === 400, 'uuid inválido → 400');
  CORREOS.length = 0;
  const d5 = await llamar({ accion: 'vuelo_guardar', viajero_id: U(3), costo: 3000 });
  af(d5.s === 200 && DB.v[2].total_contrato === 8000 && CORREOS.length === 0 && d5.j.aviso && /no está publicado/.test(d5.j.aviso.aviso), () => 'viaje sin publicar: se guarda, NO se manda correo y se DICE: ' + JSON.stringify(d5.j.aviso));
  const src = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
  af(/vuelo_prellenar: ROLES_EDITA_VIAJERO/.test(src) && /vuelo_guardar: ROLES_EDITA_VIAJERO/.test(src), 'las dos acciones están en ACCIONES (o el portero las rechaza)');

  console.log('[E] Portal');
  const pm = fs.readFileSync(path.join(RAIZ, 'netlify/functions/portal-mi-plan-migrado.js'), 'utf8');
  const blk = pm.slice(pm.indexOf('vuelo: (v.vuelo'), pm.indexOf('} : null,', pm.indexOf('vuelo: (v.vuelo')));
  // [PORTAL-PAGO-2] el select ganó `grupo_viaje` después de `vuelo`: el ancla
  // «plan_pagos,vuelo&limit» leía una POSICIÓN; lo que importa es que `vuelo`
  // sea un campo pedido (coma o fin de lista a los lados).
  const pideVuelo = /&select=[^']*(^|,)vuelo(,|&)/.test(pm.replace(/'\s*\+\s*'/g, ''));
  af(pideVuelo && /aerolinea/.test(blk) && /clave/.test(blk) && !/costo/.test(blk), 'el Portal recibe aerolínea/horarios/clave y NO el costo');
  const ph = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
  const i0 = ph.indexOf('function _migVueloHtml(t){'), i1 = ph.indexOf('function _migGrupoHtml(t){');
  const ctx = { escapeHtml: (s) => String(s == null ? '' : s).replace(/</g, '&lt;') };
  vm.createContext(ctx); vm.runInContext(ph.slice(i0, i1), ctx);
  const pv = vm.runInContext('_migVueloHtml', ctx);
  const html = pv({ vuelo: { aerolinea: 'Viva', salida: 'VB 1', regreso: 'VB 2', clave: 'ABC' } });
  af(/Tu vuelo/.test(html) && /Viva/.test(html) && /ABC/.test(html) && /incluido en el total/.test(html), 'la tarjeta del viaje pinta «✈️ Tu vuelo»');
  af(pv({ vuelo: null }) === '' && pv({}) === '', 'sin vuelo no pinta nada');
  af(/_migVueloHtml\(t\) \+ _migPagosHtml\(t\)/.test(ph), 'va en la card, justo antes del plan de pagos');

  console.log('[F] Capsule');
  const kj = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  af(/onclick="_vjVueloAbrir\(/.test(kj) && /vueloGuardar\(payload\)/.test(kj), 'botón ✈️ Vuelo en la fila del viajero + su método');
  const cuerpo = kj.slice(kj.indexOf('async function _vjVueloAbrir'), kj.indexOf('async function _vjPlanFijar'));
  af(/document\.querySelectorAll\('tr\[id\^="vj-ab-"\]'\)/.test(cuerpo) && /dataset\.modo = 'vuelo'/.test(cuerpo), 'abre en el renglón plegable de siempre (un panel a la vez)');
  af(!/total_contrato|\+ *costo|costo *\+/.test(cuerpo), 'la pantalla no suma el total: lo hace el servidor');
  af(/,vuelo`/.test(src), 'la lista de viajeros trae el vuelo (para pintar «Vuelo ✓»)');

  console.log('\n' + (V === 0 ? 'NADA MEDIDO · esto NO es un verde' : (R ? '🔴 ROJO' : '✅ VERDE')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
  process.exit(R || !V ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(2); });
