#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-concilia-1.js — CONCILIA-1 fase 1 · el careo CAJA ↔ CONTRATOS
//
// Orden de Memo (1-oct-2026): conciliación automática, fase 1, SOLO LECTURA.
//
// 🔒 LOS DOS LADOS SON COMMITS. Y commitear exige RE-ANCLAR.
// 🔒 SE ENTRA POR EL HANDLER REAL y se simula UN SALTO MÁS ADENTRO (el `fetch`
//    a PostgREST). Un mock por ruta salta al portero.
//
// 🔴 EL FIXTURE ESTÁ DISEÑADO PARA **SEPARAR IMPLEMENTACIONES**, no para pasar:
//    · Laura tiene un abono FUERA del periodo, así que «lo abonado» según el
//      DUEÑO (7,000) y según un reduce del periodo (6,200) son números
//      DISTINTOS. Con el fixture fácil, las dos implementaciones dan lo mismo y
//      el verde no dice nada (ley AUD-1).
//    · DOS personas abonan $700 el MISMO día: un `Map` por nombre+monto que no
//      guarde cola descartaría a una en silencio.
//    · Las fechas van RELATIVAS a hoy. Un fixture con fechas tecleadas es una
//      foto, y una foto caduca sin avisar (lo que mató a mide:nube-4 el 1-oct).
//
// Se corre:  npm run mide:concilia-1
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let verde = 0, rojo = 0, completo = false;
const fallos = [];
function af(cond, msg) {
  let ok = false, extra = '';
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { ok = false; extra = '  [EXCEPCIÓN: ' + e.message + ']'; }
  if (ok) { verde++; return; }
  let t; try { t = (typeof msg === 'function') ? msg() : msg; }
  catch (e) { t = '(el mensaje también reventó: ' + e.message + ')'; }
  rojo++; fallos.push(t + extra); console.log('   ✗ ' + t + extra);
}
function ver(fn) { try { const v = fn(); return v === undefined ? 'undefined' : JSON.stringify(v); } catch (e) { return '«no se pudo leer: ' + e.message + '»'; } }
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  console.log((rojo ? '❌ ROJO · ' : '✅ VERDE · ') + verde + ' en verde, ' + rojo + ' en rojo');
  fallos.slice(0, 20).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '5e1c501';      // el merge de NUBE4-ARNES-1
const HEAD_SHA = process.env.HEAD_SHA || 'HEAD'; // se re-ancla al merge

// ── EL RELOJ, RELATIVO ──────────────────────────────────────────────────────
const AHORA = Date.now();
const dia = (n) => new Date(AHORA + n * 86400000).toISOString().slice(0, 10);
const HOY = dia(0);
// El periodo que se le pide al reporte: la última semana.
const DESDE = dia(-6), HASTA = dia(0);

