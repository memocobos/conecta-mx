#!/usr/bin/env node
// =============================================================================
// scripts/mide-cuadre-todo.js — EL CAREO DE CUADRE-3 («Actualizar todo»)
// =============================================================================
// Un clic, todos los eventos. Lo que Jane corrió a mano por el endpoint el
// 20-sep (63 eventos, 117 abonos, $168K) hecho botón.
//
// ⏱ EL PATRÓN LO ELIGIÓ EL RELOJ, MEDIDO CONTRA PRODUCCIÓN, no una idea:
//   · 106 eventos con pestaña activa;
//   · ~4.7 s por evento en serie → ~496 s el recorrido. Netlify corta a los 10.
//   · PERO el tiempo lo manda el evento MÁS LENTO, no la cantidad: 12 careos en
//     PARALELO caben en 4.6 s, y el Apps Script no estranguló ni uno.
//   → TANDAS DE 10 EN PARALELO, con continuación por `desde`. ~11 llamadas de
//     ~5 s. Sin background function y sin tabla de trabajos.
//
// 🔒 Y LA REGLA DE ORO DE 1b SIGUE INTACTA: el navegador lleva la cuenta de
// POR DÓNDE VA (un número), nunca montos. Cada tanda recalcula el careo de sus
// eventos y escribe sobre ESE resultado. La vista previa que el navegador
// acumula es para MIRAR; no se le devuelve al servidor.
// =============================================================================

const path = require('path');
const RAIZ = path.join(__dirname, '..');
let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

const CAB = ['No.','Nombre','Paquete','Boleto','Separo','1','2','3','4','5','6','7','8','9','10',
  'Preventa','Costo','Habitación','Pago Hab','Avión - Bus','Codigo','Total','Abonado','Resta','TALLA',
  'CORREO','CELULAR','EMERGENCIA','HABITACION COMPARTIDA CON','','','','','Luneta','$0','','Stay',''];
const filaExcel = (v) => { const f = new Array(CAB.length).fill('');
  for (const [c, x] of Object.entries(v)) { const i = CAB.indexOf(c); if (i < 0) throw new Error('col: ' + c); f[i] = x; } return f; };
const conPreludio = (filas) => [...Array.from({ length: 10 }, () => ['', '']), CAB, ...filas];

// TRES eventos, cada uno con su propia trampa de la serie.
const EVENTOS = ['ev-uno', 'ev-dos', 'ev-tres'];
const PEST = (ev) => 'Pestaña ' + ev;

