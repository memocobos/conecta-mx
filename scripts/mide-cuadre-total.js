#!/usr/bin/env node
// =============================================================================
// scripts/mide-cuadre-total.js — EL CAREO DE CUADRE-1a
// =============================================================================
// Entra por el HANDLER REAL de `admin-excel-careo` y simula UN SALTO MÁS
// ADENTRO: el `fetch`. El mismo `global.fetch` falso atiende a los DOS de
// afuera — el Apps Script del Excel y PostgREST — así que corren de verdad la
// cosecha (`_lib/cosecha-excel`), el protocolo (`_lib/excel-careo`) y el
// handler. No hay mock de ruta: nadie sustituye a `parsearPestana` ni a
// `carear`; lo único fingido es la red.
//
// 🔒 EL CANDADO DE ESTA TUERCA: CUADRE-1a **SOLO LEE**. El careo cuenta las
// escrituras contra PostgREST y exige CERO — y no por grep de que el código no
// las nombra, sino porque la red falsa registra CUALQUIER método que no sea
// GET, a cualquier tabla. Con su CONTROL POSITIVO en [7]: un handler saboteado
// que sí escribe tiene que poner esto en ROJO.
//
// LOS ENCABEZADOS NO SON INVENTADOS. La fila de cabecera de los fixtures se
// copió LETRA POR LETRA de pestañas reales, leídas con `_lib/cosecha-excel`
// contra el Apps Script de producción el 20-sep-2026:
//   · «Young Miko- 19 de Septiembre» → Total en la columna 21
//   · «Bruno Mars - 4 de diciembre»  → Total en la columna 22 (trae una vacía
//     de más en la 15). Por eso la columna se busca POR ENCABEZADO: la
//     posición NO es estable entre pestañas. Medido, no supuesto.
// =============================================================================

const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

// ── LOS ENCABEZADOS REALES ───────────────────────────────────────────────────
// Copiados de la medición del 20-sep. Se dejan ENTEROS a propósito: recortarlos
// a «las columnas que me importan» es fabricar una pestaña que no existe, y el
// hoyo del separo sin encabezado (29-ago) nació justo de mirar de menos.
const CAB_YOUNGMIKO = ['No.','Nombre','Paquete','Boleto','Separo','1','2','3','4','5','6','7','8','9','10',
  'Preventa','Costo','Habitación','Pago Hab','Avión - Bus','Codigo','Total','Abonado','Resta','TALLA',
  'CORREO','CELULAR','EMERGENCIA','HABITACION COMPARTIDA CON','','','','','Luneta','$0','','Stay',''];
const CAB_BRUNOMARS = ['No.','Nombre','Paquete','Boleto','Separo','1','2','3','4','5','6','7','8','9','10',
  '','Preventa','Costo','Habitación','Pago Hab','Avión - Bus','Codigo','Total','Abonado','Resta','TALLA',
  'CORREO','CELULAR','EMERGENCIA','HABITACION COMPARTIDA CON','','','','','Luneta','$0','','Stay',''];
// La misma cabecera, SIN la celda «Total». Es el caso de la columna ausente.
const CAB_SIN_TOTAL = CAB_YOUNGMIKO.map((c) => (c === 'Total' ? 'Pagado' : c));

// Arma una fila de pestaña por nombre de columna, para no contar celdas a mano.
function filaExcel(cab, valores) {
  const f = new Array(cab.length).fill('');
  for (const [col, v] of Object.entries(valores)) {
    const i = cab.indexOf(col);
    if (i < 0) throw new Error('el fixture nombra una columna que la cabecera no tiene: ' + col);
    f[i] = v;
  }
  return f;
}
// Las pestañas reales traen el encabezado en la fila 10, con basura arriba.
const conPreludio = (cab, filas) => [
  ...Array.from({ length: 10 }, () => ['', '', '']), cab, ...filas,
];

