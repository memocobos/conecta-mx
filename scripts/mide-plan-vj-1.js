#!/usr/bin/env node
// =============================================================================
// mide-plan-vj-1.js — [PLAN-VJ-1 + REQ-FICHA-1 · 4-nov-2026]
//
// Palabras de Memo:
//   · «en requisiciones tengo que abrir el botón de ver la cotización para ver
//     el tipo de boleto, habitación, paquete… dame esa info desde que veo la
//     requisición» → REQ-FICHA-1.
//   · «acceso a las fechas de pago de cada cliente y cantidades por si
//     preguntan… descargar como la del /rol el png pero con la info del
//     cliente» → PLAN-VJ-1.
//
//   [A] plan_viajero por el handler REAL: total/pagado/falta = saldoMigrado,
//       el calendario = planDelViaje (careado contra el DUEÑO, no re-hecho
//       aquí), la fecha del #N = fechaDeEventoId, banco por la regla del
//       Portal (CHEAP → Banamex, PLUS → BBVA) — y CERO escrituras.
//   [B] catálogo ilegible → plan null CON su motivo (no un calendario vacío).
//   [C] puertas: uuid inválido 400 · inexistente 404.
//   [D] listar de la bandeja trae fecha_txt del #N (no las N fechas) + venue,
//       y la ficha REAL de la pantalla lo pinta junto a paquete/zona/hotel.
//   [E] la pantalla del plan NO calcula: sus cuotas son las del servidor.
//
// SIN ANCLA a propósito (carga del árbol de trabajo, como mide:req-b1).
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
  const t = typeof m === 'function' ? m() : m;
  if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); }
};
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

const INDEX = `<script>var EV=[
 {id:'eventox',a:'Evento X',f:'1 feb 2027',ds:'2027-02-01',v:'Arena Monterrey',st:'',sep:300,
  zonas:[{n:'Pista',p:3000}],cheapZonas:[{n:'Pista',p:1500}],hotel:[]},
 {id:'multix',a:'Multi X',f:'11, 12 ene 2027',ds:'2027-01-11',dsList:['2027-01-11','2027-01-12'],v:'Arena Monterrey',st:'',sep:300,
  multifecha:[{lbl:'11 Enero',ds:'2027-01-11',zonas:[{n:'Oro',p:6500}],cheapZonas:[]},{lbl:'12 Enero',ds:'2027-01-12',zonas:[{n:'Oro',p:6500}],cheapZonas:[]}],
  zonas:[{n:'Oro',p:6500}],cheapZonas:[],hotel:[]}
];</script>`;

let DB, CATALOGO_OK;
const ESCR = [];
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const eq = (q, c) => { const m = q.match(new RegExp('[?&]' + c + '=eq\\.([^&]*)')); return m ? decodeURIComponent(m[1]) : null; };

global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  if (m !== 'GET') { ESCR.push(m + ' ' + u); return resp(500, { error: 'escritura en un careo de solo lectura' }); }
  if (u.includes('/index.html') || /conectareynosa\.mx\/?($|\?)/.test(u)) return CATALOGO_OK ? resp(200, INDEX) : resp(503, 'caído');
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'bulma' }]);
  const filtra = (rows, cols) => {
    let f = rows.slice();
    for (const c of ['id'].concat(cols)) { const v = eq(u, c); if (v !== null) f = f.filter((x) => String(x[c]) === v); }
    return f;
  };
  if (u.includes('/rest/v1/abonos_viajero')) return resp(200, filtra(DB.abonos, ['viajero_id']));
  if (u.includes('/rest/v1/viajeros_evento')) return resp(200, filtra(DB.v, ['evento_id']));
  if (u.includes('/rest/v1/requisiciones')) return resp(200, filtra(DB.reqs, ['estado', 'evento_id']));
  return resp(200, []);
};