function semilla(opts) {
  const o = opts || {};
  const excel = {};
  // ev-uno: un pago POSITIVO ($500) y una NEGATIVA (el sistema va adelante).
  excel[PEST('ev-uno')] = conPreludio([
    filaExcel({ 'Nombre': 'Ana Uno', 'Paquete': 'PLUS', 'Boleto': 'Zona A', 'Separo': '$500', '1': '$1,000', 'Total': '$5,000' }),
    filaExcel({ 'Nombre': 'Beto Uno', 'Paquete': 'PLUS', 'Boleto': 'Zona A', 'Separo': '$500', 'Total': '$5,000' }),
  ]);
  // ev-dos: un TOTAL derivado (sí entra) y uno EXACTO de libreta (no entra).
  excel[PEST('ev-dos')] = conPreludio([
    filaExcel({ 'Nombre': 'Cris Dos', 'Paquete': 'PLUS', 'Boleto': 'Zona B', 'Separo': '$2,000', 'Total': '$7,850' }),
    filaExcel({ 'Nombre': 'Dina Dos', 'Paquete': 'PLUS', 'Boleto': 'Zona B', 'Separo': '$3,000', 'Total': '$6,000' }),
  ]);
  // ev-tres: una BAJA (jamás) y un pago positivo.
  excel[PEST('ev-tres')] = conPreludio([
    filaExcel({ 'Nombre': 'Eva Tres', 'Paquete': 'PLUS', 'Boleto': 'Zona C', 'Separo': '$900', '1': '$100', 'Total': '$4,000' }),
    // Un LUGAR NUEVO de verdad: está en el Excel y no en el sistema.
    filaExcel({ 'Nombre': 'Fito Nuevo', 'Paquete': 'CHEAP', 'Boleto': 'Zona C', 'Separo': '$1,200', 'Total': '$3,300', 'TALLA': 'L' }),
  ]);
  return {
    __excel: excel,
    excel_pestanas: EVENTOS.map((ev) => ({ evento_id: ev, pestana: PEST(ev), regla_zona: null, activa: true, notas: null })),
    numerologia_eventos: [],
    // Los nombres BONITOS. Medido: `eventos_meta` los trae para los 63 slugs
    // activos (63/63) y es la que lleva el nombre del TOUR —«Bruno Mars - The
    // Romantic Tour»— mientras esferas trae el corto («Bruno Mars»). La vista
    // del Resumen pide columna «Tour», así que manda ésta.
    eventos_meta: [
      { slug: 'ev-uno',  nombre: 'Ana Tour - Primera Gira' },
      { slug: 'ev-dos',  nombre: 'Dos en Concierto' },
      { slug: 'ev-tres', nombre: 'Tres Fest 2026' },
    ],
    stock_ajustes: [], abonos_viajero: [],
    viajeros_evento: [
      { id: 'v-ana',  evento_id: 'ev-uno',  nombre: 'Ana Uno',  tipo_viajero: 'cliente', abonado_previo: 1000, total_contrato: 5000, notas: 'Migrado Excel', zona_boleto: 'Zona A', tipo_paquete: 'plus' },
      { id: 'v-beto', evento_id: 'ev-uno',  nombre: 'Beto Uno', tipo_viajero: 'cliente', abonado_previo: 2500, total_contrato: 5000, notas: 'Migrado Excel · Numerología 19-sep: +$2,000', zona_boleto: 'Zona A', tipo_paquete: 'plus' },
      { id: 'v-cris', evento_id: 'ev-dos',  nombre: 'Cris Dos', tipo_viajero: 'cliente', abonado_previo: 2000, total_contrato: 7200, notas: 'TOTAL-1: contrato derivado del catálogo (se afina contra la pestaña)', zona_boleto: 'Zona B', tipo_paquete: 'plus' },
      { id: 'v-dina', evento_id: 'ev-dos',  nombre: 'Dina Dos', tipo_viajero: 'cliente', abonado_previo: 3000, total_contrato: 4200, notas: 'Migrado Excel', zona_boleto: 'Zona B', tipo_paquete: 'plus' },
      { id: 'v-eva',  evento_id: 'ev-tres', nombre: 'Eva Tres', tipo_viajero: 'cliente', abonado_previo: 500,  total_contrato: 4000, notas: 'Migrado Excel', zona_boleto: 'Zona C', tipo_paquete: 'plus' },
      { id: 'v-baja', evento_id: 'ev-tres', nombre: 'Zulema Baja', tipo_viajero: 'cliente', abonado_previo: 3000, total_contrato: 4000, notas: 'Migrado Excel', zona_boleto: 'Zona C', tipo_paquete: 'plus' },
    ],
    __rompe: o.rompe || null,
  };
}

