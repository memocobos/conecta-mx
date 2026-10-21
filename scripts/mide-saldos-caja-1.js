#!/usr/bin/env node
/* =============================================================================
 * mide-saldos-caja-1 — EL VISOR DE SALDOS ARRANCA DEL BANCO REAL (el ancla).
 *
 * Luz verde de Memo (12-oct-2026): «confío en ti haz lo que creas mejor para
 * tener un mejor control financiero». Lo medido antes de decidir: el término
 * [SAL-1] (cobrado a migrados repartido por paquete→banco) pintaba ≈+$1.5M /
 * +$6.4M contra bancos reales de $16.5k/$137k. Esta tuerca lo RETIRA y ancla
 * la caja: saldo = ingresos (incluido el «Saldo inicial») + pagos − gastos,
 * SOLO con fecha >= CAJA_ANCLA (13-oct-2026, el cierre bancario del 12-oct).
 *
 * Entra por el handler REAL (admin-saldos) con una red falsa que respeta
 * FILTROS (eq./gte./in.) y TRUENA ante cualquier escritura o URL ajena — la
 * ley de la base de mentira. La pantalla se prueba con la RESPUESTA REAL del
 * handler (no con una inventada) evaluando kamehouse-saldos.js ENTERO en un vm
 * (lección EXCEL-AG-2: extraer funciones de UI aisladas que en el navegador
 * viven juntas rompe el instrumento; los stubs son solo los identificadores
 * de OTROS archivos).
 *
 * ⚠️ SIN ANCLA DE COMMIT A PROPÓSITO (como mide:cuadre-aplicar y mide:req-b1):
 * carga del ÁRBOL DE TRABAJO porque mide la tuerca que acabas de escribir. No
 * puede traer control positivo por commit (no hay BASE donde el ancla exista);
 * sus controles son por construcción: la red con `ignoraGte` enseña lo viejo
 * y el careo exige que el saldo CAMBIE — sin esa mitad, «no aparece lo
 * pre-ancla» no distingue «filtró» de «mi red nunca sirvió el dato».
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let V = 0, R = 0;
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}
const alCentavo = (a, b) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);

// ── Env que el handler espera ────────────────────────────────────────────────
process.env.PORTAL_SUPABASE_URL = 'https://portal.falso.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'service-falsa';
process.env.JWT_SECRET = 'secreto-del-arnes';
// KH apagado A PROPÓSITO: el handler nuevo no debe pedirle nada a KH. Si lo
// hiciera, la red falsa truena con la URL en el mensaje.
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-kh-falsa';

// El ancla se LEE de la lib (un literal tecleado aquí serían dos copias).
const { CAJA_ANCLA_DIA, CAJA_ANCLA_INSTANTE } = require(path.join(RAIZ, 'netlify/functions/_lib/cuentas-dinero.js'));
// [CAJA-REANCLA-2] la fecha del rótulo se DERIVA del ancla de la lib (re-anclar no debe tumbar el careo).
const _fechaAnclaTxt = (() => { const [y, m, d] = CAJA_ANCLA_DIA.split('-').map(Number); return d + '-' + ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m - 1] + '-' + y; })();

// ── LA RED FALSA: filtros respetados, cero escrituras ────────────────────────
// Comparaciones gte: lexicográficas. Es válido PORQUE los fixtures usan el
// mismo formato uniforme que la columna real (date 'YYYY-MM-DD'; timestamptz
// ISO-8601 UTC 'YYYY-MM-DDTHH:MM:SSZ') — en ese formato el orden del texto ES
// el orden temporal, que es lo que PostgREST compara.
function redNueva(opts) {
  opts = opts || {};
  const st = {
    pagos: opts.pagos || [],
    solicitudes_tour: opts.solicitudes_tour || [],
    clientes: opts.clientes || [],
    ingresos: opts.ingresos || [],
    gastos: opts.gastos || [],
    ignoraGte: !!opts.ignoraGte,   // ← control positivo del instrumento
    khHits: 0,
    log: [],
  };
  function resp(status, body) {
    return {
      ok: status >= 200 && status < 300, status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }
  st.fetch = async function fetchFalso(url, init) {
    init = init || {};
    const met = (init.method || 'GET').toUpperCase();
    st.log.push(met + ' ' + url);
    const u = String(url);
    // sesión viva del verify-admin → TRUENA a propósito: la lib hace fail-open
    // documentado y el rol del JWT manda (mismo camino que mide-req-b1).
    // ⚠️ Va ANTES del contador de KH: esa consulta vive en KH pero es del
    // VERIFY-ADMIN (todo handler admin la hace), no del visor pidiendo dinero.
    // Contarla como «petición a KH del visor» fue un rojo mío de la primera
    // corrida — la expectativa, no el código.
    if (u.includes('/rest/v1/usuarios') || u.includes('sesion')) {
      throw new Error('sesion-viva apagada en el arnés (fail-open)');
    }
    if (u.includes('kh.falso.test') || u.includes('conectareynosa')) {
      st.khHits++;
      throw new Error('el visor anclado NO le pide dinero a KH ni al catálogo: ' + u);
    }
    const m = u.match(/\/rest\/v1\/([a-z_]+)\?(.*)$/);
    if (!m) throw new Error('URL no contemplada por la red falsa: ' + met + ' ' + u);
    if (met !== 'GET') throw new Error('ESCRITURA PROHIBIDA: el visor de saldos solo LEE — ' + met + ' ' + u);
    const tabla = m[1];
    if (!(tabla in st) || !Array.isArray(st[tabla])) throw new Error('tabla no contemplada: ' + tabla);
    const params = new URLSearchParams(m[2]);
    let rows = st[tabla].slice();
    for (const [k, v] of params) {
      if (k === 'select' || k === 'limit' || k === 'order') continue;
      if (v.startsWith('eq.')) {
        const val = decodeURIComponent(v.slice(3));
        rows = rows.filter(r => String(r[k]) === val);
      } else if (v.startsWith('gte.')) {
        if (st.ignoraGte) continue;              // ← el brazo del control positivo
        const val = decodeURIComponent(v.slice(4));
        rows = rows.filter(r => r[k] != null && String(r[k]) >= val);
      } else if (v.startsWith('in.')) {
        const vals = decodeURIComponent(v.slice(3)).replace(/^\(|\)$/g, '').split(',');
        rows = rows.filter(r => vals.includes(String(r[k])));
      } else {
        throw new Error('filtro no contemplado por la red falsa: ' + k + '=' + v);
      }
    }
    return resp(200, rows);
  };
  return st;
}

// ── Handler FRESCO por escenario ─────────────────────────────────────────────
function handlerFresco() {
  Object.keys(require.cache).forEach((k) => {
    if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k];
  });
  return {
    handler: require(path.join(RAIZ, 'netlify/functions/admin-saldos.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
  };
}
function eventoHttp(token) {
  return {
    httpMethod: 'POST',
    headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + token },
    body: '{}',
  };
}

// ── FIXTURES: pre y post ancla, con el borde del instante ───────────────────
// (El ancla real es 2026-10-13 / 2026-10-13T05:00:00Z; los fixtures se DERIVAN
// de las constantes para que el arnés no caduque si el ancla se mueve.)
const DIA_ANTES = (() => { // el día anterior al ancla, sin pasar por Date-UTC
  const [y, mo, d] = CAJA_ANCLA_DIA.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d)); dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
})();
const DIA_2 = (() => {
  const [y, mo, d] = CAJA_ANCLA_DIA.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d)); dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
})();
const INSTANTE_ANTES = (() => { // un segundo antes del instante del ancla
  const t = new Date(CAJA_ANCLA_INSTANTE); t.setUTCSeconds(t.getUTCSeconds() - 1);
  return t.toISOString().replace('.000Z', 'Z');
})();

function fixtures() {
  return {
    ingresos: [
      { id: 'i-si-bbva', cuenta: 'BBVA', monto: 137417.05, concepto: 'Saldo inicial BBVA (ancla de caja)', fecha: CAJA_ANCLA_DIA, cliente_id: null, evento_id: null },
      { id: 'i-si-bmx', cuenta: 'Banamex', monto: 16522.40, concepto: 'Saldo inicial Banamex (ancla de caja)', fecha: CAJA_ANCLA_DIA, cliente_id: null, evento_id: null },
      { id: 'i-viejo', cuenta: 'BBVA', monto: 500, concepto: 'ingreso PRE-ancla (no debe entrar)', fecha: DIA_ANTES, cliente_id: null, evento_id: null },
      { id: 'i-nuevo', cuenta: 'BBVA', monto: 1000, concepto: 'ingreso post-ancla', fecha: DIA_2, cliente_id: null, evento_id: null },
      { id: 'i-otro', cuenta: 'Otro', monto: 50, concepto: 'otro post-ancla', fecha: DIA_2, cliente_id: null, evento_id: null },
      { id: 'i-otro-viejo', cuenta: 'Otro', monto: 7777, concepto: 'otro PRE-ancla (no debe entrar)', fecha: DIA_ANTES, cliente_id: null, evento_id: null },
    ],
    gastos: [
      { id: 'g-viejo', cuenta: 'BBVA', monto: 9501.62, concepto: 'gasto PRE-ancla (no debe entrar)', fecha: DIA_ANTES, evento_id: 'alfredito' },
      { id: 'g-nuevo', cuenta: 'BBVA', monto: 200, concepto: 'gasto post-ancla', fecha: CAJA_ANCLA_DIA, evento_id: null },
      { id: 'g-bmx', cuenta: 'Banamex', monto: 300, concepto: 'gasto post-ancla banamex', fecha: DIA_2, evento_id: 'enjambre' },
      { id: 'g-otro', cuenta: 'Otro', monto: 20, concepto: 'otro gasto post-ancla', fecha: DIA_2, evento_id: null },
    ],
    pagos: [
      { id: 'p-borde-fuera', cuenta: 'BBVA', monto: 999, monto_pagado: null, estado: 'pagado', fecha_pagada: INSTANTE_ANTES, solicitud_id: null, cliente_id: null },
      { id: 'p-borde-dentro', cuenta: 'BBVA', monto: 800, monto_pagado: null, estado: 'pagado', fecha_pagada: CAJA_ANCLA_INSTANTE, solicitud_id: 'sol-1', cliente_id: null },
      { id: 'p-pendiente', cuenta: 'BBVA', monto: 5555, monto_pagado: null, estado: 'pendiente', fecha_pagada: null, solicitud_id: null, cliente_id: null },
    ],
    solicitudes_tour: [
      { id: 'sol-1', evento_nombre: 'Evento Arnés', cliente_id: 'cli-1' },
    ],
    clientes: [
      { id: 'cli-1', nombre_completo: 'Cliente Arnés' },
    ],
  };
}

(async () => {
  console.log('══ mide-saldos-caja-1 · el visor anclado al banco real ══');

  // ── [A] El handler real contesta y el término migrado está FUERA ──────────
  console.log('\n[A] handler real · el término migrado se retiró');
  {
    const red = redNueva(fixtures());
    global.fetch = red.fetch;
    const H = handlerFresco();
    const token = H.jwtSign({ id: 'u-memo', rol: 'maestro_roshi', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
    const res = await H.handler(eventoHttp(token));
    const d = JSON.parse(res.body);
    af(res.statusCode === 200 && d.ok === true, 'contesta 200 ok (status=' + res.statusCode + ')');
    af(red.khHits === 0, 'CERO peticiones a KH o al catálogo (el visor ya no les habla)');
    // El HECHO, no el grep: el handler cargado no arrastró cuenta-evento ni
    // catalogo-index al require.cache.
    const cargados = Object.keys(require.cache).filter(k => k.includes('cuenta-evento') || k.includes('catalogo-index'));
    af(cargados.length === 0, 'admin-saldos ya NO requiere cuenta-evento ni catalogo-index (require.cache limpio)');
    af(!('migrados' in d) && !('migrados_error' in d), 'la respuesta ya no trae migrados/migrados_error');
    af(() => !('entradas_migrados' in d.cuentas.BBVA) && !('entradas_migrados' in d.cuentas.Banamex), 'las cuentas ya no traen entradas_migrados');
    af(d.ancla === CAJA_ANCLA_DIA, 'la respuesta trae el ancla y es la de la lib (' + d.ancla + ')');

    // ── [B] El ancla filtra, al centavo ──────────────────────────────────────
    console.log('\n[B] el ancla filtra · saldos al centavo');
    const b = d.cuentas.BBVA, bmx = d.cuentas.Banamex, ef = d.cuentas.Efectivo;
    // cardinalidad: lo pre-ancla EXISTE en la red (sin esta mitad, «no aparece» pasa en vacío)
    af(red.ingresos.some(i => i.id === 'i-viejo') && red.gastos.some(g => g.id === 'g-viejo'), 'los fixtures pre-ancla EXISTEN en la red (cardinalidad)');
    af(!b.ingresos.some(i => (i.concepto || '').includes('PRE-ancla')), 'el ingreso pre-ancla NO viene en la respuesta');
    af(!b.gastos.some(g => (g.concepto || '').includes('PRE-ancla')), 'el gasto pre-ancla NO viene en la respuesta');
    af(b.ingresos.some(i => (i.concepto || '').includes('Saldo inicial')), 'el «Saldo inicial» SÍ viene (fecha = ancla, gte inclusivo)');
    // el borde del instante: 1 s antes fuera, el instante exacto dentro
    af(alCentavo(b.entradas_pagos, 800), 'pagos: el del instante exacto entra y el de 1 s antes no (entradas_pagos=' + b.entradas_pagos + ')');
    af(alCentavo(b.saldo, 137417.05 + 1000 + 800 - 200), 'saldo BBVA = inicial + ingreso + pago − gasto = ' + b.saldo);
    af(alCentavo(bmx.saldo, 16522.40 - 300), 'saldo Banamex = inicial − gasto = ' + bmx.saldo);
    af(alCentavo(ef.saldo, 0), 'saldo Efectivo = 0 (sin ancla capturada, sin movimientos)');
    af(alCentavo(d.otros_total, 50 - 20), 'otros_total solo post-ancla (el «Otro» de $7,777 pre-ancla quedó fuera): ' + d.otros_total);
    af(alCentavo(d.caja_total, b.saldo + bmx.saldo + ef.saldo + d.otros_total), 'caja_total = Σ saldos + otros (la dice la fuente)');

    // ── [E] La pantalla, con la RESPUESTA REAL del handler ───────────────────
    console.log('\n[E] la pantalla pinta el ancla y ya no habla de migrados');
    const fuente = fs.readFileSync(path.join(RAIZ, 'kamehouse-saldos.js'), 'utf8');
    const nodos = { 'saldos-content': { innerHTML: '' }, 'saldo-detalle-panel': { innerHTML: '', style: {} } };
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ctx = {
      document: { getElementById: (id) => nodos[id] || null },
      _spFmtMxn: (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
      _esfEsc: esc, _spEscape: esc,
      _spFmtFechaAbs: (s) => String(s), fmtFecha: (s) => String(s),
      khAdminFetch: () => { throw new Error('el arnés no navega'); },
      _spAdminHeaders: () => ({}),
      console,
    };
    vm.createContext(ctx);
    vm.runInContext(fuente, ctx, { filename: 'kamehouse-saldos.js' });
    af(typeof ctx._renderSaldos === 'function' && typeof ctx._renderSaldoDetalle === 'function' && typeof ctx._saldosFechaAncla === 'function',
      'el módulo entero evaluó en el vm (funciones presentes)');
    af(ctx._saldosFechaAncla('2026-10-13') === '13-oct-2026' && ctx._saldosFechaAncla(CAJA_ANCLA_DIA) === _fechaAnclaTxt, '_saldosFechaAncla pinta 13-oct-2026 sin pasar por Date (la mordida UTC en espejo)');
    ctx._renderSaldos(d);
    const html = nodos['saldos-content'].innerHTML;
    af(html.includes(ctx._saldosFechaAncla(CAJA_ANCLA_DIA)) && html.includes('Caja anclada al banco real'), 'el rótulo del ancla sale, con su fecha');
    af(html.includes('no</b> entran solas'), 'y dice que las entradas de clientes post-ancla no entran solas');
    af(!/migrado/i.test(html) && !html.includes('incompletos'), 'el HTML impreso ya no habla de migrados ni de «incompletos»');
    const detalle = ctx._renderSaldoDetalle(d.cuentas.BBVA);
    af(!detalle.includes('Cobrado a migrados'), 'el detalle ya no trae la sección «Cobrado a migrados»');
    af(detalle.includes('Saldo inicial BBVA'), 'el detalle enseña el renglón del «Saldo inicial» entre los ingresos');
    // la pantalla no inventa el ancla: sin el dato, sin rótulo
    const sinAncla = JSON.parse(res.body); delete sinAncla.ancla;
    nodos['saldos-content'].innerHTML = '';
    ctx._renderSaldos(sinAncla);
    af(!nodos['saldos-content'].innerHTML.includes('Caja anclada'), 'sin `ancla` en la respuesta, el rótulo NO sale (la fecha la dice la fuente)');

    // ── [E2] El hero del RESUMEN («Caja total de la empresa») dice el ancla ──
    // Mismo vm que saldos (en el navegador viven juntos — lección EXCEL-AG-2):
    // el resumen llama a `_saldosFechaAncla` del módulo de saldos.
    console.log('\n[E2] el hero del Resumen hereda el ancla y la dice');
    const nodoHero = { innerHTML: '', style: {}, className: '', setAttribute() {} };
    const nodoDinero = { innerHTML: '', style: {}, className: '', setAttribute() {} };
    nodos['resumen-caja'] = nodoHero;
    nodos['resumen-dinero'] = nodoDinero;
    ctx._resumenSaldosCache = null;
    ctx.khAdminFetch = async () => ({ ok: true, json: async () => d });
    const fuenteResumen = fs.readFileSync(path.join(RAIZ, 'kamehouse-resumen.js'), 'utf8');
    vm.runInContext(fuenteResumen, ctx, { filename: 'kamehouse-resumen.js' });
    await ctx._renderResumenDinero(0);
    af(nodoHero.innerHTML.includes('Caja total de la empresa'), 'el hero del Resumen pinta (premisa)');
    af(nodoHero.innerHTML.includes('Anclada al banco real') && nodoHero.innerHTML.includes(_fechaAnclaTxt),
      'el sub del hero dice el ancla con su fecha');
    af(() => {
      const mxn = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      return nodoHero.innerHTML.includes(mxn(d.caja_total));
    }, 'y el número grande ES el caja_total anclado de la fuente');
    // fail-soft: sin ancla, el sub viejo (no inventa fecha)
    nodoHero.innerHTML = '';
    ctx._resumenSaldosCache = null;
    ctx.khAdminFetch = async () => ({ ok: true, json: async () => sinAncla });
    await ctx._renderResumenDinero(0);
    af(nodoHero.innerHTML.includes('Lo que hay hoy, sumando cuentas') && !nodoHero.innerHTML.includes('Anclada'),
      'sin `ancla`, el hero cae al sub viejo sin inventar fecha');
  }

  // ── [C] Control positivo del instrumento: sin filtro, lo viejo ENTRA ───────
  console.log('\n[C] control positivo · la red que ignora gte enseña lo pre-ancla');
  {
    const red = redNueva(Object.assign(fixtures(), { ignoraGte: true }));
    global.fetch = red.fetch;
    const H = handlerFresco();
    const token = H.jwtSign({ id: 'u-memo', rol: 'maestro_roshi', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
    const res = await H.handler(eventoHttp(token));
    const d = JSON.parse(res.body);
    af(res.statusCode === 200, 'contesta 200 con la red saboteada');
    af(d.cuentas.BBVA.gastos.some(g => (g.concepto || '').includes('PRE-ancla')), 'el gasto pre-ancla APARECE cuando el gte se ignora');
    af(!alCentavo(d.cuentas.BBVA.saldo, 137417.05 + 1000 + 800 - 200), 'y el saldo CAMBIA — el filtro del ancla es lo que separa los dos brazos');
  }

  // ── [D] Cero escrituras: el candado muerde ─────────────────────────────────
  console.log('\n[D] cero escrituras');
  {
    // DOS redes a propósito: el PATCH sembrado del control positivo ensuciaría
    // la bitácora de la corrida buena (rojo mío de la primera corrida — el
    // control contaminaba al medido).
    const redControl = redNueva(fixtures());
    let trono = false;
    try { await redControl.fetch('https://portal.falso.test/rest/v1/gastos?id=eq.x', { method: 'PATCH', body: '{}' }); }
    catch (e) { trono = /ESCRITURA PROHIBIDA/.test(e.message); }
    af(trono, 'la red falsa truena ante una escritura (control de que el candado muerde)');
    // y el camino bueno no escribió: toda la bitácora es GET
    const red = redNueva(fixtures());
    global.fetch = red.fetch;
    const H = handlerFresco();
    const token = H.jwtSign({ id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
    await H.handler(eventoHttp(token));
    af(red.log.length > 0 && red.log.every(l => l.startsWith('GET ')), 'la corrida entera fue solo GET (' + red.log.length + ' lecturas)');
  }

  console.log('\n══ RESULTADO ══');
  if (V === 0 && R === 0) { console.log('NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R === 0 ? '✅ VERDE' : '🔴 ROJO') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R === 0 ? 0 : 1);
})().catch((e) => { console.error('EL ARNÉS SE CAYÓ (eso no es un reporte):', e); process.exit(1); });
