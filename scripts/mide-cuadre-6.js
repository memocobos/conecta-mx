#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-cuadre-6.js — CUADRE-6 · la columna «Avión - Bus» y la exclusión que
// encoge
//
// Regla de Memo (24-sep-2026): «hay una columna de vuelos en el Excel con el
// costo; intentemos cuadrar con eso».
//
// 🔒 LOS DOS LADOS SON COMMITS: cada árbol sale con `git archive` y el handler
// se REQUIERE de ahí. Commitear exige RE-ANCLAR.
//
// 🔒 SE ENTRA POR EL HANDLER REAL y se simula UN SALTO MÁS ADENTRO (el Apps
// Script del Excel y PostgREST). Un mock por ruta salta al portero.
//
// 🔒 LOS ENCABEZADOS NO SON INVENTADOS. Salen de la medición de CUADRE-1a
// (20-sep, ocho pestañas reales por `_lib/cosecha-excel` contra el Apps Script
// de producción) y traen «Avión - Bus» donde de verdad está: columna **19** en
// el molde de Young Miko y **20** en el de Bruno —que lleva una vacía de más—.
// Jane lo remidió el 25-sep sobre 4 pestañas de CDMX: 19 en EDC/Corona, 20 en
// Bruno/Knotfest. **La columna se localiza por el LITERAL, jamás por índice.**
//
// 🔒 LA SUMA NO SE RE-IMPLEMENTA AQUÍ. El careo no calcula «catálogo + vuelo»
// para compararlo consigo mismo: le pregunta al DUEÑO por separado, lee el
// vuelo de la CELDA SERVIDA, y carea las dos patas contra lo que el runner
// imprime. Si el arnés repitiera la cuenta del runner, los dos podrían estar
// igual de equivocados.
//
// Se corre:  npm run mide:cuadre-6
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0, completo = false;
const fallos = [];
function af(c, e) {
  let v = false;
  try { v = (typeof c === 'function') ? !!c() : !!c; }
  catch (x) { v = false; e = e + '  [EXCEPCIÓN: ' + x.message + ']'; }
  if (v) ok++; else { mal++; fallos.push(e); console.log('   ✗ ' + e); }
}
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  console.log((mal ? '❌ ROJO · ' : '✅ VERDE · ') + ok + ' en verde, ' + mal + ' en rojo');
  fallos.slice(0, 16).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || 'd4d1185';
const HEAD_SHA = process.env.HEAD_SHA || '2f026eb';

// ── LOS ENCABEZADOS REALES, ENTEROS ─────────────────────────────────────
// Recortarlos a «las columnas que me importan» es fabricar una pestaña que no
// existe, y el hoyo del separo sin encabezado (29-ago) nació de mirar de menos.
const CAB_19 = ['No.','Nombre','Paquete','Boleto','Separo','1','2','3','4','5','6','7','8','9','10',
  'Preventa','Costo','Habitación','Pago Hab','Avión - Bus','Codigo','Total','Abonado','Resta','TALLA',
  'CORREO','CELULAR','EMERGENCIA','HABITACION COMPARTIDA CON','','','','','Luneta','$0','','Stay',''];
// El molde de Bruno/Knotfest: una vacía de más antes de «Preventa» empuja todo
// una columna. Por eso el índice NO es estable y la búsqueda va por literal.
const CAB_20 = ['No.','Nombre','Paquete','Boleto','Separo','1','2','3','4','5','6','7','8','9','10',
  '','Preventa','Costo','Habitación','Pago Hab','Avión - Bus','Codigo','Total','Abonado','Resta','TALLA',
  'CORREO','CELULAR','EMERGENCIA','HABITACION COMPARTIDA CON','','','','','Luneta','$0','','Stay',''];
// La misma cabecera SIN la columna del vuelo: el caso de la columna ausente.
const CAB_SIN_VUELO = CAB_19.map((c) => (c === 'Avión - Bus' ? 'Otro dato' : c));

function filaExcel(cab, valores) {
  const f = new Array(cab.length).fill('');
  for (const [col, v] of Object.entries(valores)) {
    const i = cab.indexOf(col);
    if (i < 0) throw new Error('el fixture nombra una columna que la cabecera no tiene: ' + col);
    f[i] = v;
  }
  return f;
}
const conPreludio = (cab, filas) => [...Array.from({ length: 10 }, () => ['', '', '']), cab, ...filas];
// Lee una celda de la pestaña SERVIDA por el LITERAL de su encabezado. Es la
// fuente independiente del monto del vuelo: así el careo no repite la cuenta
// del runner, la carea contra el dato que de verdad se sirvió.
function celdaServida(filas, encabezado, nombreFila, columna) {
  const cab = filas[10];
  const i = cab.indexOf(columna);
  if (i < 0) return null;
  const f = filas.slice(11).find((x) => String(x[cab.indexOf('Nombre')] || '').trim() === nombreFila);
  return f ? f[i] : null;
}
const dinero = (s) => Number(String(s == null ? '' : s).replace(/[^0-9.-]/g, '')) || 0;