function redFalsa(base) {
  const tablas = JSON.parse(JSON.stringify(base));
  const escrituras = [];
  const SB = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
  let seq = 0;
  const filtrar = (filas, qs) => {
    let out = filas;
    for (const [campo, expr] of qs.entries()) {
      if (['select', 'limit', 'order', 'or'].includes(campo)) continue;
      let m;
      if ((m = /^eq\.(.*)$/.exec(expr))) { out = out.filter((f) => String(f[campo]) === decodeURIComponent(m[1])); continue; }
      if ((m = /^is\.(.*)$/.exec(expr))) { const v = m[1] === 'true' ? true : m[1] === 'false' ? false : null; out = out.filter((f) => f[campo] === v); continue; }
      if ((m = /^in\.\((.*)\)$/.exec(expr))) { const vs = m[1].split(',').map((v) => decodeURIComponent(v).replace(/^"|"$/g, '')); out = out.filter((f) => vs.includes(String(f[campo]))); continue; }
      throw new Error('filtro no modelado: ' + campo + '=' + expr);
    }
    return out;
  };
  const proyectar = (filas, qs) => {
    const sel = qs.get('select'); if (!sel || sel === '*') return filas;
    const cols = sel.split(',').map((c) => c.trim()).filter(Boolean);
    return filas.map((f) => Object.fromEntries(cols.filter((c) => c in f).map((c) => [c, f[c]])));
  };
  const fetchFalso = async (url, opts) => {
    const met = (opts && opts.method) || 'GET';
    if (String(url).startsWith('https://script.test')) {
      const c = JSON.parse(opts.body);
      if (!c.pestana) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, pestanas: Object.keys(tablas.__excel) }) };
      // «un evento truena a media corrida»: su pestaña contesta una PÁGINA.
      if (tablas.__rompe && c.pestana === PEST(tablas.__rompe)) {
        return { ok: true, status: 200, text: async () => '<!doctype html><html><head>acceso</head>' };
      }
      const filas = tablas.__excel[c.pestana];
      if (!filas) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, codigo: 'SIN_PESTANA', error: 'no existe' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, filas, pestanas: Object.keys(tablas.__excel) }) };
    }
    if (String(url).startsWith('https://numero.test')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, codigo: 'SIN_PESTANA', error: 'no' }) };
    }
    if (!String(url).startsWith(SB)) throw new Error('destino desconocido: ' + url);
    const u = new URL(url);
    const tabla = u.pathname.replace('/rest/v1/', '');
    tablas[tabla] = tablas[tabla] || [];
    if (met === 'GET') return { ok: true, status: 200, json: async () => proyectar(filtrar(tablas[tabla], u.searchParams), u.searchParams), text: async () => '' };
    if (met === 'POST') {
      const cuerpo = JSON.parse(opts.body); const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
      const puestas = filas.map((f) => { const fila = { id: 'n-' + (++seq), ...f }; tablas[tabla].push(fila); escrituras.push({ tabla, op: 'INSERT', fila }); return fila; });
      return { ok: true, status: 201, json: async () => puestas, text: async () => '' };
    }
    if (met === 'PATCH') {
      const parche = JSON.parse(opts.body); const tocadas = filtrar(tablas[tabla], u.searchParams);
      tocadas.forEach((f) => { Object.assign(f, parche); escrituras.push({ tabla, op: 'PATCH', fila: f, filtro: u.search }); });
      return { ok: true, status: 200, json: async () => tocadas, text: async () => '' };
    }
    throw new Error('método no modelado: ' + met);
  };
  return { tablas, escrituras, fetchFalso };
}

async function correr(cuerpo, red) {
  process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec';
  process.env.EXCEL_SCRIPT_TOKEN = 't';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  delete process.env.NUMEROLOGIA_SCRIPT_URL;
  global.fetch = red.fetchFalso;
  const va = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async () => ({ valid: true, user: { id: 'u1', rol: 'bulma', nombre: 'Bulma' } }) } };
  for (const f of ['admin-excel-actualizar-todo.js', 'admin-excel-aplicar.js', 'admin-excel-careo.js',
                   'admin-coordi-asignaciones.js', '_lib/excel-careo.js', '_lib/cosecha-excel.js',
                   '_lib/excel-careo-correr.js', '_lib/excel-aplicar.js', '_lib/numerologia.js']) {
    try { delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))]; } catch (_) {}
  }
  let mod;
  try { mod = require(path.join(RAIZ, 'netlify/functions/admin-excel-actualizar-todo.js')); }
  catch (e) { return { falta: e.message, res: { statusCode: 0 }, d: {} }; }
  const res = await mod.handler({ httpMethod: 'POST',
    headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
    body: JSON.stringify(cuerpo) });
  let d = {}; try { d = JSON.parse(res.body); } catch (_) {}
  return { res, d };
}

// El bucle del navegador: pide tandas hasta que `hecho`. Acumula para MIRAR.
async function recorrer(cuerpo, red) {
  const eventos = []; let desde = 0, vueltas = 0, total = null;
  for (;;) {
    const { d, falta, res } = await correr({ ...cuerpo, desde }, red);
    if (falta) return { falta };
    if (res.statusCode !== 200) return { error: d, vueltas };
    eventos.push(...(d.eventos || []));
    total = d.total; vueltas++;
    if (d.hecho) return { eventos, vueltas, total, ultimo: d };
    if (d.siguiente === desde) return { error: 'la continuación no avanza', vueltas };
    desde = d.siguiente;
    if (vueltas > 20) return { error: 'el bucle no termina', vueltas };
  }
}