// ── EL PADRÓN FALSO ─────────────────────────────────────────────────────────
const KH = {
  viajeros_evento: [
    // Laura: su abono del periodo NO tiene pago de caja → el control positivo
    // que pide el brief. Y trae OTRO abono fuera del periodo, que es lo que
    // separa «preguntarle al dueño» de «sumar lo de esta semana».
    { id: 'v1', nombre: 'Laura Mendez Rios', evento_id: 'karolg#1', total_contrato: 9200, abonado_previo: 5000, tipo_paquete: 'PLUS' },
    { id: 'v2', nombre: 'Jorge Pineda Soto', evento_id: 'edc27', total_contrato: 4000, abonado_previo: 0, tipo_paquete: 'CHEAP' },
    // Dos personas, el MISMO monto, el MISMO día.
    { id: 'v3', nombre: 'Mismo Monto Uno', evento_id: 'edc27', total_contrato: 3000, abonado_previo: 0, tipo_paquete: 'CHEAP' },
    { id: 'v4', nombre: 'Mismo Monto Dos', evento_id: 'edc27', total_contrato: 3000, abonado_previo: 0, tipo_paquete: 'CHEAP' },
  ],
  abonos_viajero: [
    { id: 'a1', viajero_id: 'v1', monto: 1200, fecha: dia(-2), nota: 'Careo Excel Karol G - 7 de Noviembre ' + dia(-2), capturado_por: 'bulma@x', created_at: dia(-2) },
    { id: 'a2', viajero_id: 'v2', monto: 2000, fecha: dia(-1), nota: 'Mercado Pago · pago con 3DS', capturado_por: 'webhook', created_at: dia(-1) },
    // 🔴 FUERA DEL PERIODO a propósito: cuenta para el SALDO y no para el careo.
    { id: 'a3', viajero_id: 'v1', monto: 800, fecha: dia(-40), nota: 'Careo Excel Karol G - 7 de Noviembre ' + dia(-40), capturado_por: 'bulma@x', created_at: dia(-40) },
    { id: 'a4', viajero_id: 'v3', monto: 700, fecha: dia(-1), nota: '', capturado_por: 'milk@x', created_at: dia(-1) },
    { id: 'a5', viajero_id: 'v4', monto: 700, fecha: dia(-1), nota: 'capturado a mano por Milk', capturado_por: 'milk@x', created_at: dia(-1) },
    // Un abono cuyo viajero NO existe: no es un descuadre, es un hueco de datos.
    { id: 'a6', viajero_id: 'v-fantasma', monto: 500, fecha: dia(-1), nota: 'Careo Excel X ' + dia(-1), capturado_por: 'bulma@x', created_at: dia(-1) },
  ],
};
const PORTAL = {
  pagos: [
    { id: 'p1', estado: 'pagado', cuenta: 'BBVA', monto: 2000, monto_pagado: 2000, fecha_pagada: dia(-1), solicitud_id: 's1', cliente_id: 'c2' },
    { id: 'p2', estado: 'pagado', cuenta: 'Efectivo', monto: 700, monto_pagado: 700, fecha_pagada: dia(-1), solicitud_id: null, cliente_id: 'c3' },
    { id: 'p3', estado: 'pagado', cuenta: 'Efectivo', monto: 700, monto_pagado: 700, fecha_pagada: dia(-1), solicitud_id: null, cliente_id: 'c4' },
    // ⚠️ Un PARCIAL: `monto` dice 5,000 y `monto_pagado` dice 1,000. Lo que
    // entró a la caja es lo segundo; leer `monto` acusaría a la caja de un
    // faltante que no existe.
    { id: 'p4', estado: 'pagado', cuenta: 'BBVA', monto: 5000, monto_pagado: 1000, fecha_pagada: dia(-1), solicitud_id: null, cliente_id: 'c5' },
    // Y uno FUERA del periodo, que no debe entrar.
    { id: 'p9', estado: 'pagado', cuenta: 'BBVA', monto: 9999, monto_pagado: 9999, fecha_pagada: dia(-40), solicitud_id: null, cliente_id: 'c2' },
  ],
  ingresos: [
    // En caja y NO en contratos → el montón inverso.
    { id: 'i1', cuenta: 'Efectivo', monto: 1500, concepto: 'depósito de Sofía', fecha: dia(-3), cliente_id: 'c6', evento_id: null },
  ],
  solicitudes_tour: [{ id: 's1', evento_nombre: 'EDC 2027', cliente_id: 'c2' }],
  clientes: [
    { id: 'c2', nombre_completo: 'Jorge Pineda Soto' },
    { id: 'c3', nombre_completo: 'Mismo Monto Uno' },
    { id: 'c4', nombre_completo: 'Mismo Monto Dos' },
    { id: 'c5', nombre_completo: 'Parcial Perez' },
    { id: 'c6', nombre_completo: 'Sofia Caja Sola' },
  ],
};
const KH_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const P_URL = 'https://muvvrstnkxsxfpkhbntq.supabase.co';