// ── LA SEMILLA · cada persona es un caso de la regla nueva ─────────────
// El evento es `edc27`: CDMX de verdad, en el catálogo REAL del repo.
// 🔴 Los tres montos de KNOTFEST son los que Jane midió el 25-sep en la
// pestaña real ($4,900 · $3,385 · $2,500). Son el CONTROL POSITIVO del
// instrumento: si la cosecha encuentra CERO montos, el problema es el arnés.
const KNOT_MONTOS = [4900, 3385, 2500];
const PESTANA_19 = conPreludio(CAB_19, [
  // CDMX + PLUS + $0 tecleado + CON vuelo → ENTRA por CUADRE-6.
  filaExcel(CAB_19, { Nombre: 'Ana Volo', Paquete: 'PLUS', Boleto: 'General', Total: '$0', 'Avión - Bus': '$3,000' }),
  // CDMX + PLUS + $0 + vuelo en $0 TECLEADO → sigue FUERA, motivo propio.
  filaExcel(CAB_19, { Nombre: 'Beto Cero', Paquete: 'PLUS', Boleto: 'General', Total: '$0', 'Avión - Bus': '$0' }),
  // CDMX + PLUS + $0 + celda de vuelo VACÍA → sigue FUERA, otro motivo.
  filaExcel(CAB_19, { Nombre: 'Caro Vacia', Paquete: 'PLUS', Boleto: 'General', Total: '$0' }),
  // CDMX + CHEAP + $0 → ya entraba desde CUADRE-5, por el catálogo.
  filaExcel(CAB_19, { Nombre: 'Delia Cheap', Paquete: 'CHEAP', Boleto: 'General', Total: '$0' }),
  // CDMX + RIDE + $0 + CON vuelo → el total del sistema YA es el transporte.
  filaExcel(CAB_19, { Nombre: 'Efra Ride', Paquete: 'RIDE', Boleto: 'General', Total: '$0', 'Avión - Bus': '$4,900' }),
  // Un GRUPO: dos filas de la misma persona, cada una con su vuelo por persona.
  // ⚠️ LAS DOS FILAS CON SU `$0` TECLEADO. Mi primera versión dejó el Total de
  // la segunda VACÍO, y eso vuelve `total: null` a la persona entera — así que
  // `carear` la saltaba (`if (p.total == null) continue`) y Fanny no llegaba al
  // montón: cuatro rojos sobre código sano. El hueco del total es OTRO caso, y
  // tiene su propia persona abajo.
  filaExcel(CAB_19, { Nombre: 'Fanny Grupo', Paquete: 'PLUS', Boleto: 'General', Total: '$0', 'Avión - Bus': '$2,500' }),
  filaExcel(CAB_19, { Nombre: 'Fanny Grupo', Paquete: 'PLUS', Boleto: 'General', Total: '$0', 'Avión - Bus': '$2,500' }),
  // El hueco de UNA columna no contamina a la otra: Total vacío → `total: null`
  // (y por eso no llega al montón), pero su vuelo se cosecha igual.
  filaExcel(CAB_19, { Nombre: 'Gina Hueco', Paquete: 'PLUS', Boleto: 'General', Total: '', 'Avión - Bus': '$1,700' }),
]);
// La MISMA gente en el molde de la columna 20: el literal tiene que encontrarla
// igual. Si el careo solo midiera un molde, un índice fijo pasaría.
const PESTANA_20 = conPreludio(CAB_20, [
  filaExcel(CAB_20, { Nombre: 'Ana Volo', Paquete: 'PLUS', Boleto: 'General', Total: '$0', 'Avión - Bus': '$3,000' }),
]);
// Knotfest, con los tres montos REALES que midió Jane.
const PESTANA_KNOT = conPreludio(CAB_20, KNOT_MONTOS.map((m, i) => filaExcel(CAB_20, {
  Nombre: 'Knot ' + (i + 1), Paquete: 'PLUS', Boleto: 'General', Total: '$0', 'Avión - Bus': '$' + m.toLocaleString('en-US'),
})));
const PESTANA_SIN_VUELO = conPreludio(CAB_SIN_VUELO, [
  filaExcel(CAB_SIN_VUELO, { Nombre: 'Ana Volo', Paquete: 'PLUS', Boleto: 'General', Total: '$0' }),
]);