const cuenta = (t, tabla) => (t[tabla] || []).length;

(async () => {
  console.log('CAREO CUADRE-3 · «Actualizar todo», por el handler REAL\n');

  // ── [1] VISTA PREVIA GLOBAL: recorre todo y NO escribe ────────────────────
  console.log('[1] vista previa global');
  let red = redFalsa(semilla());
  const prev = await recorrer({ tanda: 2 }, red);
  if (prev.falta) { af(false, 'no existe `admin-excel-actualizar-todo`: ' + prev.falta); }
  else if (prev.error) { af(false, 'la vista previa global falló: ' + JSON.stringify(prev.error).slice(0, 200)); }
  else {
    console.log('    vueltas=' + prev.vueltas + ' · total=' + prev.total + ' · eventos=' + prev.eventos.length);
    prev.eventos.forEach((e) => console.log(`      ${String(e.evento_id).padEnd(9)} abonos=${(e.plan.abonos || []).length} ($${(e.plan.abonos||[]).reduce((a,x)=>a+x.monto,0)}) totales=${(e.plan.totales||[]).length} altas=${(e.plan.altas||[]).length} negativas=${(e.plan.negativas||[]).length}`));
    af(red.escrituras.length === 0, 'LA VISTA PREVIA GLOBAL ESCRIBIÓ ' + red.escrituras.length + ' vez(ces)');
    af(prev.total === 3, 'dice que hay ' + prev.total + ' evento(s) y son 3');
    af(prev.eventos.length === 3, 'recorrió ' + prev.eventos.length + ' evento(s), se esperaban 3');
    // 🔒 SIN SALTARSE NI REPETIR: la continuación es la parte fácil de romper.
    const ids = prev.eventos.map((e) => e.evento_id);
    af(new Set(ids).size === 3 && EVENTOS.every((e) => ids.includes(e)),
       'la paginación se saltó o repitió eventos: ' + JSON.stringify(ids));
    af(prev.vueltas === 2, 'con tanda=2 y 3 eventos se esperaban 2 vueltas y hubo ' + prev.vueltas);
    // El agregado, que es lo que Memo mira primero.
    const r = (prev.ultimo || {}).acumulado || {};
    console.log('    acumulado del servidor: ' + JSON.stringify(r));
    af(r && typeof r.abonos === 'number', 'no viene el acumulado por tanda: ' + JSON.stringify(r));
  }

  // ── [2] APLICAR TODO: Δ contados y las reglas de 1b intactas ─────────────
  console.log('\n[2] aplicar todo');
  red = redFalsa(semilla());
  const ap = await recorrer({ tanda: 2, confirmar: true }, red);
  if (!ap.falta && !ap.error) {
    const t = red.tablas;
    console.log('    abonos_viajero: 0 → ' + cuenta(t, 'abonos_viajero') + ' · escrituras ' + red.escrituras.length);
    ap.eventos.forEach((e) => console.log(`      ${String(e.evento_id).padEnd(9)} → abonos ${(e.resultado.abonos||[]).length} · totales ${(e.resultado.totales||[]).length} · errores ${(e.resultado.errores||[]).length}`));
    // Ana: Excel 1,500 vs sistema 1,000 → +$500. Eva: 1,000 vs 500 → +$500.
    af(cuenta(t, 'abonos_viajero') === 2, 'se escribieron ' + cuenta(t, 'abonos_viajero') + ' abono(s), se esperaban 2 (Ana y Eva)');
    af(red.escrituras.length > 0, 'la corrida buena no escribió NADA: los Δ 0 de abajo no valdrían nada');
    // 🔒 LA NEGATIVA, JAMÁS — también en el global.
    const abBeto = (t.abonos_viajero || []).filter((x) => x.viajero_id === 'v-beto');
    af(abBeto.length === 0, 'EL GLOBAL APLICÓ UNA NEGATIVA: le escribió ' + abBeto.length + ' abono(s) a Beto');
    // 🔒 EL DERIVADO SÍ, EL EXACTO DE LIBRETA NO.
    const cris = (t.viajeros_evento || []).find((v) => v.id === 'v-cris');
    const dina = (t.viajeros_evento || []).find((v) => v.id === 'v-dina');
    console.log('    Cris (derivado) ' + cris.total_contrato + ' · Dina (exacta) ' + dina.total_contrato);
    af(cris.total_contrato === 7850, 'el derivado no se aplicó en el global: ' + cris.total_contrato);
    af(dina.total_contrato === 4200, 'EL GLOBAL TOCÓ UN EXACTO DE LIBRETA: ' + dina.total_contrato);
    // 🔒 LA BAJA, JAMÁS.
    const zul = (t.viajeros_evento || []).find((v) => v.id === 'v-baja');
    af(zul && zul.abonado_previo === 3000 && !/careo/i.test(String(zul.notas)), 'el global tocó a la BAJA: ' + JSON.stringify(zul));
    af(cuenta(t, 'viajeros_evento') === 6, 'el global dio de alta a alguien: ' + cuenta(t, 'viajeros_evento') + ' filas (eran 6)');
  }

  // ── [3] DOBLE CLIC GLOBAL: la segunda pasada no escribe ──────────────────
  console.log('\n[3] segundo clic global');
  if (!ap.falta && !ap.error) {
    const red2 = redFalsa(red.tablas);
    const ap2 = await recorrer({ tanda: 2, confirmar: true }, red2);
    console.log('    escrituras 1er recorrido: ' + red.escrituras.length + ' · 2º: ' + red2.escrituras.length);
    af(!ap2.error, 'el segundo recorrido falló: ' + JSON.stringify(ap2.error || '').slice(0, 150));
    af(red2.escrituras.length === 0, 'EL SEGUNDO CLIC GLOBAL ESCRIBIÓ ' + red2.escrituras.length
       + ' vez(ces): ' + JSON.stringify(red2.escrituras.map((e) => e.tabla + ':' + e.op)));
  }

  // ── [4] UN EVENTO TRUENA: los demás siguen, y se NOMBRA ─────────────────
  // 🔒 Un careo a medias se DICE, no se esconde. Si un evento tumbara la
  // corrida, un Excel mal desplegado dejaría a Memo sin actualizar los otros
  // 105; y si se lo tragara en silencio, creería que ya cuadró todo.
  console.log('\n[4] un evento truena a media corrida');
  let rot = { eventos: [] };
  try {
  const red3 = redFalsa(semilla({ rompe: 'ev-dos' }));
  rot = await recorrer({ tanda: 2, confirmar: true }, red3);
  if (!rot.falta && !rot.error) {
    const conError = rot.eventos.filter((e) => e.error);
    const sanos = rot.eventos.filter((e) => !e.error);
    console.log('    eventos: ' + rot.eventos.length + ' · con error: ' + conError.length
      + ' → ' + JSON.stringify(conError.map((e) => e.evento_id + ':' + (e.error.codigo || ''))));
    af(rot.eventos.length === 3, 'la corrida se detuvo: reportó ' + rot.eventos.length + ' de 3');
    af(conError.length === 1 && conError[0].evento_id === 'ev-dos',
       'el evento roto no se NOMBRA con su código: ' + JSON.stringify(conError.map((e) => e.evento_id)));
    // ⚠️ Con índice, no a pelo: si el sabotaje hace que NO haya errores, esto
    // reventaba con «Cannot read properties of undefined» y el arnés se CAÍA —
    // cazaba el sabotaje por accidente y dejaba [5] y [6] sin ejercitar.
    af(conError[0] && conError[0].error && conError[0].error.codigo === 'NO_ES_JSON',
       'el error no trae su código: ' + JSON.stringify(conError[0] && conError[0].error));
    af(sanos.length === 2, 'los eventos sanos no siguieron: ' + sanos.length);
    // Y los sanos SÍ se aplicaron.
    af(cuenta(red3.tablas, 'abonos_viajero') === 2,
       'con un evento roto, los sanos escribieron ' + cuenta(red3.tablas, 'abonos_viajero') + ' abono(s), se esperaban 2');
    // Cris vive en el evento roto: NO se pudo tocar.
    const cris3 = (red3.tablas.viajeros_evento || []).find((v) => v.id === 'v-cris');
    af(cris3.total_contrato === 7200, 'se tocó una fila del evento que NO se pudo cosechar: ' + cris3.total_contrato);
  } else if (!rot.falta) { af(false, 'un evento roto TUMBÓ la corrida entera: ' + JSON.stringify(rot.error).slice(0, 150)); }
  } catch (e) { af(false, 'la sección del evento roto se CAYÓ: ' + e.message); }

  // ── [5] CONTROL POSITIVO del contador de escrituras ─────────────────────
  console.log('\n[5] CONTROL POSITIVO');
  if (!ap.falta) {
    const red4 = redFalsa(semilla());
    const orig = red4.fetchFalso;
    red4.fetchFalso = async (u, o) => {
      const r = await orig(u, o);
      if (String(u).includes('/abonos_viajero') && o && o.method === 'POST') {
        await orig('https://npgnhsmwpcipxgvfxrho.supabase.co/rest/v1/abonos_viajero',
          { method: 'POST', body: JSON.stringify({ viajero_id: 'saboteado', monto: 1 }) });
      }
      return r;
    };
    await recorrer({ tanda: 3, confirmar: true }, red4);
    const extra = (red4.tablas.abonos_viajero || []).filter((x) => x.viajero_id === 'saboteado').length;
    console.log('    red saboteada que escribe de más → filas extra: ' + extra);
    af(extra > 0, 'el contador NO ve una escritura metida a propósito: sus Δ 0 no valen nada');
  }

  // ── [6] LA PANTALLA, RENDERIZADA DE VERDAD ───────────────────────────────
  console.log('\n[6] la pantalla');
  try {
    const fuente = require('fs').readFileSync(path.join(RAIZ, 'kamehouse-eventos.js'), 'utf8');
    const corte = (n) => {
      const m = new RegExp('(?:async\\s+)?function\\s+' + n + '\\s*\\(').exec(fuente);
      if (!m) throw new Error('no encontré ' + n);
      let prof = 0;
      for (let k = fuente.indexOf('{', m.index); k < fuente.length; k++) {
        if (fuente[k] === '{') prof++; else if (fuente[k] === '}' && --prof === 0) return fuente.slice(m.index, k + 1);
      }
      throw new Error('llaves desbalanceadas en ' + n);
    };
    const api = new Function(corte('_evtEsc') + '\n' + corte('_evtMxn') + '\n' + corte('_excelTodoSumar')
      + '\n' + corte('_excelTodoTabla') + '\n' + corte('_excelTodoPreviaHtml') + '\n' + corte('_excelTodoHechoHtml')
      + '\nreturn { _excelTodoPreviaHtml, _excelTodoHechoHtml, _excelTodoSumar };')();

    // La vista previa se pinta con la salida REAL del recorrido de [1].
    const html = api._excelTodoPreviaHtml(prev);
    af(/todav[ií]a NO se ha escrito nada/i.test(html), 'la vista previa global no avisa de que aún no escribió');
    af(/bajas y los ambiguos no se aplican nunca/i.test(html), 'la pantalla global no dice que las bajas jamás se aplican');
    // 🔒 SOLO SE LISTAN LOS EVENTOS CON ALGO QUE HACER. Con 106 eventos,
    // pintar los 90 que ya cuadran escondería los 16 que importan.
    af(html.includes('ev-uno') && html.includes('ev-dos') && html.includes('ev-tres'),
       'la tabla no lista los eventos con trabajo');
    const sumas = api._excelTodoSumar(prev.eventos);
    console.log('    suma del navegador: ' + JSON.stringify(sumas));
    // La suma del navegador tiene que CUADRAR con lo que el servidor planeó —
    // si divergieran, Memo confirmaría una cifra y se escribiría otra.
    const abonosServidor = prev.eventos.reduce((a, e) => a + ((e.plan && e.plan.abonos) || []).length, 0);
    af(sumas.abonos === abonosServidor,
       'la suma de la pantalla (' + sumas.abonos + ') no cuadra con lo que el servidor planeó (' + abonosServidor + ')');
    af(/2 abono\(s\)/.test(html) || sumas.abonos === 2, 'la vista previa no dice cuántos abonos: ' + sumas.abonos);

    // El evento ROTO tiene que VERSE, con su código.
    const htmlRoto = api._excelTodoPreviaHtml({ eventos: rot.eventos, total: 3 });
    af(/NO_ES_JSON/.test(htmlRoto), 'la pantalla no enseña el código del evento que no se pudo leer');
    af(/ev-dos/.test(htmlRoto), 'la pantalla no nombra el evento roto');
    af(/no se pudieron leer/.test(htmlRoto), 'la pantalla no cuenta los eventos que fallaron');

    // Y un recorrido SIN trabajo lo dice en vez de enseñar una tabla vacía.
    const htmlVacio = api._excelTodoPreviaHtml({ eventos: [{ evento_id: 'x', plan: { abonos: [], totales: [], altas: [], negativas: [], saltados: [] } }], total: 1 });
    af(/Todo cuadra/.test(htmlVacio), 'con nada que aplicar la pantalla no lo dice: una tabla vacía no es una respuesta');
    console.log('    previa ' + html.length + ' bytes · roto ✓ · vacío ✓');
  } catch (e) { af(false, 'la sección de pantalla se CAYÓ: ' + e.message); }

  // ── [7] [CUADRE-4] LA VISTA DEL RESUMEN: por TIPO, y sin tecnicismos ─────
  // Dos LENTES del mismo endpoint, no dos tuberías: la técnica de siete
  // montones se queda en Eventos para Jane, y ésta —agrupada por tipo y
  // cruzando todos los eventos— es la de Memo y Bulma en el Resumen.
  console.log('\n[7] la vista simple del Resumen');
  try {
    const fuente4 = require('fs').readFileSync(path.join(RAIZ, 'kamehouse-resumen.js'), 'utf8');
    const corte4 = (n) => {
      const m = new RegExp('(?:async\\s+)?function\\s+' + n + '\\s*\\(').exec(fuente4);
      if (!m) throw new Error('no encontré ' + n + ' en kamehouse-resumen.js');
      let prof = 0;
      for (let k = fuente4.indexOf('{', m.index); k < fuente4.length; k++) {
        if (fuente4[k] === '{') prof++; else if (fuente4[k] === '}' && --prof === 0) return fuente4.slice(m.index, k + 1);
      }
      throw new Error('llaves desbalanceadas en ' + n);
    };
    const fuenteE = require('fs').readFileSync(path.join(RAIZ, 'kamehouse-eventos.js'), 'utf8');
    const corteE = (n) => {
      const m = new RegExp('(?:async\\s+)?function\\s+' + n + '\\s*\\(').exec(fuenteE);
      let prof = 0;
      for (let k = fuenteE.indexOf('{', m.index); k < fuenteE.length; k++) {
        if (fuenteE[k] === '{') prof++; else if (fuenteE[k] === '}' && --prof === 0) return fuenteE.slice(m.index, k + 1);
      }
      throw new Error('no encontré ' + n);
    };
    const api4 = new Function(corteE('_evtEsc') + '\n' + corteE('_evtMxn') + '\n'
      + corte4('_resumenActualizarAgrupar') + '\n' + corte4('_resumenActualizarHtml')
      + '\nreturn { agrupar: _resumenActualizarAgrupar, html: _resumenActualizarHtml };')();

    // Se pinta con la salida REAL del recorrido de [1], no con un objeto a mano.
    const g = api4.agrupar(prev.eventos);
    console.log('    lugares nuevos=' + g.lugares.length + ' · abonos=' + g.abonos.length
      + ' · avisos: bajas=' + g.bajas.length + ' negativas=' + g.negativas.length + ' saltados=' + g.saltados.length);
    af(g.lugares.length === 1, 'agrupó ' + g.lugares.length + ' lugar(es) nuevo(s), se esperaba 1 (Fito)');
    af(g.abonos.length === 2, 'agrupó ' + g.abonos.length + ' abono(s), se esperaban 2 (Ana y Eva)');
    // 🔒 CRUZA LOS EVENTOS: la vista es por TIPO, no por evento. Ana es de
    // ev-uno y Eva de ev-tres, y salen en la MISMA lista.
    const evsDeAbonos = new Set(g.abonos.map((x) => x.evento_id));
    af(evsDeAbonos.size === 2, 'la lista de abonos no cruza eventos: ' + JSON.stringify([...evsDeAbonos]));

    const html = api4.html(g, prev.total);
    // 🔒 EL SLUG NO SE ENSEÑA. Memo lee «Tres Fest 2026», no «ev-tres»: un
    // slug en la pantalla del uso diario es lenguaje de la base, no del negocio.
    af(/Tres Fest 2026/.test(html) && /Ana Tour - Primera Gira/.test(html),
       'la vista simple no pinta el nombre bonito del evento');
    // 🔒 EL SLUG NO SE ENSEÑA — y se mide POR EL HECHO, no buscando la palabra.
    // Un `html.includes(slug)` es un falso positivo esperando: contra
    // producción, el slug `arre` «apareció» dentro del APELLIDO «Barrera» de
    // tres personas. Lo que de verdad importa es qué se pinta en el LUGAR del
    // tour, así que se extraen esas etiquetas y se exige que ninguna sea un
    // slug. (Es «un prefijo no es un ancla», otra vez.)
    const etiquetas = [...html.matchAll(/<span data-tour[^>]*> — ([^<]+)</g)].map((m) => m[1].trim());
    const slugs = new Set(prev.eventos.map((e) => e.evento_id));
    console.log('    etiquetas de tour pintadas: ' + JSON.stringify([...new Set(etiquetas)]));
    af(etiquetas.length > 0, 'no se pintó NINGUNA etiqueta de tour: la aserción de abajo pasaría en hueco');
    af(!etiquetas.some((t) => slugs.has(t)),
       'EL SLUG SE COLÓ al lugar del tour: ' + JSON.stringify(etiquetas.filter((t) => slugs.has(t))));
    af(etiquetas.every((t) => /Ana Tour|Dos en Concierto|Tres Fest/.test(t)),
       'una etiqueta de tour no es un nombre bonito: ' + JSON.stringify(etiquetas));
    // Los datos que Memo pidió ver en cada renglón.
    // 🔒 La vista del uso diario tiene que decir que TODAVÍA NO GUARDÓ. La
    // aserción de esto existía solo para la vista de Eventos: un sabotaje que
    // borraba el aviso de ESTA pantalla pasaba verde.
    af(/todav[ií]a no se ha guardado nada/i.test(html),
       'la vista del Resumen no avisa de que aún no se ha guardado nada');
    af(/Fito Nuevo/.test(html), 'el lugar nuevo no trae su nombre');
    af(/cheap/i.test(html), 'el lugar nuevo no trae su paquete');
    af(/Zona C/.test(html), 'el lugar nuevo no trae su zona');
    af(/Ana Uno/.test(html) && /plus/i.test(html), 'el abono no trae nombre y paquete');
    // El encabezado con los totales, en el idioma de Memo.
    af(/1 lugar/.test(html) && /2 abonos/.test(html),
       'el encabezado no dice «N lugares nuevos · N abonos por $X»');
    af(/\$1,000/.test(html), 'el encabezado no trae el monto de los abonos');
    // Los avisos, COLAPSADOS y sin tecnicismos.
    af(/<details/.test(html), 'los avisos no van en un desplegable colapsado');
    af(/Beto Uno/.test(html), 'la negativa no se nombra en los avisos');
    af(/Zulema Baja/.test(html), 'la baja no se nombra en los avisos');
    af(!/montón|ambiguos|totales_contrato|derivado/i.test(html.replace(/<details[\s\S]*/, '')),
       'la parte de arriba usa lenguaje de auditoría, no el de Memo');
    console.log('    HTML ' + html.length + ' bytes · sin slugs ✓');

    // CONTROL POSITIVO del candado del slug: si el nombre bonito no llega,
    // el slug SÍ aparece — así se sabe que la aserción de arriba puede morder.
    const sinNombre = prev.eventos.map((e) => ({ ...e, nombre_evento: null }));
    const htmlSin = api4.html(api4.agrupar(sinNombre), prev.total);
    const etiqSin = [...htmlSin.matchAll(/<span data-tour[^>]*> — ([^<]+)</g)].map((m) => m[1].trim());
    af(etiqSin.some((t) => slugs.has(t)),
       'sin nombre bonito NO cae al slug en el lugar del tour: entonces la aserción de arriba no prueba nada');
  } catch (e) { af(false, 'la sección de la vista del Resumen se CAYÓ: ' + e.message); }

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); process.exit(1); });