// ── LA RED FALSA · PostgREST, un salto más adentro que el handler ───────────
// 🔒 ES MÁS ESTRICTA QUE LA DE VERDAD: si una consulta trae un filtro que no
// entiende, TRUENA en vez de contestar de más. Una red falsa permisiva deja
// pasar un filtro roto y el careo se lee como verde.
let CAIDA = null;       // 'kh' | 'portal' | null — para el cero que es afirmación
let PEDIDOS = [];
function armarRed() {
  PEDIDOS = [];
  global.fetch = async (url, opts) => {
    const u = String(url), met = (opts && opts.method) || 'GET';
    const esKH = u.startsWith(KH_URL), esP = u.startsWith(P_URL);
    if (!esKH && !esP) throw new Error('la red falsa no conoce ese destino: ' + u);
    PEDIDOS.push({ met, url: u.replace(/^.*rest\/v1\//, '') });
    if (met !== 'GET') throw new Error('🔴 LA FASE 1 ESCRIBIÓ: ' + met + ' ' + u);
    if ((CAIDA === 'kh' && esKH) || (CAIDA === 'portal' && esP)) {
      return { ok: false, status: 503, text: async () => 'la base tose', json: async () => ({}) };
    }
    const base = esKH ? KH : PORTAL;
    const uu = new URL(u);
    const tabla = uu.pathname.replace('/rest/v1/', '');
    let filas = (base[tabla] || []).slice();
    for (const [campo, expr] of uu.searchParams.entries()) {
      if (['select', 'limit', 'order'].includes(campo)) continue;
      let m;
      if ((m = /^eq\.(.*)$/.exec(expr))) { filas = filas.filter((f) => String(f[campo]) === m[1]); continue; }
      if ((m = /^gte\.(.*)$/.exec(expr))) { filas = filas.filter((f) => String(f[campo] || '') >= m[1]); continue; }
      if ((m = /^lte\.(.*)$/.exec(expr))) { filas = filas.filter((f) => String(f[campo] || '') <= m[1]); continue; }
      if ((m = /^in\.\((.*)\)$/.exec(expr))) {
        const vals = m[1].split(',').map((v) => decodeURIComponent(v).replace(/^"|"$/g, ''));
        filas = filas.filter((f) => vals.includes(String(f[campo]))); continue;
      }
      throw new Error('la red falsa no entiende el filtro: ' + campo + '=' + expr);
    }
    return { ok: true, status: 200, json: async () => filas, text: async () => '' };
  };
}

function limpiar(dir) {
  for (const f of ['admin-concilia.js', '_lib/concilia.js', '_lib/cuenta-evento.js',
                   '_lib/excel-careo.js', '_lib/normalizar-zona.js', '_lib/verify-admin.js']) {
    try { delete require.cache[require.resolve(path.join(dir, 'netlify/functions', f))]; } catch (_) {}
  }
  const va = require.resolve(path.join(dir, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async (ev, roles) => ({ valid: true, roles, user: { id: 'u1', correo: 'bulma@x', rol: 'bulma' } }),
  } };
  process.env.SUPABASE_URL_KAMEHOUSE = KH_URL;
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  process.env.PORTAL_SUPABASE_URL = P_URL;
  process.env.PORTAL_SUPABASE_SERVICE_KEY = 'p';
}

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'cc-base'), h = sacar(HEAD_SHA, 'cc-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7));
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  console.log('periodo del careo: ' + DESDE + ' → ' + HASTA + '\n');

  const pedir = async (body, dir) => {
    const d0 = dir || h.dir;
    armarRed(); limpiar(d0);
    const mod = require(path.join(d0, 'netlify/functions/admin-concilia.js'));
    const res = await mod.handler({
      httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify(body),
    });
    return { res, d: JSON.parse(res.body || '{}'), pedidos: PEDIDOS.slice() };
  };

  // ── [I] EL INSTRUMENTO ────────────────────────────────────────────────
  console.log('[I] el instrumento');
  const srcLib = fs.readFileSync(path.join(h.dir, 'netlify/functions/_lib/concilia.js'), 'utf8');
  const srcHan = fs.readFileSync(path.join(h.dir, 'netlify/functions/admin-concilia.js'), 'utf8');
  af(/module\.exports/.test(srcLib) && /conciliar/.test(srcLib), 'la lib no exporta `conciliar`');
  // 🔒 LA FASE 1 NO ESCRIBE, Y SE MIDE EN VEZ DE PROMETERSE. Una guarda
  // prometida en un comentario y nunca medida es la familia que esta casa ya
  // pagó: «el arnés los carea contra el lib» y ningún arnés los careaba.
  const metodos = (s) => (s.match(/method:\s*'(\w+)'/g) || []).map((x) => x.replace(/.*'(\w+)'.*/, '$1'));
  console.log('    métodos que el código nombra: lib=' + ver(() => metodos(srcLib)) + ' handler=' + ver(() => metodos(srcHan)));
  af(metodos(srcLib).every((m) => m === 'GET') && metodos(srcHan).every((m) => m === 'GET'),
     () => '🔴 la fase 1 NOMBRA un método de escritura: ' + ver(() => [...metodos(srcLib), ...metodos(srcHan)]));
  af(!/\bPATCH\b|\bDELETE\b|method:\s*'POST'/.test(srcLib),
     'la lib menciona PATCH/DELETE/POST: la fase 1 no escribe un peso');
  // Y el despacho conoce sus acciones (ley de RAD-FIX-CAMINO).
  af(/const ACCIONES = \['reporte', 'radar'\]/.test(srcHan),
     'las acciones no están en `ACCIONES`: tres tuercas llegaron rotas a prod por eso');

  // ── [C] EL CONTROL POSITIVO DEL BRIEF ─────────────────────────────────
  // «Se siembra un abono sin su pago de caja y el reporte TIENE que nombrarlo.»
  console.log('\n[C] el abono sin pago de caja, NOMBRADO');
  const r = await pedir({ accion: 'reporte', desde: DESDE, hasta: HASTA });
  af(r.res.statusCode === 200 && r.d.ok === true, () => 'el reporte no contestó ok: ' + r.res.body.slice(0, 240));
  const sc = r.d.solo_contratos || [];
  console.log('    solo en CONTRATOS: ' + ver(() => sc.map((x) => x.nombre + ' $' + x.monto + ' ' + x.fecha)));
  const laura = sc.find((x) => /Laura/.test(x.nombre));
  af(!!laura,
     () => '🔴 EL CONTROL POSITIVO DEL BRIEF: el abono de Laura no tiene pago de caja y el reporte NO LA NOMBRA. '
     + 'Sin nombre esto es «$1,200 de diferencia», que manda a buscar; con nombre se resuelve. Salió ' + ver(() => sc));
  af(laura && laura.monto === 1200 && laura.fecha === dia(-2),
     () => 'el renglón no trae su MONTO y su FECHA, que es con lo que se busca el pago: ' + ver(() => laura));
  af(laura && laura.evento_id === 'karolg#1', () => 'el renglón no dice de qué evento es: ' + ver(() => laura));
  af(laura && laura.fuente === 'excel-careo',
     () => 'la fuente no se derivó de la nota del careo: ' + ver(() => laura && { nota: laura.nota, fuente: laura.fuente }));
  af(r.d.fuente_derivada === true,
     'la respuesta no dice que la fuente es DERIVADA: una etiqueta adivinada presentada como guardada es un '
     + 'dato bueno con la etiqueta equivocada (la columna `fuente` es SQL y esta fase no escribe)');

  // ── [C2] EL INVERSO: en caja y no en contratos ────────────────────────
  console.log('\n[C2] el movimiento de caja sin abono');
  const sj = r.d.solo_caja || [];
  console.log('    solo en CAJA: ' + ver(() => sj.map((x) => x.nombre + ' $' + x.monto + ' ' + (x.cuenta || '—'))));
  const sofia = sj.find((x) => /Sofia/.test(x.nombre));
  af(!!sofia, () => '🔴 el ingreso de Sofía no está en contratos y el reporte no lo nombra: ' + ver(() => sj));
  af(sofia && sofia.monto === 1500 && sofia.cuenta === 'Efectivo',
     () => 'el renglón de caja no trae monto y CUENTA (en qué cubeta buscarlo): ' + ver(() => sofia));
  // ⚠️ El PARCIAL: `monto_pagado` manda. Si se leyera `monto`, Parcial Perez
  // saldría con $5,000 en vez de $1,000.
  const parcial = sj.find((x) => /Parcial/.test(x.nombre));
  af(parcial && parcial.monto === 1000,
     () => '🔴 se leyó `monto` en vez de `monto_pagado`: un pago parcial se vería como completo y el careo '
     + 'acusaría a la caja de un faltante que no existe. Salió ' + ver(() => parcial));

  // ── [K] LOS QUE CASAN, Y LA LLAVE QUE NO ES ÚNICA ─────────────────────
  console.log('\n[K] los que casan · y dos personas con el mismo monto');
  const t = r.d.totales || {};
  console.log('    totales: ' + ver(() => t));
  af(t.casados_filas === 4,
     () => 'tenían que casar CUATRO (Jorge $2,000 y los dos de $700... y nadie más): ' + ver(() => t));
  // 🔒 LA LEY DEL `Map` POR LLAVE NO ÚNICA: los dos de $700 son personas
  // distintas y las dos casan. Si el casamiento colapsara por llave, una se
  // quedaría sin pareja y saldría como descuadre — un descuadre INVENTADO.
  af(!sc.some((x) => /Mismo Monto/.test(x.nombre)) && !sj.some((x) => /Mismo Monto/.test(x.nombre)),
     () => '🔴 dos personas con el MISMO monto el MISMO día: una se quedó sin casar. Un `Map` por una llave '
     + 'no única DESCARTA en silencio, y aquí inventaría un descuadre. Salió contratos=' + ver(() => sc.map((x) => x.nombre))
     + ' caja=' + ver(() => sj.map((x) => x.nombre)));
  // Y lo de FUERA del periodo no entra por ningún lado.
  af(!sc.some((x) => x.monto === 800) && !sj.some((x) => x.monto === 9999),
     () => 'entró algo de FUERA del periodo: el careo de una semana no puede acusar a otra. ' + ver(() => ({ sc, sj })));
  // El abono sin viajero: NO es un descuadre, es un hueco — y se cuenta aparte.
  af(t.sin_nombre_contratos === 1 && !sc.some((x) => x.monto === 500),
     () => 'el abono cuyo viajero no existe tenía que ir a `sin_nombre`, no al montón de descuadres: '
     + 'inflaría la diferencia con lo que en realidad es un hueco de datos. ' + ver(() => t));
  af(r.d.diferencia === 1200 - 1500,
     () => 'la diferencia no es (solo contratos − solo caja) = 1200 − 1500: ' + ver(() => r.d.diferencia));
  af(r.d.cuadra === false, 'con dos montones llenos `cuadra` no puede ser true');

  // ── [A] AUD-1 · EL SALDO SE LO CONTESTA EL DUEÑO ──────────────────────
  // 🔴 EL FIXTURE SEPARA LAS DOS IMPLEMENTACIONES: Laura lleva 5,000 de previo
  // + 1,200 del periodo + 800 de HACE 40 DÍAS = **7,000**. Un reduce de los
  // abonos del periodo daría 6,200. Los dos números existen a propósito.
  console.log('\n[A] AUD-1 · el saldo lo contesta `saldoMigrado`, no un reduce de aquí');
  const { saldoMigrado } = require(path.join(h.dir, 'netlify/functions/_lib/cuenta-evento.js'));
  const delDueno = saldoMigrado(
    KH.viajeros_evento.find((v) => v.id === 'v1'),
    KH.abonos_viajero.filter((a) => a.viajero_id === 'v1'));
  console.log('    el DUEÑO dice: ' + ver(() => delDueno) + '   ·   el reporte dice: '
    + ver(() => laura && { abonado_total: laura.abonado_total, resta: laura.resta }));
  af(laura && laura.abonado_total === delDueno.abonado,
     () => '🔴 el `abonado_total` del reporte NO es el del dueño. Si salió 6,200 es un reduce de los abonos '
     + 'DEL PERIODO — la fórmula número doce (AUD-1): el saldo de una persona no es lo que abonó esta semana. '
     + 'Dueño=' + ver(() => delDueno.abonado) + ' reporte=' + ver(() => laura && laura.abonado_total));
  af(laura && laura.abonado_total === 7000, () => 'el saldo de Laura tenía que ser 7,000: ' + ver(() => laura && laura.abonado_total));
  af(laura && laura.resta === delDueno.resta && laura.resta === 2200,
     () => 'la `resta` no es la del dueño (2,200): es el dato que dice si el abono huele a captura doble o a '
     + 'pago sin registrar. ' + ver(() => laura && laura.resta));
  af(/saldoMigrado/.test(srcLib) && /require\('\.\/cuenta-evento'\)/.test(srcLib),
     'la lib no le PIDE el saldo a `_lib/cuenta-evento`: cada fórmula nueva de «cuánto dinero hay» es la '
     + 'número doce esperando a divergir');

  // ── [F] LA FUENTE DERIVADA, con su montón de «no supe» ────────────────
  console.log('\n[F] la fuente, derivada y rotulada');
  const pf = (r.d.contratos || {}).por_fuente || {};
  console.log('    por fuente: ' + ver(() => Object.keys(pf).reduce((o, k) => (pf[k].filas ? (o[k] = pf[k], o) : o), {})));
  af(pf['excel-careo'] && pf['excel-careo'].filas === 1 && pf['excel-careo'].monto === 1200,
     () => 'el careo Excel no se contó por su nota: ' + ver(() => pf['excel-careo']));
  af(pf['mercadopago'] && pf['mercadopago'].filas === 1, () => 'Mercado Pago no se derivó: ' + ver(() => pf['mercadopago']));
  af(pf['manual'] && pf['manual'].filas === 1, () => 'el capturado a mano no cayó en `manual`: ' + ver(() => pf['manual']));
  // 🔒 UNA NOTA VACÍA NO ES «MANUAL». Un montón llamado «manual» que en realidad
  // es «no supe» mandaría a buscar a una persona que no capturó nada.
  af(pf['sin-nota'] && pf['sin-nota'].filas === 1,
     () => '🔴 el abono SIN NOTA se contó como `manual`: «no supe» y «lo capturó alguien a mano» son cosas '
     + 'distintas, y confundirlas manda a buscar a quien no hizo nada. ' + ver(() => pf));

  // ── [0] UN CERO ES UNA AFIRMACIÓN ─────────────────────────────────────
  console.log('\n[0] un lado caído NO es «todo cuadra»');
  for (const [lado, etiqueta] of [['kh', 'CONTRATOS'], ['portal', 'CAJA']]) {
    CAIDA = lado;
    const rc = await pedir({ accion: 'reporte', desde: DESDE, hasta: HASTA });
    CAIDA = null;
    console.log('    ' + etiqueta + ' caída → ' + rc.res.statusCode + ' se_pudo=' + ver(() => rc.d.se_pudo_carear)
      + ' diferencia=' + ver(() => rc.d.diferencia));
    af(rc.res.statusCode >= 500,
       () => 'con el lado ' + etiqueta + ' caído contestó ' + rc.res.statusCode + ': un 200 haría que el renglón '
       + 'del Radar se callara —que es lo que hace cuando todo cuadra— y el descuadre real quedaría invisible '
       + 'justo el día que la base tose');
    af(rc.d.se_pudo_carear === false, () => 'no dijo `se_pudo_carear:false`: ' + ver(() => rc.d.se_pudo_carear));
    af(rc.d.diferencia === null,
       () => '🔴 la diferencia salió en CERO con un lado caído. «No hay diferencia» y «no pude mirar» se ven '
       + 'igual en un cero y significan lo contrario. Salió ' + ver(() => rc.d.diferencia));
    af(typeof rc.d.motivo === 'string' && new RegExp(etiqueta, 'i').test(rc.d.motivo),
       () => 'el motivo no dice QUÉ lado falló: ' + ver(() => rc.d.motivo));
  }

  // ── [D] EL PERIODO SE VALIDA EN LA PUERTA ─────────────────────────────
  console.log('\n[D] las fechas imposibles se rechazan en la puerta');
  for (const [etiq, cuerpo] of [
    ['sin periodo', { accion: 'reporte' }],
    ['fecha que se acomoda sola', { accion: 'reporte', desde: '2026-13-45', hasta: HASTA }],
    ['31 de febrero', { accion: 'reporte', desde: '2026-02-31', hasta: HASTA }],
    ['al revés', { accion: 'reporte', desde: HASTA, hasta: DESDE }],
  ]) {
    const rr = await pedir(cuerpo);
    console.log('    ' + etiq + ' → ' + rr.res.statusCode + ' ' + (rr.d.error || '').slice(0, 54));
    af(rr.res.statusCode === 400,
       () => 'un periodo «' + etiq + '» pasó la puerta (' + rr.res.statusCode + '): «2026-13-45» sale como la '
       + 'CADENA "Invalid Date", que es truthy y pasa los candados');
    af(rr.pedidos.length === 0,
       () => 'con el periodo inválido ya se había ido a la base: la puerta valida ANTES de consultar. '
       + ver(() => rr.pedidos));
  }
  const rAcc = await pedir({ accion: 'aplicar', desde: DESDE, hasta: HASTA });
  console.log('    accion «aplicar» → ' + rAcc.res.statusCode + ' ' + (rAcc.d.codigo || ''));
  af(rAcc.res.statusCode === 400 && rAcc.d.codigo === 'ACCION_DESCONOCIDA',
     () => '🔴 una acción de ESCRITURA no se rechazó: la fase 1 no aplica nada, y el despacho es donde se '
     + 'demuestra. Salió ' + rAcc.res.statusCode);

  // ── [R] EL RENGLÓN DEL RADAR · y el reloj de Reynosa ──────────────────
  console.log('\n[R] el renglón del Radar');
  const rr = await pedir({ accion: 'radar' });
  console.log('    radar → ' + rr.res.statusCode + ' periodo=' + ver(() => rr.d.periodo)
    + ' cuadra=' + ver(() => rr.d.cuadra));
  af(rr.res.statusCode === 200 && rr.d.ok === true, () => 'el radar no contestó ok: ' + rr.res.body.slice(0, 200));
  // 🔒 EL MES SE CALCULA EN REYNOSA (`America/Matamoros`), no en Greenwich:
  // pasadas las 6 pm de acá ya es el día siguiente en UTC y en esta casa se
  // trabaja de noche — el 30 a las 11 pm habría pedido el mes QUE VIENE.
  const mesReynosa = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' }).slice(0, 7);
  af(rr.d.periodo && rr.d.periodo.desde === mesReynosa + '-01',
     () => 'el periodo del Radar no arranca el 1 del mes EN REYNOSA (' + mesReynosa + '-01): un '
     + '`toISOString()` corre el mes de noche. Salió ' + ver(() => rr.d.periodo));
  af(rr.d.periodo && /^\d{4}-\d{2}-\d{2}$/.test(rr.d.periodo.hasta) && rr.d.periodo.hasta >= rr.d.periodo.desde,
     () => 'la punta del mes no es un día válido: ' + ver(() => rr.d.periodo));
  af(Array.isArray(rr.d.muestra_contratos),
     'el radar no manda una MUESTRA con nombres: «hay diferencia» sin un nombre manda a buscar');
  af(rr.d.solo_lectura === true, 'el radar no dice que esto es solo lectura');

  // ── [B] CONTROL POSITIVO · en BASE esto NO EXISTÍA ────────────────────
  console.log('\n[B] control positivo · BASE');
  const hayEnBase = fs.existsSync(path.join(b.dir, 'netlify/functions/admin-concilia.js'))
                 || fs.existsSync(path.join(b.dir, 'netlify/functions/_lib/concilia.js'));
  console.log('    BASE trae la conciliación: ' + hayEnBase);
  af(!hayEnBase,
     'CONTROL POSITIVO: en BASE no podía existir ni el handler ni la lib — si ya estaban, esta tuerca no los '
     + 'agrega y el verde de arriba no dice nada');

  completo = true;
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN DEL ARNÉS: ' + e.stack); process.exit(1); });