const NOMBRES = ['Ana Volo', 'Beto Cero', 'Caro Vacia', 'Delia Cheap', 'Efra Ride', 'Fanny Grupo', 'Gina Hueco', 'Knot 1', 'Knot 2', 'Knot 3'];
// El lado del sistema: todos DERIVADOS (la regla lo exige) y con el total en 0
// —el caso «pendiente» que el runner pisa con el precio vivo—.
// ⚠️ LOS NOMBRES DE LA BASE FALSA SE LEYERON DEL CÓDIGO DE LA OTRA PUNTA, no
// de mi memoria — y me costó la primera corrida entera: sembré `excel_mapeos`
// con `activo`, y el runner consulta **`excel_pestanas`** con **`activa`**. El
// handler contestó `SIN_MAPEO` y el arnés se cayó con 7 rojos que no eran del
// código. Es la cuarta forma en que un mock miente: **inventa nombres**.
const BASE_DB = {
  excel_pestanas: [{ evento_id: 'edc27', pestana: 'P', regla_zona: null, activa: true, notas: null }],
  viajeros_evento: NOMBRES.map((n, i) => ({
    id: 'v' + i, evento_id: 'edc27', nombre: n, tipo_viajero: 'cliente',
    abonado_previo: 0, total_contrato: 0,
    // `esDerivado` mira las notas: la regla del $0 solo cubre los DERIVADOS.
    notas: 'TOTAL-1: contrato derivado del catálogo (se afina contra la pestaña)',
    zona_boleto: 'General', tipo_paquete: 'PLUS',
  })),
  stock_ajustes: [],
};