// ── LA RED FALSA ─────────────────────────────────────────────────────────────
// Atiende al Apps Script y a PostgREST. Todo lo que no sea GET contra PostgREST
// queda anotado en `escrituras` — el medidor del candado de solo-lectura.
function redFalsa({ pestanas, base, saboteado }) {
  const escrituras = [];
  const SB = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
  // 🔒 EL `select` SE RESPETA. La primera versión devolvía la fila ENTERA
  // pasara lo que pasara, y por eso un sabotaje que le quitaba
  // `total_contrato` al select del handler salía VERDE: la red falsa se lo
  // regalaba de vuelta. Es la cuarta forma en que un mock miente —inventa lo
  // que la base real no manda—, y aquí se tapa proyectando de verdad.
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
  const fetchFalso = async (url, opts) => {
    const met = (opts && opts.method) || 'GET';
    // ── el Apps Script del Excel ──
    if (String(url).startsWith('https://script.test')) {
      const cuerpo = JSON.parse(opts.body);
      const filas = pestanas[cuerpo.pestana];
      if (!cuerpo.pestana) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, pestanas: Object.keys(pestanas) }) };
      if (!filas) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, codigo: 'SIN_PESTANA', error: 'no existe' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, filas, pestanas: Object.keys(pestanas) }) };
    }
    // ── PostgREST ──
    if (String(url).startsWith(SB)) {
      const u = new URL(url);
      const tabla = u.pathname.replace('/rest/v1/', '');
      if (met !== 'GET') { escrituras.push({ tabla, met }); return { ok: true, status: 201, json: async () => [], text: async () => '' }; }
      if (saboteado && tabla === 'viajeros_evento') {
        // CONTROL POSITIVO: un handler que sí escribiera pasaría por aquí.
        escrituras.push({ tabla: 'viajeros_evento', met: 'PATCH' });
      }
      const filas = proyectar(filtrar(base[tabla] || [], u.searchParams), u.searchParams);
      return { ok: true, status: 200, json: async () => filas, text: async () => '' };
    }
    throw new Error('la red falsa no conoce ese destino: ' + url);
  };
  return { escrituras, fetchFalso };
}

async function correr({ eventoId, pestanas, base, saboteado }) {
  const red = redFalsa({ pestanas, base, saboteado });
  process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec';
  process.env.EXCEL_SCRIPT_TOKEN = 't';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  global.fetch = red.fetchFalso;

  // El PORTERO se ejercita, no se salta: doble UN SALTO MÁS ADENTRO.
  let llamadasAuth = 0;
  const va = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async (ev, roles) => { llamadasAuth++; return { valid: true, roles, user: { id: 'u1' } }; },
  } };
  for (const f of ['admin-excel-careo.js', '_lib/excel-careo.js', '_lib/cosecha-excel.js']) {
    delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))];
  }
  const mod = require(path.join(RAIZ, 'netlify/functions/admin-excel-careo.js'));
  const res = await mod.handler({
    httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
    body: JSON.stringify({ evento_id: eventoId }),
  });
  return { res, d: JSON.parse(res.body), escrituras: red.escrituras, llamadasAuth };
}