const semilla = () => {
  DB = {
    v: [
      { id: U(1), evento_id: 'eventox', nombre: 'Laura Pérez', tipo_paquete: 'plus', zona_boleto: 'Pista', hotel_tipo: 'Compartida', boletos: 1, total_contrato: 3000, abonado_previo: 0, celular: '8991112233' },
      { id: U(2), evento_id: 'eventox', nombre: 'Beto Cheap', tipo_paquete: 'cheap', zona_boleto: 'Pista', hotel_tipo: null, boletos: 1, total_contrato: 1500, abonado_previo: 500, celular: null },
      { id: U(3), evento_id: 'multix#1', nombre: 'Ana Multi', tipo_paquete: 'plus', zona_boleto: 'Oro', hotel_tipo: 'Doble', boletos: 1, total_contrato: 6500, abonado_previo: 0, celular: null },
    ],
    abonos: [
      { id: U(101), viajero_id: U(1), monto: 300, fecha: '2026-10-20', foto_path: 'x/1.jpg' },
      { id: U(102), viajero_id: U(1), monto: 500, fecha: '2026-10-25', foto_path: null },
    ],
    reqs: [
      { id: U(201), folio: 'R-AAAAA', estado: 'pendiente', evento_id: 'multix#1', evento_nombre: 'Multi X', nombre: 'Ana', celular: '8990000000', correo: 'ana@x.mx', paquete: 'plus', zona: 'Oro', hotel: 'Doble', num_personas: 2, total_sistema: 13000, separo_sistema: 600, creado_en: '2026-11-04T00:00:00Z' },
    ],
  };
};

const llamar = async (archivo, b) => {
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  const H = require(path.join(RAIZ, 'netlify/functions/' + archivo)).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(b) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};