function armarRed(dir, { pestanas, catalogo = true, saboteado = false }) {
  const escrituras = [];
  const SB = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
  const INDEX = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const proyectar = (filas, qs) => {
    const sel = qs.get('select');
    if (!sel || sel === '*') return filas;
    const cols = sel.split(',').map((c) => c.trim()).filter(Boolean);
    return filas.map((f) => Object.fromEntries(cols.filter((c) => c in f).map((c) => [c, f[c]])));
  };
  const filtrar = (filas, qs) => {
    let out = filas;
    for (const [campo, expr] of qs.entries()) {
      if (['select', 'limit', 'order', 'or'].includes(campo)) continue;
      let m;
      if ((m = /^eq\.(.*)$/.exec(expr))) { out = out.filter((f) => String(f[campo]) === m[1]); continue; }
      if ((m = /^is\.(.*)$/.exec(expr))) { const v = m[1] === 'true' ? true : m[1] === 'false' ? false : null; out = out.filter((f) => f[campo] === v); continue; }
      if ((m = /^in\.\((.*)\)$/.exec(expr))) {
        const vals = m[1].split(',').map((v) => decodeURIComponent(v).replace(/^"|"$/g, ''));
        out = out.filter((f) => vals.includes(String(f[campo]))); continue;
      }
      throw new Error('la red falsa no entiende el filtro: ' + campo + '=' + expr);
    }
    return out;
  };
  return { escrituras, fetchFalso: async (url, opts) => {
    const met = (opts && opts.method) || 'GET';
    if (/\/index\.html$/.test(String(url))) {
      if (!catalogo) throw new Error('la red falsa no sirve el catálogo en este escenario');
      return { ok: true, status: 200, text: async () => INDEX, json: async () => ({}) };
    }
    if (String(url).startsWith('https://script.test')) {
      const cuerpo = JSON.parse(opts.body);
      const filas = pestanas[cuerpo.pestana];
      if (!cuerpo.pestana) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, pestanas: Object.keys(pestanas) }) };
      if (!filas) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, codigo: 'SIN_PESTANA', error: 'no existe' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, filas, pestanas: Object.keys(pestanas) }) };
    }
    if (String(url).startsWith(SB)) {
      const u = new URL(url);
      const tabla = u.pathname.replace('/rest/v1/', '');
      if (met !== 'GET') { escrituras.push({ tabla, met }); return { ok: true, status: 201, json: async () => [], text: async () => '' }; }
      if (saboteado && tabla === 'viajeros_evento') escrituras.push({ tabla, met: 'PATCH' });
      return { ok: true, status: 200, json: async () => proyectar(filtrar(BASE_DB[tabla] || [], u.searchParams), u.searchParams), text: async () => '' };
    }
    throw new Error('la red falsa no conoce ese destino: ' + url);
  } };
}
async function correr(dir, opciones) {
  const red = armarRed(dir, opciones);
  process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec';
  process.env.EXCEL_SCRIPT_TOKEN = 't';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  process.env.URL = 'https://conectareynosa.mx';
  delete process.env.DEPLOY_PRIME_URL;
  global.fetch = red.fetchFalso;
  const va = require.resolve(path.join(dir, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async (ev, roles) => ({ valid: true, roles, user: { id: 'u1', correo: 'bulma@x' } }),
  } };
  // 🔒 `catalogo-index` CACHEA el EV 10 minutos a nivel de módulo: sin este
  // borrado el primer escenario que sirva el catálogo se lo REGALA a los demás
  // y el ORDEN de las corridas decidiría el resultado.
  for (const f of ['admin-excel-careo.js', '_lib/excel-careo.js', '_lib/cosecha-excel.js',
                   '_lib/excel-careo-correr.js', '_lib/catalogo-index.js', '_lib/precio-zona.js']) {
    try { delete require.cache[require.resolve(path.join(dir, 'netlify/functions', f))]; } catch (_) {}
  }
  const mod = require(path.join(dir, 'netlify/functions/admin-excel-careo.js'));
  const res = await mod.handler({
    httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
    body: JSON.stringify({ evento_id: 'edc27' }),
  });
  return { res, d: JSON.parse(res.body || '{}'), escrituras: red.escrituras };
}
// ⚠️ LA FORMA DE LA RESPUESTA SE LEYÓ DEL HANDLER, no de mi memoria: esparce
// los montones al TOPE (`...r`), no bajo `montones`, y de las personas devuelve
// **solo el conteo** (`excel:{personas:N}`) — la lista no viaja. Mi primera
// versión leía `d.montones.*` y `d.personas`, y dio 28 rojos con el código sano.
const dePila = (d, nombre) => ((d && d.totales_cero_regla) || []).find((x) => x.nombre === nombre);

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'c6-base'), h = sacar(HEAD_SHA, 'c6-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }

  // ── [I] EL INSTRUMENTO · el control positivo de Knotfest ──────────────
  // 🔴 Si la cosecha encuentra CERO montos de vuelo, el problema es el arnés y
  // no el código: todo lo de abajo pasaría en vacío.
  console.log('[I] el instrumento · los montos REALES de Knotfest');
  const rKnot = await correr(h.dir, { pestanas: { P: PESTANA_KNOT } });
  af(rKnot.res.statusCode === 200 && rKnot.d.ok !== false, 'el careo no contestó 200/ok: ' + rKnot.res.body.slice(0, 200));
  // La cosecha se le pregunta a SU DUEÑO (`parsearPestana` del lib del árbol
  // de HEAD), sobre la MISMA rejilla que la red falsa sirvió: la respuesta del
  // handler no lleva la lista de personas, solo su conteo.
  const { parsearPestana } = require(path.join(h.dir, 'netlify/functions/_lib/excel-careo.js'));
  const cosechaDe = (rejilla) => parsearPestana(rejilla, { fila: 10 }, null);
  const knotP = cosechaDe(PESTANA_KNOT);
  const knotVuelos = KNOT_MONTOS.map((m, i) => {
    const p = knotP.personas.find((x) => x.nombre === 'Knot ' + (i + 1));
    return p ? p.vuelo : null;
  });
  console.log('    la columna se localizó en el índice ' + knotP.mapa.avionBus + ' (molde de Bruno/Knotfest: 20)');
  af(knotP.mapa.avionBus === 20,
     'la columna del vuelo no se localizó donde Jane la midió en el molde de Knotfest (20): '
     + knotP.mapa.avionBus);
  console.log('    cosechados: ' + JSON.stringify(knotVuelos) + '   esperados: ' + JSON.stringify(KNOT_MONTOS));
  af(knotVuelos.filter((v) => Number(v) > 0).length === 3,
     '🔴 CONTROL POSITIVO DEL INSTRUMENTO: la cosecha encontró ' + knotVuelos.filter((v) => Number(v) > 0).length
     + ' montos de vuelo de los 3 que Jane midió en Knotfest ($4,900/$3,385/$2,500). Con cero, todo lo de '
     + 'abajo pasaría en vacío. Salió ' + JSON.stringify(knotVuelos));
  af(JSON.stringify(knotVuelos) === JSON.stringify(KNOT_MONTOS),
     'los montos cosechados no son los medidos: ' + JSON.stringify(knotVuelos) + ' vs ' + JSON.stringify(KNOT_MONTOS));

  // ── [C] LA COLUMNA, POR LITERAL Y NO POR ÍNDICE ───────────────────────
  console.log('\n[C] la columna se localiza por el literal');
  const r19 = await correr(h.dir, { pestanas: { P: PESTANA_19 } });
  const r20 = await correr(h.dir, { pestanas: { P: PESTANA_20 } });
  const rSin = await correr(h.dir, { pestanas: { P: PESTANA_SIN_VUELO } });
  const c19 = cosechaDe(PESTANA_19), c20 = cosechaDe(PESTANA_20), cSin = cosechaDe(PESTANA_SIN_VUELO);
  const buscar = (c, n) => c.personas.find((x) => x.nombre === n);
  const a19 = buscar(c19, 'Ana Volo'), a20 = buscar(c20, 'Ana Volo'), aSin = buscar(cSin, 'Ana Volo');
  console.log('    índices localizados por el literal: molde A ' + c19.mapa.avionBus
    + ' · molde B ' + c20.mapa.avionBus + ' · sin la columna ' + cSin.mapa.avionBus);
  af(c19.mapa.avionBus === 19 && c20.mapa.avionBus === 20,
     'la columna no se localizó en los DOS moldes (19 y 20): ' + JSON.stringify([c19.mapa.avionBus, c20.mapa.avionBus])
     + '. Si los dos dieran el mismo número, un índice fijo pasaría y el careo no lo notaría');
  af(cSin.mapa.avionBus === -1, 'sin el literal la columna tiene que salir en -1: ' + cSin.mapa.avionBus);
  console.log('    molde col 19 → vuelo ' + JSON.stringify(a19 && a19.vuelo)
    + '   ·   molde col 20 → vuelo ' + JSON.stringify(a20 && a20.vuelo)
    + '   ·   sin la columna → vuelo ' + JSON.stringify(aSin && aSin.vuelo));
  af(a19 && Number(a19.vuelo) === 3000, 'en el molde de la columna 19 el vuelo no se cosechó: ' + JSON.stringify(a19 && a19.vuelo));
  af(a20 && Number(a20.vuelo) === 3000,
     'en el molde de la columna 20 el vuelo no se cosechó: la posición NO es estable entre pestañas (19 en '
     + 'EDC/Corona, 20 en Bruno/Knotfest) y un índice fijo habría leído «Código». Salió '
     + JSON.stringify(a20 && a20.vuelo));
  // 🔒 LA COLUMNA AUSENTE ES `null`, NO CERO. Confundirlas taparía el hueco.
  af(aSin && aSin.vuelo === null,
     'sin la columna del vuelo, la persona tiene que salir con `vuelo: null` (no se sabe) y no con 0: '
     + JSON.stringify(aSin && aSin.vuelo));
  // Y el vuelo NO se cuela al abonado: `mapa.dinero` no lo lleva.
  af(a19 && Number(a19.abonado) === 0,
     '🔴 el vuelo se sumó al ABONADO (' + (a19 && a19.abonado) + '): ahí viven las columnas que se suman '
     + 'para lo pagado, y meterlo inflaría el abonado de todo el mundo');

  // ── [R] LA EXCLUSIÓN DE CDMX ENCOGE, y no de más ──────────────────────
  console.log('\n[R] la regla, caso por caso');
  const d = r19.d;
  af(d && d.cuadre5 && Array.isArray(d.totales_cero_regla),
     'la corrida del molde 19 no trajo los montones: ' + String(r19.res.body).slice(0, 220));
  const c6 = (d && d.cuadre5) || {};
  const filaDe = (n) => dePila(d, n);
  for (const [nombre, entra, porque] of [
    ['Ana Volo', true, 'CDMX + PLUS + $0 CON vuelo → entra por CUADRE-6'],
    ['Delia Cheap', true, 'CHEAP → ya entraba desde CUADRE-5'],
    ['Beto Cero', false, 'vuelo en $0 TECLEADO → sigue fuera'],
    ['Caro Vacia', false, 'celda de vuelo vacía → sigue fuera'],
  ]) {
    const f = filaDe(nombre);
    console.log('    ' + nombre.padEnd(13) + (f ? 'EN LA REGLA (clase ' + f.clase + ')' : 'fuera') + '   — ' + porque);
    af(!!f === entra, nombre + ': tenía que ' + (entra ? 'ENTRAR' : 'quedarse FUERA') + ' — ' + porque);
  }
  af(filaDe('Ana Volo') && filaDe('Ana Volo').clase === 'cdmx_con_vuelo',
     'el renglón que entra por su vuelo no trae la clase que lo dice: el runner la necesita para saber si '
     + 'suma el vuelo, y sin ella tendría que volver a preguntarse si el evento es de CDMX');
  af(filaDe('Delia Cheap') && filaDe('Delia Cheap').clase !== 'cdmx_con_vuelo',
     'el CHEAP salió marcado como «entra por su vuelo», y entra por el catálogo');

  // ── [S] EL TOTAL LO ARMA EL RUNNER · las dos patas, por separado ──────
  // 🔒 El careo NO calcula «catálogo + vuelo» para compararlo consigo mismo: le
  // pregunta al DUEÑO por su lado, lee el vuelo de la CELDA SERVIDA por su
  // lado, y carea las dos contra lo que el runner imprimió.
  console.log('\n[S] el total, careado contra sus dos fuentes independientes');
  global.fetch = async (url) => {
    if (/\/index\.html$/.test(String(url))) return { ok: true, status: 200, text: async () => fs.readFileSync(path.join(h.dir, 'index.html'), 'utf8'), json: async () => ({}) };
    throw new Error('la red falsa de [S] solo sirve el index: ' + url);
  };
  for (const f of ['_lib/catalogo-index.js', '_lib/precio-zona.js']) {
    try { delete require.cache[require.resolve(path.join(h.dir, 'netlify/functions', f))]; } catch (_) {}
  }
  const { resolverPrecioVenta } = require(path.join(h.dir, 'netlify/functions/_lib/precio-zona.js'));
  const dueno1 = await resolverPrecioVenta({ evento_id: 'edc27', paquete: 'PLUS', zona: 'General', num_personas: 1, para_careo: true });
  const vueloServido = dinero(celdaServida(PESTANA_19, 10, 'Ana Volo', 'Avión - Bus'));
  const fAna = filaDe('Ana Volo');
  console.log('    dueño (por separado) ' + dueno1.total + '  ·  vuelo de la celda servida ' + vueloServido
    + '  ·  el runner imprimió ' + (fAna && fAna.sistema_total) + ' (origen ' + (fAna && fAna.sistema_total_origen) + ')');
  af(dueno1 && dueno1.ok && Number(dueno1.total) > 0,
     'el dueño no dio precio para el caso base: sin eso las patas de abajo no se pueden carear');
  af(vueloServido === 3000, 'la celda servida no trae el vuelo que se sembró: ' + vueloServido);
  af(fAna && fAna.sistema_total_origen === 'catalogo_mas_vuelo',
     'el renglón no dice que su total sale del catálogo MÁS el vuelo: ' + JSON.stringify(fAna && fAna.sistema_total_origen));
  af(fAna && Number(fAna.sistema_total_catalogo) === Number(dueno1.total),
     'la pata del catálogo no es la que contesta el dueño preguntado por separado: '
     + (fAna && fAna.sistema_total_catalogo) + ' vs ' + dueno1.total);
  af(fAna && Number(fAna.sistema_total_vuelo) === vueloServido,
     'la pata del vuelo no es el monto de la celda SERVIDA: ' + (fAna && fAna.sistema_total_vuelo) + ' vs ' + vueloServido);
  af(fAna && Number(fAna.sistema_total) === Number(dueno1.total) + vueloServido,
     'el total impreso no es la suma de sus dos patas: ' + (fAna && fAna.sistema_total) + ' vs '
     + (Number(dueno1.total) + vueloServido));
  // 🔒 Y EL GRUPO: dos filas, dos vuelos por persona, y el total del grupo se
  // le pide al dueño con `num_personas: 2` — no se multiplica aquí.
  const dueno2 = await resolverPrecioVenta({ evento_id: 'edc27', paquete: 'PLUS', zona: 'General', num_personas: 2, para_careo: true });
  const fFan = filaDe('Fanny Grupo');
  console.log('    grupo de 2 → dueño ' + dueno2.total + ' + vuelo ' + (fFan && fFan.sistema_total_vuelo)
    + ' = ' + (fFan && fFan.sistema_total) + '  (boletos ' + (fFan && fFan.sistema_total_boletos) + ')');
  af(fFan && Number(fFan.sistema_total_vuelo) === 5000,
     'el vuelo del grupo tiene que ser la SUMA de sus filas (2 × $2,500 = $5,000), porque el valor de la '
     + 'columna es POR PERSONA: ' + JSON.stringify(fFan && fFan.sistema_total_vuelo));
  af(fFan && Number(fFan.sistema_total) === Number(dueno2.total) + 5000,
     'el total del grupo no cuadra con el dueño preguntado por 2 personas más su vuelo: '
     + (fFan && fFan.sistema_total) + ' vs ' + (Number(dueno2.total) + 5000));
  af(fFan && Number(fFan.sistema_total_boletos) === 2,
     'el renglón no dice cuántos boletos cubre el total: un número dos veces más grande sin esa palabra se '
     + 'lee como un error de la cuenta');
  // ⚠️ Y la fila del grupo con el TOTAL vacío no vuelve nulo su vuelo: son dos
  // columnas distintas y cada hueco es el suyo.
  const pGina = buscar(c19, 'Gina Hueco');
  af(pGina && pGina.total === null && Number(pGina.vuelo) === 1700,
     'el hueco de una columna contaminó a la otra: con el Total VACÍO y el vuelo en $1,700, la persona '
     + 'tiene que salir con `total: null` y `vuelo: 1700`. Salió total '
     + JSON.stringify(pGina && pGina.total) + ' vuelo ' + JSON.stringify(pGina && pGina.vuelo));
  af(!filaDe('Gina Hueco'),
     'la persona con el Total VACÍO llegó al montón: `carear` la salta porque `total: null` es «no se '
     + 'sabe», y taparlo con un cero sería inventar una diferencia');

  // ── [D] EL RIDE NO SE DUPLICA ─────────────────────────────────────────
  // 🔴 Caso que el encargo no acotaba, y lo destapó medir el desglose del
  // dueño: el RIDE de CDMX es «con transporte» pero su total YA ES ese
  // transporte (`zonaP: 0`). Sumarle el vuelo lo contaría dos veces.
  console.log('\n[D] el RIDE, que ya trae su transporte dentro');
  const dRide = await resolverPrecioVenta({ evento_id: 'edc27', paquete: 'RIDE', zona: 'General', num_personas: 1, para_careo: true });
  const fEfra = filaDe('Efra Ride');
  console.log('    dueño RIDE → total ' + dRide.total + ' con zonaP ' + (dRide.desglose && dRide.desglose.zonaP)
    + '   ·   el renglón: ' + (fEfra ? (fEfra.sistema_total == null ? 'PENDIENTE — ' + fEfra.sistema_total_motivo : fEfra.sistema_total) : 'no está'));
  af(dRide && dRide.ok && Number(dRide.desglose.zonaP) === 0,
     'PREMISA: el total del RIDE tenía que venir con `zonaP: 0` (su total ES el transporte). Si trae zona, '
     + 'este bloque mide otra cosa: ' + JSON.stringify(dRide.desglose));
  af(fEfra && fEfra.sistema_total == null,
     '🔴 el RIDE con vuelo se pisó con un total: el del sistema YA es el transporte terrestre, así que '
     + 'sumarle el vuelo cuenta el transporte DOS VECES. ' + JSON.stringify(fEfra && fEfra.sistema_total));
  af(fEfra && /dos veces|ya es el transporte/i.test(String(fEfra.sistema_total_motivo || '')),
     'el renglón pendiente no dice POR QUÉ: ' + JSON.stringify(fEfra && fEfra.sistema_total_motivo));

  // ── [K] LAS CLASES DE CUADRE-5, RE-CAREADAS ───────────────────────────
  console.log('\n[K] los conteos por clase');
  console.log('    ' + JSON.stringify(c6));
  af(c6 && c6.fuera_otro === 0,
     '🔴 `fuera_otro` dejó de ser 0 (' + (c6 && c6.fuera_otro) + '): hay una clase de $0 que nadie nombró, '
     + 'y un montón sin nombre es un montón que nadie revisa');
  // ⚠️ SON DOS, Y EL SEGUNDO ES EL RIDE. La REGLA lo deja entrar —trae su vuelo—
  // y es el RUNNER el que se rehúsa a componer su total, porque el del sistema
  // ya es el transporte. El renglón vive en el montón **con su motivo**, que es
  // mejor que dejarlo en el de diferencias: mi expectativa de 1 estaba mal.
  af(c6 && c6.en_regla_cdmx_con_vuelo === 3,
     'la clase nueva tenía que contar 3 (Ana Volo, Efra Ride y Fanny Grupo): '
     + JSON.stringify(c6 && c6.en_regla_cdmx_con_vuelo));
  af(c6 && c6.en_regla_catalogo >= 1, 'la clase del catálogo se quedó en 0: ' + JSON.stringify(c6 && c6.en_regla_catalogo));
  af(c6 && c6.en_regla === c6.en_regla_cdmx_con_vuelo + c6.en_regla_catalogo,
     'las dos clases de «en la regla» no PARTEN el montón: ' + c6.en_regla + ' ≠ '
     + c6.en_regla_cdmx_con_vuelo + ' + ' + c6.en_regla_catalogo);
  af(c6 && c6.fuera_cdmx_vuelo_cero === 1 && c6 && c6.fuera_cdmx_sin_vuelo === 1,
     'los dos motivos de CDMX no se separan (vuelo en $0 vs sin vuelo): '
     + JSON.stringify([c6 && c6.fuera_cdmx_vuelo_cero, c6 && c6.fuera_cdmx_sin_vuelo]));
  af(c6 && c6.fuera_cdmx === (c6.fuera_cdmx_sin_vuelo + c6.fuera_cdmx_vuelo_cero),
     'el contador VIEJO `fuera_cdmx` dejó de ser la suma de los dos nuevos: la pantalla que aún lo pinta se '
     + 'quedaría diciendo otro número. ' + JSON.stringify(c6));
  af(c6 && c6.fecha === '22-sep-2026' && c6.cuadre6_fecha === '24-sep-2026',
     'las dos fechas firmadas tienen que viajar, cada una con su regla: ' + JSON.stringify([c6 && c6.fecha, c6 && c6.cuadre6_fecha]));

  // ── [L] LA FASE SIGUE SOLO LEYENDO ────────────────────────────────────
  console.log('\n[L] cero escrituras');
  console.log('    escrituras contra PostgREST: ' + JSON.stringify(r19.escrituras));
  af(r19.escrituras.length === 0,
     '🔴 el careo ESCRIBIÓ: la fase solo lee y no hay botón de aplicar en esta tuerca. '
     + JSON.stringify(r19.escrituras));
  // CONTROL POSITIVO: si el contador no puede ponerse rojo, su cero no dice nada.
  const rSab = await correr(h.dir, { pestanas: { P: PESTANA_19 }, saboteado: true });
  console.log('    con la red saboteada: ' + JSON.stringify(rSab.escrituras));
  af(rSab.escrituras.length > 0,
     'el contador de escrituras NO puede ponerse rojo, así que su cero de arriba no significa nada');

  // ── [P] LA PUERTA SIGUE TENIENDO DOS CLIENTES ─────────────────────────
  // Con los comentarios QUITADOS: una aserción de ausencia por grep se caza
  // sola, y este mismo comentario dice `para_careo`.
  console.log('\n[P] quién pasa la puerta');
  const sinCom = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const conPuerta = [];
  for (const dir of [path.join(h.dir, 'netlify/functions'), path.join(h.dir, 'netlify/functions/_lib')]) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.js')) continue;
      const pp = path.join(dir, f);
      if (!fs.statSync(pp).isFile()) continue;
      if (/para_careo/.test(sinCom(fs.readFileSync(pp, 'utf8')))) conPuerta.push(f);
    }
  }
  conPuerta.sort();
  console.log('    la nombran: ' + JSON.stringify(conPuerta));
  af(conPuerta.includes('precio-zona.js'), 'el buscador no ve la puerta ni en su dueño: su lista no dice nada');
  af(conPuerta.length === 2 && conPuerta.includes('excel-careo-correr.js'),
     'la puerta `para_careo` la pasa alguien más: ' + JSON.stringify(conPuerta) + ' — debe ser solo su dueño '
     + 'y el careo. Los otros CINCO llamadores de `resolverPrecioVenta` (Mercado Pago ×2, el alta del '
     + 'Portal, /rol y las cortesías) cotizan VENTA de verdad y no deben pasarla nunca');

  // ── [B] CONTROL POSITIVO · BASE no conoce la columna ──────────────────
  console.log('\n[B] control positivo · BASE');
  const rB = await correr(b.dir, { pestanas: { P: PESTANA_19 } });
  const { parsearPestana: parsearBase } = require(path.join(b.dir, 'netlify/functions/_lib/excel-careo.js'));
  const aB = parsearBase(PESTANA_19, { fila: 10 }, null).personas.find((x) => x.nombre === 'Ana Volo');
  const mapaB = parsearBase(PESTANA_19, { fila: 10 }, null).mapa;
  const fB = dePila(rB.d, 'Ana Volo');
  const cB = (rB.d && rB.d.cuadre5) || {};
  console.log('    BASE → vuelo cosechado ' + JSON.stringify(aB && aB.vuelo)
    + '  ·  Ana Volo en la regla: ' + !!fB + '  ·  fuera_cdmx ' + (cB && cB.fuera_cdmx));
  af(aB && aB.vuelo === undefined && mapaB.avionBus === undefined,
     'BASE ya cosechaba el vuelo (o ya localizaba la columna): entonces esta tuerca no aporta nada y el '
     + 'verde de arriba no dice nada. Salió vuelo=' + JSON.stringify(aB && aB.vuelo)
     + ' avionBus=' + JSON.stringify(mapaB.avionBus));
  af(!fB,
     '🔴 CONTROL POSITIVO: en BASE «Ana Volo» (CDMX + PLUS + $0) tenía que quedarse FUERA de la regla. Si '
     + 'ya entraba, la exclusión no encogió con esta tuerca');
  // En BASE los CUATRO $0 de CDMX con transporte (Ana, Beto, Caro, Efra) más
  // Fanny caen juntos en un solo contador — sin distinguir quién trae vuelo.
  af(cB && Number(cB.fuera_cdmx) >= 4,
     'en BASE los $0 de CDMX con transporte tenían que contarse JUNTOS en `fuera_cdmx` (al menos 4): '
     + JSON.stringify(cB && cB.fuera_cdmx));
  af(cB && cB.cuadre6_fecha === undefined, 'BASE ya traía la fecha de CUADRE-6');

  completo = true;
  process.exitCode = mal ? 1 : 0;
})();