// ── LA SEMILLA ───────────────────────────────────────────────────────────────
// Siete personas, cada una un caso que el montón `totales_contrato` tiene que distinguir.
// Los montos son los de las filas reales medidas (Young Miko: Total $5,950 con
// Costo 5300 + Pago Hab 650), para no inventar aritmética.
const CASO = () => ({
  eventoId: 'youngmiko',
  pestanas: {
    'Young Miko- 19 de Septiembre': conPreludio(CAB_YOUNGMIKO, [
      // [a] CUADRA: Excel 5,950 = sistema 5,950 → NO entra al montón.
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'David Lara', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Separo': '$500', '1': '$5,480', 'Costo': '5300', 'Pago Hab': '650', 'Total': '$5,950', 'TALLA': 'M' }),
      // [b] DIFIERE sobre un EXACTO (notas de la libreta, sin «derivado») → cambio real.
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Valeria Colin', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Separo': '$500', '1': '$5,480', 'Costo': '5300', 'Pago Hab': '650', 'Total': '$5,950', 'TALLA': 'S' }),
      // [c] DIFIERE sobre un DERIVADO → esperado, la pestaña gana.
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Ana Ruiz', 'Paquete': 'PLUS', 'Boleto': 'Zona GNP', 'Separo': '$500', '1': '$7,000', 'Costo': '7200', 'Pago Hab': '650', 'Total': '$7,850', 'TALLA': 'L' }),
      // [d] CELDA TOTAL VACÍA — como las 12 de 12 de «Calle 24 - 3 de Sep».
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Beto Paz', 'Paquete': 'PLUS', 'Boleto': 'GNP General', 'Separo': '$300', '1': '$2,575', 'Costo': '$5,450', 'Total': '', 'TALLA': 'XL' }),
      // [e] DOS FILAS, MISMA PERSONA: los totales se SUMAN (5,950 + 5,950 = 11,900).
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Cris Mora', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Separo': '$500', '1': '$5,450', 'Costo': '5300', 'Pago Hab': '650', 'Total': '$5,950', 'TALLA': 'M' }),
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Cris Mora', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Separo': '$500', '1': '$5,450', 'Costo': '5300', 'Pago Hab': '650', 'Total': '$5,950', 'TALLA': 'M' }),
      // [f] TOTAL $0 EXPLÍCITO contra sistema 0 → cuadra, NO entra. ($0 no es vacío.)
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Dani Sol', 'Paquete': 'CHEAP', 'Boleto': 'Poniente Baja', 'Separo': '$1,000', 'Costo': '', 'Total': '$0', 'TALLA': '-' }),
      // [h] EL SISTEMA NO SABE SU TOTAL (`total_contrato` NULL): son las filas
      //     que TOTAL-1 dejó con «⚠ total pendiente» esperando este careo.
      //     Tienen que SALIR, con `sistema_total: null` — invisible otro mes es
      //     justo lo que la tuerca viene a arreglar.
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Rosa Vela', 'Paquete': 'PLUS', 'Boleto': 'Zona GNP', 'Separo': '$500', '1': '$1,500', 'Costo': '5350', 'Pago Hab': '650', 'Total': '$6,000', 'TALLA': 'M' }),
      // [i] «$0» TECLEADO en la pestaña contra un total bueno en el sistema.
      //     Medido: 20 de 78 renglones reales son de esta clase. SÍ entra —es
      //     un número, y filtrarlo sería inventar una regla— pero se CUENTA
      //     aparte, porque aplicarlo pondría un total bueno en cero.
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Tino Gil', 'Paquete': 'PLUS', 'Boleto': 'Zona GNP', 'Separo': '$500', '1': '$900', 'Costo': '', 'Total': '$0', 'TALLA': 'L' }),
      // [g] La CHATARRA no es nadie, ni siquiera para los totales.
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Vendido Memo', 'Boleto': 'Cancha General', 'Total': '$99,999' }),
    ]),
  },
  base: {
    excel_pestanas: [{ evento_id: 'youngmiko', pestana: 'Young Miko- 19 de Septiembre', regla_zona: null, activa: true, notas: null }],
    viajeros_evento: [
      { id: 'v-a', evento_id: 'youngmiko', nombre: 'David Lara',    tipo_viajero: 'cliente', abonado_previo: 5980, total_contrato: 5950, notas: 'Migrado Excel 28-ago (Jane) · Hab Doble $650 · resta -30', zona_boleto: 'Cancha General', tipo_paquete: 'PLUS' },
      { id: 'v-b', evento_id: 'youngmiko', nombre: 'Valeria Colin', tipo_viajero: 'cliente', abonado_previo: 5980, total_contrato: 4200, notas: 'Migrado Excel 28-ago (Jane) · Hab Doble $650', zona_boleto: 'Cancha General', tipo_paquete: 'PLUS' },
      { id: 'v-c', evento_id: 'youngmiko', nombre: 'Ana Ruiz',      tipo_viajero: 'cliente', abonado_previo: 7000, total_contrato: 7200, notas: 'TOTAL-1: contrato derivado del catálogo (se afina contra la pestaña)', zona_boleto: 'Zona GNP', tipo_paquete: 'PLUS' },
      { id: 'v-d', evento_id: 'youngmiko', nombre: 'Beto Paz',      tipo_viajero: 'cliente', abonado_previo: 2575, total_contrato: 1111, notas: 'Migrado Excel 28-ago (Jane)', zona_boleto: 'GNP General', tipo_paquete: 'PLUS' },
      { id: 'v-e', evento_id: 'youngmiko', nombre: 'Cris Mora',     tipo_viajero: 'cliente', abonado_previo: 10900, total_contrato: 5950, notas: 'Migrado Excel 28-ago (Jane)', zona_boleto: 'Cancha General', tipo_paquete: 'PLUS' },
      { id: 'v-i', evento_id: 'youngmiko', nombre: 'Tino Gil',      tipo_viajero: 'cliente', abonado_previo: 1400, total_contrato: 3900, notas: 'Migrado Excel 28-ago (Jane)', zona_boleto: 'Zona GNP', tipo_paquete: 'PLUS' },
      { id: 'v-h', evento_id: 'youngmiko', nombre: 'Rosa Vela',     tipo_viajero: 'cliente', abonado_previo: 2000, total_contrato: null, notas: 'Migrado Excel 28-ago (Jane) · ⚠ total pendiente', zona_boleto: 'Zona GNP', tipo_paquete: 'PLUS' },
      { id: 'v-f', evento_id: 'youngmiko', nombre: 'Dani Sol',      tipo_viajero: 'cliente', abonado_previo: 1000, total_contrato: 0,    notas: '⚠ total pendiente', zona_boleto: 'Poniente Baja', tipo_paquete: 'CHEAP' },
    ],
    abonos_viajero: [],
  },
});