(async () => {
  const PP = require(path.join(RAIZ, 'netlify/functions/_lib/plan-pagos.js'));

  console.log('[A] plan_viajero por el handler real');
  semilla(); CATALOGO_OK = true;
  const a = await llamar('admin-coordi-asignaciones.js', { accion: 'plan_viajero', viajero_id: U(1) });
  af(a.s === 200 && a.j.ok !== false, 'contesta 200: ' + a.s + ' ' + (a.j.error || ''));
  af(a.j.total === 3000 && a.j.abonado === 800 && a.j.resta === 2200, () => 'total/pagado/falta = saldoMigrado (3000/800/2200): ' + [a.j.total, a.j.abonado, a.j.resta].join('/'));
  const dueno = PP.planDelViaje({ total: 3000, abonado: 800, ds: '2027-02-01', paquete: 'plus', diasAntes: null, ahora: new Date() });
  af(a.j.plan && JSON.stringify(a.j.plan) === JSON.stringify(dueno), 'el calendario ES el de planDelViaje (byte a byte con el dueño)');
  af(a.j.plan && a.j.plan.estado === 'calendario' && a.j.plan.cuotas.length > 0, () => 'trae cuotas: ' + (a.j.plan && a.j.plan.cuotas.length));
  af(a.j.evento && a.j.evento.fecha === '1 feb 2027' && a.j.evento.nombre === 'Evento X' && a.j.evento.venue === 'Arena Monterrey', () => 'evento con nombre/fecha/venue: ' + JSON.stringify(a.j.evento));
  af(a.j.banco && a.j.banco.clave === 'bbva' && /BBVA/.test(a.j.banco.nombre) && a.j.banco.clabe, 'PLUS paga en BBVA (con CLABE)');
  af(Array.isArray(a.j.abonos) && a.j.abonos.length === 2 && a.j.abonos.every((x) => !('foto_path' in x)), 'los abonos viajan sin el path del comprobante');
  const c2 = await llamar('admin-coordi-asignaciones.js', { accion: 'plan_viajero', viajero_id: U(2) });
  af(c2.j.banco && c2.j.banco.clave === 'banamex', 'CHEAP paga en Banamex (la regla del Portal)');
  af(c2.j.abonado === 500 && c2.j.abonado_previo === 500, 'lo pagado antes del sistema cuenta y viaja aparte');
  const m3 = await llamar('admin-coordi-asignaciones.js', { accion: 'plan_viajero', viajero_id: U(3) });
  af(m3.j.evento && m3.j.evento.fecha === '12 ene 2027' && m3.j.evento.ds === '2027-01-12', () => 'multifecha #1 → SOLO su fecha (12 ene): ' + JSON.stringify(m3.j.evento));
  af(ESCR.length === 0, () => 'CERO escrituras en todo el bloque: ' + ESCR.join(' | '));

  console.log('[B] catálogo ilegible');
  CATALOGO_OK = false;
  const b = await llamar('admin-coordi-asignaciones.js', { accion: 'plan_viajero', viajero_id: U(1) });
  af(b.s === 200 && b.j.plan === null && /catálogo/.test(b.j.plan_error || ''), () => 'plan null CON su motivo (no calendario vacío): ' + JSON.stringify({ plan: b.j.plan, e: b.j.plan_error }));
  af(b.j.total === 3000, 'el dinero sigue diciéndose aunque falte el calendario');
  CATALOGO_OK = true;

  console.log('[C] puertas');
  const c1 = await llamar('admin-coordi-asignaciones.js', { accion: 'plan_viajero', viajero_id: 'nope' });
  af(c1.s === 400, 'uuid inválido → 400');
  const c4 = await llamar('admin-coordi-asignaciones.js', { accion: 'plan_viajero', viajero_id: U(99) });
  af(c4.s === 404, 'viajero inexistente → 404');

  console.log('[D] la ficha de la requisición');
  const d = await llamar('admin-requisiciones.js', { accion: 'listar', estado: 'pendiente' });
  const rq = (d.j.requisiciones || [])[0] || {};
  af(d.s === 200 && rq.fecha_txt === '12 ene 2027', () => 'listar trae la fecha del #N, no las dos: ' + rq.fecha_txt);
  af(rq.venue_txt === 'Arena Monterrey', 'y el venue');
  const js = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  const ini = js.indexOf('function _reqFichaHtml'), fin = js.indexOf('function _reqBdjCard');
  const ctx = { khPaqueteTexto: (v) => String(v.tipo_paquete || '').toUpperCase(),
    _reqBdjEsc: (s) => String(s == null ? '' : s).replace(/</g, '&lt;'), _reqBdjMxn: (n) => '$' + Math.round(Number(n)).toLocaleString('en-US') };
  vm.createContext(ctx); vm.runInContext(js.slice(ini, fin), ctx);
  const html = vm.runInContext('_reqFichaHtml', ctx)(rq, 2);
  af(/12 ene 2027/.test(html) && /Arena Monterrey/.test(html), 'la tarjeta PINTA la fecha y el venue sin abrir la cotización');
  af(/PLUS/.test(html) && />Oro</.test(html) && />Doble</.test(html), 'y paquete · boleto · habitación con su rótulo');
  af(/2 personas/.test(html) && /\$6,500 por persona/.test(html), 'personas y el precio por persona');
  const sinF = vm.runInContext('_reqFichaHtml', ctx)(Object.assign({}, rq, { fecha_txt: null }), 1);
  af(/sin fecha en el catálogo/.test(sinF), 'sin fecha del servidor lo DICE (no adivina)');

  console.log('[E] la pantalla del plan no calcula');
  const kj = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const s0 = kj.indexOf('const _VJPLAN_ESTADO'), s1 = kj.indexOf('async function _vjPlanVer');
  const s2 = kj.indexOf('function _vjPlanTexto'), s3 = kj.indexOf('async function _vjPlanCopiar');
  const ctx2 = { khPaqueteTexto: (v) => String(v.tipo_paquete || '').toUpperCase(), _spFmtMxn: (n) => '$' + Number(n).toLocaleString('en-US') };
  vm.createContext(ctx2); vm.runInContext(kj.slice(s0, s1) + kj.slice(s2, s3), ctx2);
  const cuotas = vm.runInContext('_vjPlanCuotas', ctx2)(a.j);
  af(cuotas.length === dueno.cuotas.length && cuotas.every((q, i) => q.monto === dueno.cuotas[i].monto), 'las cuotas pintadas son EXACTAS las del servidor');
  const txt = vm.runInContext('_vjPlanTexto', ctx2)(a.j);
  af(/Laura/.test(txt) && /Te falta: \$2,200/.test(txt) && dueno.cuotas.every((q) => txt.includes('$' + q.monto.toLocaleString('en-US'))), 'el texto de WhatsApp dice nombre, lo que falta y cada pago');
  af(/CLABE 012822004639334319/.test(txt), 'y la cuenta donde paga');
  const cuerpo = kj.slice(kj.indexOf('async function _vjPlanVer'), kj.indexOf('function _vjPlanTexto'));
  af(!/quincenasEntre|Math\.ceil\(/.test(cuerpo), 'la pantalla no arma quincenas por su cuenta');
  af(/document\.querySelectorAll\('tr\[id\^="vj-ab-"\]'\)/.test(cuerpo), 'abre en el renglón plegable de siempre (un panel a la vez)');

  console.log('\n' + (V === 0 ? 'NADA MEDIDO · esto NO es un verde' : (R ? '🔴 ROJO' : '✅ VERDE')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
  process.exit(R || !V ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(1); });
