#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * mide-yamcha-ux-1 — YAMCHA-UX-1 · buscador + minimizar por evento (26-oct-2026)
 *
 * Palabra de Memo: «ponme un buscador en Derrota de Yamcha y poder minimizar la
 * lista por evento — tengo natanael y tito, minimizar uno para concentrarme en
 * el otro».
 *
 * ⚠️ SIN ANCLA a propósito: carga del ÁRBOL DE TRABAJO (como mide:baba-ux-2).
 * Las funciones REALES se rebanan de kamehouse-yamcha.js y corren en vm con un
 * DOM falso; el HTML que pintan es lo que se mide.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(RAIZ, 'kamehouse-yamcha.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');

let V = 0, R = 0;
function af(cond, msg) {
  let ok = false;
  try { ok = !!cond; } catch (e) { msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}
function funcionDe(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('══ mide-yamcha-ux-1 · buscador + minimizar por evento ══');

console.log('\n[A] piezas');
const FNS = ['_yamchaSt', '_yamchaNorm', 'yamchaBuscar', 'yamchaToggle', '_yamchaPintar'];
const cuerpos = FNS.map((n) => funcionDe(SRC, n));
af(cuerpos.every(Boolean), 'las 5 funciones se rebanan');
af(/id="yamcha-buscar"[^>]*oninput="yamchaBuscar\(this\.value\)"/.test(HTML), 'el buscador vive en la página y llama a yamchaBuscar');
af(/_yamchaPintar\(\);\s*\}\s*catch/.test(funcionDe(SRC, 'loadYamcha') || ''), 'loadYamcha delega el pintado en _yamchaPintar');

// DOM falso: la lista guarda su innerHTML; querySelector lee data-abierto del HTML pintado.
const lista = { innerHTML: '' };
const document = {
  getElementById: (id) => (id === 'yamcha-lista' ? lista : null),
  querySelector: (sel) => {
    const slug = (sel.match(/data-yamcha-grupo="([^"]+)"/) || [])[1];
    const m = new RegExp('data-yamcha-grupo="' + slug + '" data-abierto="(\\d)"').exec(lista.innerHTML);
    return m ? { dataset: { abierto: m[1] } } : null;
  },
};
const ctx = vm.createContext({
  document, window: {}, String, Number, Array, Set, console,
  CSS: { escape: (s) => s },
  _esfEsc: (s) => String(s == null ? '' : s),
  formatMXN: (n) => '$' + Number(n || 0).toLocaleString('en-US'),
});
cuerpos.forEach((c) => vm.runInContext(c, ctx));
const run = (code) => vm.runInContext(code, ctx);

ctx.window._yamchaRows = [
  { id: '1', evento_slug: 'natanael', evento_nombre: 'Natanael Cano', cliente_nombre: 'Ana López', monto: 5000, estado: 'pendiente' },
  { id: '2', evento_slug: 'natanael', evento_nombre: 'Natanael Cano', cliente_nombre: 'Beto Ruiz', monto: 3000, estado: 'transferido', datos_bancarios: 'Banorte 0721' },
  { id: '3', evento_slug: 'titodoble', evento_nombre: 'Tito Doble P', cliente_nombre: 'Daniela Hernández', monto: 2217, estado: 'transferido' },
  { id: '4', evento_slug: 'titodoble', evento_nombre: 'Tito Doble P', cliente_nombre: 'Leobardo Hernández', monto: 2217, estado: 'transferido' },
];
const abierto = (slug) => (new RegExp('data-yamcha-grupo="' + slug + '" data-abierto="(\\d)"').exec(lista.innerHTML) || [])[1];

console.log('\n[B] al abrir');
run('_yamchaPintar()');
af(abierto('natanael') === '1', 'un evento con pendientes nace ABIERTO');
af(abierto('titodoble') === '0', 'un evento TODO reembolsado nace MINIMIZADO');
af(/✓ Todo resuelto/.test(lista.innerHTML), 'y lo dice: «✓ Todo resuelto» (YAMCHA-TRASPASO-1: resuelto = transferido O traspasado)');
af(/1 pendiente\(s\) · \$5,000/.test(lista.innerHTML), 'el encabezado de natanael dice cuánto falta: 1 · $5,000');
af(!/Daniela/.test(lista.innerHTML), 'minimizado = su tabla no se pinta');

console.log('\n[C] minimizar y abrir a mano');
run("yamchaToggle('natanael')");
af(abierto('natanael') === '0', 'tocar natanael lo MINIMIZA');
run("yamchaToggle('titodoble')");
af(abierto('titodoble') === '1' && /Daniela/.test(lista.innerHTML), 'tocar tito (auto-minimizado) lo ABRE y pinta a Daniela');
run('_yamchaPintar()');
af(abierto('natanael') === '0' && abierto('titodoble') === '1', '🔒 recargar la lista (como tras marcar transferido) RESPETA lo que elegiste');

console.log('\n[D] buscador');
run("yamchaBuscar('hernandez')");
af(/Daniela/.test(lista.innerHTML) && /Leobardo/.test(lista.innerHTML), 'buscar «hernandez» (sin acento) encuentra a «Hernández»');
af(abierto('natanael') === undefined, 'el evento sin coincidencias se esconde entero');
run("yamchaToggle('titodoble')");
af(abierto('titodoble') === '1', '🔒 buscando, el evento con resultados queda ABIERTO aunque lo hayas minimizado (si no, el resultado se escondería)');
run("yamchaBuscar('banorte')");
af(/Beto Ruiz/.test(lista.innerHTML) && !/Ana López/.test(lista.innerHTML), 'busca también en datos bancarios y filtra filas: Beto sí, Ana no');
af(/Mostrando 1 de 2/.test(lista.innerHTML), 'dice cuántas filas esconde la búsqueda');
af(/1 pendiente\(s\) · \$5,000/.test(lista.innerHTML), '🔒 el encabezado sigue contando TODO el evento (buscar esconde filas, no cambia la deuda)');
run("yamchaBuscar('zzz')");
af(/Nadie coincide/.test(lista.innerHTML), 'sin resultados lo dice, no deja la pantalla en blanco');
run("yamchaBuscar('')");
af(abierto('natanael') === '0' && abierto('titodoble') === '0', 'al borrar la búsqueda vuelve lo que habías minimizado');

console.log('\n[E] YAMCHA-UX-2 · pendientes arriba, transferidos abajo');
ctx.window._yamchaRows = [
  { id: 'a', evento_slug: 'x', evento_nombre: 'X', cliente_nombre: 'T1 transferido', monto: 1, estado: 'transferido', cliente_correo: 't1@x.com' },
  { id: 'b', evento_slug: 'x', evento_nombre: 'X', cliente_nombre: 'P1 pendiente', monto: 1, estado: 'pendiente' },
  { id: 'c', evento_slug: 'x', evento_nombre: 'X', cliente_nombre: 'T2 transferido', monto: 1, estado: 'transferido' },
  { id: 'd', evento_slug: 'x', evento_nombre: 'X', cliente_nombre: 'P2 pendiente', monto: 1, estado: 'pendiente' },
];
run('_yamchaPintar()');
const orden = [...lista.innerHTML.matchAll(/(P\d|T\d) (pendiente|transferido)<\/div>/g)].map((m) => m[1]);
af(JSON.stringify(orden) === JSON.stringify(['P1', 'P2', 'T1', 'T2']),
   'orden P1,P2,T1,T2 — pendientes arriba y el orden de llegada se conserva dentro de cada bloque: ' + JSON.stringify(orden));
af((lista.innerHTML.match(/Reenviar aviso/g) || []).length === 1,
   '«Reenviar aviso» solo en el transferido CON correo (T1), no en T2 sin correo ni en pendientes');

(async () => {
  console.log('\n[F] el handler real: reenviar_correo no toca dinero');
  const Module = require('module');
  const H = path.join(RAIZ, 'netlify/functions/admin-reembolsos.js');
  const fila = { evento_slug: 'titodoble', evento_nombre: 'Tito', cliente_nombre: 'Ana', cliente_correo: 'ana@x.com', monto: 300, estado: 'transferido', datos_bancarios: 'BBVA 012180015059151298' };
  const llamadas = [];
  global.fetch = async (url, init = {}) => {
    llamadas.push({ url: String(url), m: init.method || 'GET' });
    if (/api\.resend\.com/.test(url)) return { ok: true, json: async () => ({ id: 'x' }), text: async () => '' };
    return { ok: true, json: async () => [fila], text: async () => '' };
  };
  Object.assign(process.env, { SUPABASE_URL_KAMEHOUSE: 'https://kh', SUPABASE_SERVICE_KEY_KAMEHOUSE: 'k', PORTAL_SUPABASE_URL: 'https://po', PORTAL_SUPABASE_SERVICE_KEY: 'k', RESEND_KEY: 'r' });
  const va = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin'));
  va.verifyAdminAuthLive = async () => ({ valid: true });
  va.corsCheck = () => 'https://conectareynosa.mx';
  delete require.cache[H];
  const { handler } = require(H);
  const ev = (body) => ({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) });
  const ID = '11111111-1111-1111-1111-111111111111';
  let res = await handler(ev({ accion: 'reenviar_correo', id: ID }));
  af(res.statusCode === 200, 'transferido con correo → 200');
  af(llamadas.filter((l) => /resend/.test(l.url)).length === 1, 'sale exactamente UN correo');
  af(!llamadas.some((l) => l.m !== 'GET' && !/resend/.test(l.url)), '🔒 cero escrituras a la base (ni PATCH ni gasto) — solo el correo');
  llamadas.length = 0; fila.estado = 'pendiente';
  res = await handler(ev({ accion: 'reenviar_correo', id: ID }));
  af(res.statusCode === 409 && !llamadas.some((l) => /resend/.test(l.url)), '🔒 un PENDIENTE se rechaza (409) y no sale correo: no se le dice «ya te transferimos» a quien no ha recibido nada');
  fila.estado = 'transferido'; fila.cliente_correo = null; llamadas.length = 0;
  res = await handler(ev({ accion: 'reenviar_correo', id: ID }));
  af(res.statusCode === 400 && !llamadas.some((l) => /resend/.test(l.url)), 'sin correo → 400 y no sale nada');

  console.log('\n[G] YAMCHA-TRASPASO-1 · «Pasar a otro tour» por el handler real');
  const CI = path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js');
  require(CI).fetchEventosRaw = async () => [
    { id: 'palnorte', a: "Tecate Pa'l Norte 2027", ds: '2027-03-26', cheapOnly: true, cheapZonas: [{ n: 'Preventa a ciegas', p: 300 }] },
    { id: 'omar', a: 'Omar Courtz', ds: '2027-01-20', zonas: [{ n: 'General A', p: 3000 }], cheapZonas: [{ n: 'General A', p: 2000 }] },
    { id: 'viejo', a: 'Ya pasó', ds: '2020-01-01' },
  ];
  delete require.cache[H];
  const h2 = require(H).handler;
  const VID = '22222222-2222-2222-2222-222222222222';
  let rbRow, vRow, escrituras, fallaViajero;
  const sembrar = () => {
    rbRow = { id: ID, evento_slug: 'titodoble', evento_nombre: 'Tito', cliente_nombre: 'Jorge', monto: 3050, estado: 'pendiente', gasto_id: null, notas: 'CANCEL-1 · Viajero ' + VID };
    vRow = { id: VID, evento_id: 'titodoble', nombre: 'Jorge', total_contrato: 5800, abonado_previo: 300, notas: null };
    escrituras = []; fallaViajero = false;
  };
  global.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || 'GET';
    const j = (x) => ({ ok: true, json: async () => x, text: async () => '' });
    if (m !== 'GET') escrituras.push({ u, m, b: init.body ? JSON.parse(init.body) : null });
    if (/viajeros_evento/.test(u)) {
      if (m === 'GET') return j([vRow]);
      if (fallaViajero) return j([]);
      if (!u.includes('evento_id=eq.' + vRow.evento_id)) return j([]);
      Object.assign(vRow, JSON.parse(init.body)); return j([vRow]);
    }
    if (/abonos_viajero/.test(u)) return j([{ monto: 2750 }]);
    if (/reembolsos/.test(u)) {
      if (m === 'GET') return j([rbRow]);
      const want = (u.match(/estado=eq\.(\w+)/) || [])[1];
      if (want && rbRow.estado !== want) return j([]);
      Object.assign(rbRow, JSON.parse(init.body)); return j([rbRow]);
    }
    return j([]);
  };
  sembrar();
  res = await h2(ev({ accion: 'traspasar', id: ID, destino: 'palnorte' }));
  const d = JSON.parse(res.body);
  af(res.statusCode === 200, 'traspasar a palnorte → 200 · ' + res.body.slice(0, 120));
  af(vRow.evento_id === 'palnorte' && vRow.tipo_paquete === 'CHEAP' && vRow.zona_boleto === 'Preventa a ciegas',
     'el viajero se MUDÓ a palnorte como CHEAP · Preventa a ciegas (la zona única se pone sola)');
  af(vRow.total_contrato === 3050 && d.cobrado === 3050, '🔒 contrato A: total = lo COBRADO (300 previo + 2,750 abonos = $3,050) → saldo 0');
  af(rbRow.estado === 'traspasado' && /\[TRASPASO→palnorte\]/.test(rbRow.notas), 'el reembolso queda «traspasado» y su nota dice a dónde');
  af(!escrituras.some((w) => /gastos/.test(w.u)) && !escrituras.some((w) => w.m === 'DELETE'), '🔒 CERO gasto y CERO DELETEs: la caja no se mueve');
  af(escrituras.every((w) => !/abonos_viajero/.test(w.u)), '🔒 los abonos NO se tocan: viajan solos con el viajero');
  af(vRow.habitacion_id === null && vRow.grupo_viaje === null, 'la habitación y el grupo del tour cancelado se sueltan');
  res = await h2(ev({ accion: 'traspasar', id: ID, destino: 'palnorte' }));
  af(res.statusCode === 409, '🔒 el segundo clic → 409 (ya no está pendiente): no se mueve dos veces');

  sembrar();
  res = await h2(ev({ accion: 'traspasar', id: ID, destino: 'omar' }));
  af(res.statusCode === 400 && rbRow.estado === 'pendiente', 'un destino con varias zonas sin paquete/zona → 400 y nada se escribe');
  res = await h2(ev({ accion: 'traspasar', id: ID, destino: 'omar', paquete: 'PLUS', zona: 'general a' }));
  af(res.statusCode === 200 && vRow.zona_boleto === 'General A', 'con paquete+zona elegidos entra, con la ortografía de la FICHA');
  sembrar();
  res = await h2(ev({ accion: 'traspasar', id: ID, destino: 'viejo' }));
  af(res.statusCode === 400 && rbRow.estado === 'pendiente', 'un tour que ya pasó se rechaza');
  sembrar(); fallaViajero = true;
  res = await h2(ev({ accion: 'traspasar', id: ID, destino: 'palnorte' }));
  af(res.statusCode === 502 && rbRow.estado === 'pendiente' && vRow.evento_id === 'titodoble',
     '🔒 si el viajero no se puede mover, el reembolso VUELVE a pendiente — nada a medias');
  sembrar(); rbRow.estado = 'transferido';
  res = await h2(ev({ accion: 'traspasar', id: ID, destino: 'palnorte' }));
  af(res.statusCode === 409 && vRow.evento_id === 'titodoble', 'un reembolso YA transferido no se traspasa (el dinero ya salió)');
  fin();
})();
function fin() {
console.log('\n══ RESULTADO ══');
if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
process.exit(R ? 1 : 0);
}