(async () => {
  console.log('CAREO CUADRE-1a · el montón de TOTALES, por el handler REAL\n');
  const { d, escrituras, llamadasAuth, res } = await correr(CASO());
  af(res.statusCode === 200, 'el handler no contestó 200, sino ' + res.statusCode + ': ' + JSON.stringify(d).slice(0, 200));
  af(llamadasAuth === 1, 'el handler no llamó al portero');

  // ── [1] EL MAPA: la columna Total, POR ENCABEZADO ─────────────────────────
  console.log('[1] el mapa de columnas');
  const mapa = ((d.pestanas || [])[0] || {}).mapa || {};
  console.log('    mapa.total = ' + JSON.stringify(mapa.total) + '   (la cabecera real de Young Miko la trae en 21)');
  af(mapa.total === 21, 'mapa.total = ' + JSON.stringify(mapa.total) + ', se esperaba 21 — el índice no viaja en la respuesta o se leyó mal');

  // ── [2] EL MONTÓN NUEVO EXISTE Y NO VIENE VACÍO ───────────────────────────
  console.log('\n[2] el montón `totales_contrato`');
  af(Array.isArray(d.totales_contrato), 'no hay montón `totales_contrato` en la respuesta (llegó ' + typeof d.totales_contrato + ')');
  const T = d.totales_contrato || [];
  T.forEach((t) => console.log(`    · ${t.nombre.padEnd(16)} excel=${t.excel_total} sistema=${t.sistema_total} dif=${t.diferencia} derivado=${t.derivado}`));
  // CANDADO DE CARDINALIDAD: si el montón sale vacío, todo lo de abajo pasa en
  // hueco y el verde no diría nada.
  af(T.length > 0, 'el montón `totales_contrato` salió VACÍO: el caso de prueba tiene dos diferencias sembradas');
  // TRES diferencias sembradas, no dos: Valeria (exacta), Ana (derivada) y Cris
  // (dos filas que SUMAN). La primera vez escribí 2 aquí y el careo se puso
  // rojo — la aritmética era mía, no del código.
  af(T.length === 5,
     'el montón trae ' + T.length + ' renglón(es), se esperaban 5 (Valeria · Ana derivada · Cris de dos filas · Rosa sin total en el sistema · Tino con $0 tecleado)');

  // ── [3] QUIÉN ENTRA Y QUIÉN NO ────────────────────────────────────────────
  console.log('\n[3] quién entra');
  const por = (n) => T.find((x) => x.nombre === n);
  // [b] diferencia sobre un EXACTO
  const val = por('Valeria Colin');
  af(!!val, 'Valeria (Excel 5,950 vs sistema 4,200) NO entró al montón');
  if (val) {
    af(val.excel_total === 5950, 'Valeria: excel_total = ' + val.excel_total + ', se esperaba 5950');
    af(val.sistema_total === 4200, 'Valeria: sistema_total = ' + val.sistema_total + ', se esperaba 4200');
    af(val.diferencia === 1750, 'Valeria: diferencia = ' + val.diferencia + ', se esperaba 1750');
    af(val.derivado === false, 'Valeria: derivado = ' + val.derivado + ' — sus notas NO dicen «derivado»');
    af(val.viajero_id === 'v-b', 'Valeria: viajero_id = ' + val.viajero_id);
  }
  // [h] el sistema TODAVÍA NO SABE su total: sale, y lo dice como null
  const rosa = por('Rosa Vela');
  af(!!rosa, 'Rosa (sistema sin total_contrato, Excel $6,000) NO entró: las filas de «⚠ total pendiente» son justo las que este careo viene a curar');
  if (rosa) {
    af(rosa.sistema_total === null, 'Rosa: sistema_total = ' + JSON.stringify(rosa.sistema_total)
       + ' — un total que la base no sabe es null, NO cero: aplanarlo borra la diferencia entre «contrato de $0» y «todavía no se sabe»');
    af(rosa.diferencia === 6000, 'Rosa: diferencia = ' + rosa.diferencia + ', se esperaba 6000');
  }
  // [i] «$0» tecleado: entra (es un número) pero se cuenta aparte
  const tino = por('Tino Gil');
  af(!!tino, 'Tino ($0 tecleado en la pestaña contra $3,900 del sistema) NO entró: «$0» es un número, no un hueco');
  if (tino) af(tino.excel_total === 0 && tino.diferencia === -3900,
    'Tino: excel_total=' + tino.excel_total + ' diferencia=' + tino.diferencia + ', se esperaban 0 y -3900');
  af((d.totales || {}).totales_contrato_en_cero === 1,
     'el conteo `totales_contrato_en_cero` dice ' + (d.totales || {}).totales_contrato_en_cero
     + ' y debe decir 1 — sin él, los «$0» se leen como diferencias sueltas y CUADRE-1b los aplicaría a ciegas');
  // [c] diferencia sobre un DERIVADO
  const ana = por('Ana Ruiz');
  af(!!ana, 'Ana (derivada, Excel 7,850 vs sistema 7,200) NO entró al montón');
  if (ana) af(ana.derivado === true, 'Ana: derivado = ' + ana.derivado + ' — sus notas SÍ dicen «derivado»');

  console.log('\n    quién NO entra:');
  // [a] cuadra
  af(!por('David Lara'), 'David CUADRA (5,950 = 5,950) y aun así entró al montón');
  console.log('      · David Lara  — cuadra ' + (!por('David Lara') ? '✓' : '✗'));
  // [d] celda vacía → total null, y NO es una diferencia
  af(!por('Beto Paz'), 'Beto trae la celda Total VACÍA y entró al montón: un hueco no es una diferencia de dinero');
  console.log('      · Beto Paz    — Total vacío ' + (!por('Beto Paz') ? '✓' : '✗'));
  // [f] $0 explícito contra 0
  af(!por('Dani Sol'), 'Dani tiene $0 en los dos lados y entró al montón');
  console.log('      · Dani Sol    — $0 = $0 ' + (!por('Dani Sol') ? '✓' : '✗'));
  // [g] chatarra
  af(!por('Vendido Memo'), 'LA CHATARRA se coló al montón de totales');
  console.log('      · Vendido Memo— chatarra ' + (!por('Vendido Memo') ? '✓' : '✗'));
  // [e] dos filas → SUMA. Cris: 5,950 + 5,950 = 11,900 vs sistema 5,950.
  const cris = por('Cris Mora');
  af(!!cris, 'Cris (dos filas, 5,950 + 5,950) NO entró al montón');
  if (cris) af(cris.excel_total === 11900, 'Cris: excel_total = ' + cris.excel_total + ', se esperaba 11900 (los totales se SUMAN, como el abonado)');

  // ── [4] LA COLUMNA AUSENTE ────────────────────────────────────────────────
  console.log('\n[4] la pestaña SIN columna Total');
  const sinCol = CASO();
  sinCol.pestanas = { 'Young Miko- 19 de Septiembre': conPreludio(CAB_SIN_TOTAL,
    [filaExcel(CAB_SIN_TOTAL, { 'Nombre': 'Valeria Colin', 'Boleto': 'Cancha General', '1': '$5,480', 'Pagado': '$5,950' })]) };
  const r4 = await correr(sinCol);
  const m4 = ((r4.d.pestanas || [])[0] || {}).mapa || {};
  console.log('    mapa.total = ' + JSON.stringify(m4.total) + ' · montón totales_contrato = ' + (r4.d.totales_contrato_contrato || []).length);
  af(m4.total === -1, 'sin celda «Total» el mapa debe decir -1 y dijo ' + JSON.stringify(m4.total));
  af((r4.d.totales_contrato_contrato || []).length === 0, 'sin columna Total el montón debe ir VACÍO y trajo ' + (r4.d.totales_contrato_contrato || []).length);

  // ── [5] LA POSICIÓN NO ES ESTABLE: Bruno Mars la trae en 22 ───────────────
  console.log('\n[5] la otra pestaña real (Bruno Mars: Total en 22)');
  const bm = CASO();
  bm.pestanas = { 'Young Miko- 19 de Septiembre': conPreludio(CAB_BRUNOMARS,
    [filaExcel(CAB_BRUNOMARS, { 'Nombre': 'Valeria Colin', 'Boleto': 'Platino', '1': '$5,480', 'Total': '$11,325' })]) };
  const r5 = await correr(bm);
  const m5 = ((r5.d.pestanas || [])[0] || {}).mapa || {};
  console.log('    mapa.total = ' + JSON.stringify(m5.total) + ' (por encabezado, no por posición)');
  af(m5.total === 22, 'en la cabecera de Bruno Mars el Total va en 22 y se leyó ' + JSON.stringify(m5.total)
     + ' — se está contando por posición fija');
  af((r5.d.totales_contrato || []).some((x) => x.excel_total === 11325), 'no leyó el total de la cabecera corrida');

  // ── [6] LOS SEIS MONTONES, INTACTOS ───────────────────────────────────────
  console.log('\n[6] los seis montones de antes');
  const SEIS = ['nuevos', 'pagos', 'bajas', 'iguales', 'apartados', 'ambiguos'];
  SEIS.forEach((k) => af(Array.isArray(d[k]), 'desapareció el montón `' + k + '`'));
  console.log('    ' + SEIS.map((k) => k + '=' + (d[k] || []).length).join(' · '));
  // Las llaves de sus renglones no se tocan: un consumidor que lea `excel` o
  // `base` en `pagos` tiene que seguir encontrándolas.
  // 🔒 EL ABONADO NO SE MOVIÓ. No basta con que los seis montones EXISTAN: hay
  // que exigir sus NÚMEROS, porque la forma más fácil de romperlos desde aquí
  // es meter la columna Total en `mapa.dinero` — el abonado de todo el mundo se
  // infla y el montón de pagos se vuelve basura, sin que falte ningún montón.
  // (Un sabotaje que hacía justo eso pasó VERDE hasta que existió esta parte.)
  // David: Separo $500 + pago1 $5,480 = $5,980, ni un peso del Total ($5,950).
  const davidIgual = (d.iguales || []).find((x) => x.nombre === 'David Lara');
  af(davidIgual && davidIgual.abonado === 5980,
     'el abonado de David salió ' + (davidIgual ? davidIgual.abonado : 'ausente')
     + ' y debe ser 5980 (Separo 500 + pago 5,480): la columna Total se coló a `mapa.dinero`');
  af(!(d.pestanas[0].mapa.dinero || []).includes(d.pestanas[0].mapa.total),
     'la columna Total entró a `mapa.dinero`: ahí solo van las que SUMAN al abonado');
  const unPago = (d.pagos || [])[0];
  af(!unPago || ('excel' in unPago && 'base' in unPago && 'diferencia' in unPago),
     'a los renglones de `pagos` les cambiaron las llaves');
  // 🔒 EL CHOQUE DE NOMBRE, ANCLADO. `d.totales` YA EXISTÍA y NO es un montón:
  // es el objeto de CONTEOS que la pantalla lee (`const t = d.totales || {}`).
  // El montón nuevo se llama `totales_contrato` justamente por eso — bautizarlo
  // `totales` habría dejado sin cuenta a los seis de antes, en silencio. Lo cazó
  // este careo antes de que existiera una línea del código.
  af(d.totales && !Array.isArray(d.totales) && typeof d.totales === 'object',
     '`d.totales` dejó de ser el objeto de conteos: la pantalla lee `d.totales.nuevos` y se quedaría en blanco');
  SEIS.forEach((k) => af(typeof (d.totales || {})[k] === 'number', 'se perdió el conteo `totales.' + k + '`'));
  af(typeof (d.totales || {}).totales_contrato === 'number', 'falta el conteo `totales.totales_contrato`');
  // ASERCIÓN DE AUSENCIA SOBRE LA SALIDA, no por grep del fuente: ningún
  // renglón de los seis montones estrena la llave `total`.
  const colado = SEIS.flatMap((k) => (d[k] || [])).find((r) => 'excel_total' in r || 'sistema_total' in r);
  af(!colado, 'un montón viejo estrenó llaves de total: ' + JSON.stringify(colado));

  // ── [7] SOLO LEE · y su CONTROL POSITIVO ──────────────────────────────────
  console.log('\n[7] FASE SOLO-LECTURA');
  console.log('    escrituras contra PostgREST: ' + escrituras.length + ' (debe ser 0)');
  af(escrituras.length === 0, 'CUADRE-1a ESCRIBIÓ: ' + JSON.stringify(escrituras));
  const r7 = await correr({ ...CASO(), saboteado: true });
  console.log('    CONTROL POSITIVO (red saboteada que sí escribe): ' + r7.escrituras.length + ' escritura(s)');
  af(r7.escrituras.length > 0, 'el contador de escrituras NO puede ponerse rojo: su 0 de arriba no vale nada');

  // ── [8] LA PANTALLA, RENDERIZADA DE VERDAD ────────────────────────────────
  // `node --check` solo dice que el archivo parsea. Aquí se EJECUTA
  // `_excelCareoHtml` con la salida REAL del handler de arriba y se mira el
  // HTML que sale — que es lo único que Bulma va a ver. Las funciones se
  // recortan por BALANCE DE LLAVES, no por «hasta la siguiente declaración».
  console.log('\n[8] la pantalla');
  const fuente = require('fs').readFileSync(path.join(RAIZ, 'kamehouse-eventos.js'), 'utf8');
  const recortar = (nombre) => {
    const i = fuente.indexOf('function ' + nombre + '(');
    if (i < 0) throw new Error('no encontré la función ' + nombre + ' en kamehouse-eventos.js');
    let j = fuente.indexOf('{', i), prof = 0;
    for (let k = j; k < fuente.length; k++) {
      if (fuente[k] === '{') prof++;
      else if (fuente[k] === '}' && --prof === 0) return fuente.slice(i, k + 1);
    }
    throw new Error('llaves desbalanceadas en ' + nombre);
  };
  const pintar = new Function(
    recortar('_evtEsc') + '\n' + recortar('_evtMxn') + '\n' + recortar('_excelCareoHtml')
    + '\nreturn _excelCareoHtml;')();
  const html = pintar(d);
  // ASERCIONES SOBRE EL HTML IMPRESO, no sobre el fuente.
  af(html.includes('Valeria Colin'), 'la pantalla no imprime a Valeria, que SÍ está en el montón');
  af(html.includes('Rosa Vela'), 'la pantalla no imprime a Rosa (la de «sin total» en el sistema)');
  af(/sin total/.test(html), 'la pantalla no dice «sin total» para el `sistema_total` en null: imprimiría $0, que es otra cosa');
  // El chip se cuenta por SU ANCLA (`data-chip`), no por la palabra: el texto
  // de ayuda del pie también dice «derivado» y contarla daba 2. Un prefijo —o
  // una palabra suelta— no es un ancla.
  const chips = (html.match(/data-chip="derivado"/g) || []).length;
  af(chips === 1, 'el chip «derivado» sale ' + chips + ' vez(ces) y debe salir 1 (solo Ana)');
  // El bloque del montón nuevo, recortado, para preguntarle solo a él.
  const iBloque = html.indexOf('totales de contrato');
  const bloque = html.slice(iBloque, html.indexOf('<details', iBloque));
  af(iBloque > 0, 'la pantalla no pinta el encabezado del montón nuevo');
  af(!bloque.includes('Beto Paz') && !bloque.includes('David Lara'),
     'el bloque de totales imprime a alguien que NO está en el montón');
  af(bloque.includes('SOLO LEE'), 'la pantalla no dice que esta fase solo lee');
  af(/tecleado en la pestaña/.test(bloque), 'la pantalla no avisa de los «$0» tecleados');
  console.log('    HTML: ' + html.length + ' bytes · el bloque de totales: ' + bloque.length
    + ' · chip derivado ×' + chips);

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); process.exit(1); });
