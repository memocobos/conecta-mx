#!/usr/bin/env node
// =============================================================================
// scripts/mide-cuadre-total.js — EL CAREO DE CUADRE-1a Y CUADRE-5
// =============================================================================
// Se corre: npm run mide:cuadre-total   (sin red de verdad: no pide nada fuera)
//
// Bloques [1]..[8]: CUADRE-1a, el montón de totales de contrato.
// Bloques [9]..[14]: CUADRE-5, la regla del «$0» tecleado (22-sep-2026) — las
// cuatro clases con el CATÁLOGO REAL servido, el conteo por clase que Memo
// pidió ver, el control positivo de apagarle el catálogo, la pantalla (chip y
// conteos, probados MUTANDO el dato, no con un grep) y la puerta `para_careo`
// careada contra la VENTA en un evento que sí está vendiendo.
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
// [CUADRE-5] El index REAL del repo, que es el catálogo de verdad: de ahí salen
// `esCDMX` y los precios vivos por paquete+zona. No se fabrica un EV de
// mentira — los ejemplos inventados comparten mis sesgos, y aquí el dato que
// decide la clase de cada renglón ES el catálogo.
const INDEX_REAL = require('fs').readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

function redFalsa({ pestanas, base, saboteado, catalogo }) {
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
    // ── [CUADRE-5] el index SERVIDO (el catálogo) ──
    // Con `catalogo:false` NO se sirve y se cae al `throw` de abajo: ése es el
    // mundo del fail-soft conservador —catálogo ilegible, CDMX asumido, ningún
    // $0 tapado—, y es el mundo en el que corren los bloques [1]..[8].
    if (/\/index\.html$/.test(String(url))) {
      if (!catalogo) throw new Error('la red falsa no sirve el catálogo en este escenario');
      return { ok: true, status: 200, text: async () => INDEX_REAL, json: async () => ({}) };
    }
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

async function correr({ eventoId, pestanas, base, saboteado, catalogo }) {
  const red = redFalsa({ pestanas, base, saboteado, catalogo });
  process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec';
  process.env.EXCEL_SCRIPT_TOKEN = 't';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  // [CUADRE-5] Fijo la base del sitio: `catalogo-index` la lee de `URL` /
  // `DEPLOY_PRIME_URL`, y un valor heredado del shell haría que la red falsa no
  // reconociera su propio destino.
  process.env.URL = 'https://conectareynosa.mx';
  delete process.env.DEPLOY_PRIME_URL;
  global.fetch = red.fetchFalso;

  // El PORTERO se ejercita, no se salta: doble UN SALTO MÁS ADENTRO.
  let llamadasAuth = 0;
  const va = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async (ev, roles) => { llamadasAuth++; return { valid: true, roles, user: { id: 'u1' } }; },
  } };
  // 🔒 [CUADRE-5] `catalogo-index` CACHEA el EV a nivel de módulo durante 10
  // minutos, así que sin este borrado el primer escenario que sirviera el
  // catálogo se lo REGALARÍA a los siguientes — incluidos los que miden el
  // fail-soft de «catálogo ilegible». Borrándolo, cada escenario es
  // independiente y el ORDEN en que corren deja de importar.
  for (const f of ['admin-excel-careo.js', '_lib/excel-careo.js', '_lib/cosecha-excel.js',
                   '_lib/excel-careo-correr.js', '_lib/catalogo-index.js', '_lib/precio-zona.js']) {
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

  // ── [3b] [BOLETOS-1] LA CARDINALIDAD: cuántos boletos y EN QUÉ ZONAS ─────
  // La pestaña lleva UNA FILA POR BOLETO. `filas` ya se contaba; lo que faltaba
  // es SABER EN QUÉ ZONAS, porque la persona solo guardaba la PRIMERA — y sin
  // eso no se puede distinguir «4 boletos de la misma zona» (se sincroniza
  // solo) de «boletos repartidos» (hay que preguntar).
  console.log('\n[3b] boletos por zona');
  {
    const { parsearPestana } = require(path.join(RAIZ, 'netlify/functions/_lib/excel-careo.js'));
    const filas3b = conPreludio(CAB_YOUNGMIKO, [
      ...Array.from({ length: 4 }, () => filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Sergio Cuatro', 'Paquete': 'PLUS', 'Boleto': 'VIP', 'Separo': '$500', 'Total': '$4,000' })),
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Angel Dos Zonas', 'Paquete': 'PLUS', 'Boleto': 'Perfiles', 'Separo': '$500', 'Total': '$5,000' }),
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Angel Dos Zonas', 'Paquete': 'PLUS', 'Boleto': 'Platino', 'Separo': '$500', 'Total': '$5,000' }),
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Sola Una', 'Paquete': 'PLUS', 'Boleto': 'VIP', 'Separo': '$500', 'Total': '$1,000' }),
    ]);
    const r3b = parsearPestana(filas3b, { fila: 10 }, null);
    const por3b = (n) => r3b.personas.find((p) => new RegExp(n).test(p.nombre));
    r3b.personas.forEach((p) => console.log(`    ${p.nombre.padEnd(18)} filas=${p.filas} zonas=${JSON.stringify(p.zonas)}`));
    const serg = por3b('Sergio');
    af(serg && serg.filas === 4, 'Sergio: filas ' + (serg && serg.filas) + ', se esperaban 4');
    af(serg && serg.zonas && serg.zonas['VIP'] === 4,
       'Sergio no trae su conteo POR ZONA: ' + JSON.stringify(serg && serg.zonas)
       + ' — sin él no se puede distinguir «4 de la misma zona» de «boletos repartidos»');
    af(serg && Object.keys(serg.zonas || {}).length === 1, 'Sergio tiene UNA zona y salieron ' + Object.keys((serg && serg.zonas) || {}).length);
    const ang = por3b('Angel');
    af(ang && ang.zonas && Object.keys(ang.zonas).length === 2,
       'Angel tiene boletos en DOS zonas y el parser reportó ' + JSON.stringify(ang && ang.zonas));
    af(ang && ang.zonas && ang.zonas['Perfiles'] === 1 && ang.zonas['Platino'] === 1, 'el reparto de Angel no es 1 y 1: ' + JSON.stringify(ang && ang.zonas));
    const sola = por3b('Sola');
    af(sola && sola.zonas && sola.zonas['VIP'] === 1, 'la de un solo boleto: ' + JSON.stringify(sola && sola.zonas));
    // ── [BOLETOS-1 adenda] LA CHATARRA TAMBIÉN CONSUME BOLETO ──────────────
    // «Vendido X», una creadora, un coordinador: NO son viajeros —bien
    // descartados del careo de DINERO— pero ocupan un lugar. Su casa en el
    // sistema ya existe: `stock_ajustes.vendidos_fuera`.
    // Medido en Soy Luna: 8 boletos de chatarra (VIP 2, Platino 1, Balcón 2,
    // Megacable 2, Plata 1) que el sistema no veía — soyluna tiene CERO filas
    // en stock_ajustes.
    // 🔒 VIAJA APARTE, jamás fundida con las personas: si entrara al montón de
    // gente, «Vendido Alex» se daría de alta como viajero.
    const filasCh = conPreludio(CAB_YOUNGMIKO, [
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Persona Real', 'Paquete': 'PLUS', 'Boleto': 'VIP', 'Total': '$1,000' }),
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Marietta Barrera creadora', 'Boleto': 'VIP' }),
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Marietta Barrera creadora', 'Boleto': 'VIP' }),
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Vendido Alex', 'Boleto': 'Balcón' }),
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Coordinador', 'Boleto': 'Plata' }),
      filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Vendido Sin Zona', 'Boleto': '' }),
    ]);
    const rCh = parsearPestana(filasCh, { fila: 10 }, null);
    console.log('    chatarra por zona: ' + JSON.stringify(rCh.chatarraPorZona) + ' · personas: ' + rCh.personas.length);
    af(rCh.chatarraPorZona && rCh.chatarraPorZona['VIP'] === 2,
       'la chatarra de VIP no se contó: ' + JSON.stringify(rCh.chatarraPorZona)
       + ' — «Vendido X» no es viajero pero SÍ ocupa un boleto');
    af(rCh.chatarraPorZona && rCh.chatarraPorZona['Balcón'] === 1 && rCh.chatarraPorZona['Plata'] === 1,
       'falta chatarra de alguna zona: ' + JSON.stringify(rCh.chatarraPorZona));
    // Sin zona no se le puede descontar a ninguna: se cuenta aparte, no se inventa.
    af(!(rCh.chatarraPorZona || {})[''] && !(rCh.chatarraPorZona || {})['(sin zona)'],
       'la chatarra SIN zona se le asignó a alguna: ' + JSON.stringify(rCh.chatarraPorZona));
    // 🔒 Y NO SE FUNDE CON LA GENTE.
    af(rCh.personas.length === 1, 'la chatarra se coló a las personas: ' + JSON.stringify(rCh.personas.map((p) => p.nombre)));
    af(rCh.descartes.chatarra === 5, 'descartes.chatarra = ' + rCh.descartes.chatarra + ', se esperaban 5');
    // 🔒 Y RESPETA LA REGLA DE ZONA. En una pestaña repartida entre eventos
    // (Corona Capital), la chatarra de OTRA zona no es de este evento: contarla
    // le restaría stock ajeno. La guarda de chatarra corre ANTES del filtro de
    // zona, así que este caso NO es teórico.
    const rZona = parsearPestana(filasCh, { fila: 10 }, 'VIP');
    console.log('    con regla_zona «VIP»: ' + JSON.stringify(rZona.chatarraPorZona));
    af(rZona.chatarraPorZona['VIP'] === 2 && !rZona.chatarraPorZona['Balcón'] && !rZona.chatarraPorZona['Plata'],
       'con regla de zona se contó chatarra de OTRAS zonas: ' + JSON.stringify(rZona.chatarraPorZona)
       + ' — eso le resta stock a un evento que no es');

    // 🔒 La llave `zona` de siempre NO se toca: hay consumidores que la leen.
    af(serg && serg.zona === 'VIP', 'se perdió la llave `zona` de siempre: ' + JSON.stringify(serg && serg.zona));
  }

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
    recortar('_evtEsc') + '\n' + recortar('_evtMxn') + '\n' + recortar('_excelFuenteNumerologia') + '\n' + recortar('_excelChipFuentes') + '\n' + recortar('_excelCareoHtml')
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

  // ══════════════════════════════════════════════════════════════════════════
  // [9] CUADRE-5 · LAS CUATRO CLASES DEL «$0» TECLEADO
  // ══════════════════════════════════════════════════════════════════════════
  // La regla de Memo (22-sep): un $0 tecleado en la pestaña deja de ser
  // diferencia cuando el index PUEDE saber el total completo — evento NO-CDMX,
  // o paquete CHEAP en cualquier lado. Los $0 de CDMX en paquete con transporte
  // quedan FUERA (el index no sabe el vuelo), y los exactos de libreta tampoco.
  //
  // 🔒 EL CATÁLOGO ES EL REAL. `cdmx` y los precios NO se fabrican: salen del
  // `index.html` del repo servido por la red falsa, o sea de la misma fuente
  // que el sitio. Un EV inventado habría clasificado los renglones con MI
  // criterio en vez del del código — la forma exacta de «probar tu idea del
  // dato en vez del dato que el código mira».
  const C5_YM = () => ({
    eventoId: 'youngmiko', catalogo: true,
    pestanas: {
      // La cabecera es la REAL de Young Miko (la de arriba, medida el 20-sep).
      'Young Miko- 19 de Septiembre': conPreludio(CAB_YOUNGMIKO, [
        // [1] DENTRO · el total del sistema ya existe → se queda el de la base.
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Lupe Ozuna', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Separo': '$500', '1': '$500', 'Total': '$0', 'TALLA': 'M' }),
        // [2] DENTRO · el sistema NO sabe el total (NULL) → se pisa con el
        //     precio vivo del catálogo. Detrás de la tolerancia este caso era
        //     INALCANZABLE: $0 contra null da diferencia cero.
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Mara Tovar', 'Paquete': 'CHEAP', 'Boleto': 'Cancha General', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'S' }),
        // [3] DENTRO · la otra cara del mismo caso: el sistema trae 0.
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Noe Quiroz', 'Paquete': 'CHEAP', 'Boleto': 'Platino', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'L' }),
        // [4] FUERA por LIBRETA · el total del sistema lo capturó un humano.
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Olga Prado', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Separo': '$500', '1': '$500', 'Total': '$0', 'TALLA': 'M' }),
        // [5] NO ES $0 · diferencia sobre un derivado: la regla no la toca.
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Pepe Salas', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Separo': '$500', '1': '$500', 'Total': '$5,200', 'TALLA': 'XL' }),
        // [6] DENTRO · CUATRO BOLETOS DE LA MISMA ZONA (hallazgo de Jane): la
        //     pestaña lleva una fila por boleto y los totales se SUMAN, así que
        //     el total del sistema tiene que ser el del GRUPO. Pisarlo con el
        //     de una persona pintaría 1/4 del total real.
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Quique Rios', 'Paquete': 'CHEAP', 'Boleto': 'Cancha General', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'M' }),
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Quique Rios', 'Paquete': 'CHEAP', 'Boleto': 'Cancha General', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'M' }),
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Quique Rios', 'Paquete': 'CHEAP', 'Boleto': 'Cancha General', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'M' }),
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Quique Rios', 'Paquete': 'CHEAP', 'Boleto': 'Cancha General', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'M' }),
        // [7] DENTRO pero SE REHÚSA · boletos REPARTIDOS en dos zonas. Cada
        //     zona tiene su precio y repartirlos sin fila que lo diga sería
        //     inventar (la lección de Angel). Se queda pendiente, con motivo.
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Tere Ancira', 'Paquete': 'CHEAP', 'Boleto': 'Cancha General', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'S' }),
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Tere Ancira', 'Paquete': 'CHEAP', 'Boleto': 'Platino', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'S' }),
        // [8] DENTRO pero SE REHÚSA · la otra cara de lo mismo: TRES boletos y
        //     solo DOS con zona. La zona es única, así que un `zonas.length===1`
        //     a secas lo habría pisado con el total de 3 dando por hecho que el
        //     tercero es de esa zona. No se sabe, así que no se pisa.
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Ulises Vega', 'Paquete': 'CHEAP', 'Boleto': 'Cancha General', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'M' }),
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Ulises Vega', 'Paquete': 'CHEAP', 'Boleto': 'Cancha General', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'M' }),
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Ulises Vega', 'Paquete': 'CHEAP', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'M' }),
      ]),
    },
    base: {
      excel_pestanas: [{ evento_id: 'youngmiko', pestana: 'Young Miko- 19 de Septiembre', regla_zona: null, activa: true, notas: null }],
      viajeros_evento: [
        { id: 'c5-1', evento_id: 'youngmiko', nombre: 'Lupe Ozuna', tipo_viajero: 'cliente', abonado_previo: 500,  total_contrato: 4700, notas: 'TOTAL-1: contrato derivado del catálogo', zona_boleto: 'Cancha General', tipo_paquete: 'PLUS' },
        { id: 'c5-2', evento_id: 'youngmiko', nombre: 'Mara Tovar', tipo_viajero: 'cliente', abonado_previo: 1000, total_contrato: null, notas: 'TOTAL-1: contrato derivado del catálogo · ⚠ total pendiente', zona_boleto: 'Cancha General', tipo_paquete: 'CHEAP' },
        { id: 'c5-3', evento_id: 'youngmiko', nombre: 'Noe Quiroz', tipo_viajero: 'cliente', abonado_previo: 1000, total_contrato: 0,    notas: 'TOTAL-1: contrato derivado del catálogo · ⚠ total pendiente', zona_boleto: 'Platino', tipo_paquete: 'CHEAP' },
        { id: 'c5-4', evento_id: 'youngmiko', nombre: 'Olga Prado', tipo_viajero: 'cliente', abonado_previo: 500,  total_contrato: 4700, notas: 'Migrado Excel 28-ago (Jane)', zona_boleto: 'Cancha General', tipo_paquete: 'PLUS' },
        { id: 'c5-5', evento_id: 'youngmiko', nombre: 'Pepe Salas', tipo_viajero: 'cliente', abonado_previo: 500,  total_contrato: 4700, notas: 'TOTAL-1: contrato derivado del catálogo', zona_boleto: 'Cancha General', tipo_paquete: 'PLUS' },
        { id: 'c5-8', evento_id: 'youngmiko', nombre: 'Quique Rios', tipo_viajero: 'cliente', abonado_previo: 4000, total_contrato: null, notas: 'TOTAL-1: contrato derivado del catálogo · ⚠ total pendiente', zona_boleto: 'Cancha General', tipo_paquete: 'CHEAP' },
        { id: 'c5-10', evento_id: 'youngmiko', nombre: 'Ulises Vega', tipo_viajero: 'cliente', abonado_previo: 3000, total_contrato: null, notas: 'TOTAL-1: contrato derivado del catálogo · ⚠ total pendiente', zona_boleto: 'Cancha General', tipo_paquete: 'CHEAP' },
        { id: 'c5-9', evento_id: 'youngmiko', nombre: 'Tere Ancira', tipo_viajero: 'cliente', abonado_previo: 2000, total_contrato: null, notas: 'TOTAL-1: contrato derivado del catálogo · ⚠ total pendiente', zona_boleto: 'Cancha General', tipo_paquete: 'CHEAP' },
      ],
      abonos_viajero: [],
    },
  });

  console.log('\n[9] CUADRE-5 · el $0 tecleado, evento NO-CDMX (catálogo REAL servido)');
  const { d: d9 } = await correr(C5_YM());
  const c9 = d9.cuadre5 || {};
  console.log('    cuadre5 = ' + JSON.stringify(c9));
  // 🔒 LA PREMISA, PRIMERO: si el catálogo no se leyó, `cdmx` cae al
  // conservador y las cinco clases de abajo se vuelven una sola. Sin esto, un
  // verde no diría nada de la regla.
  af(c9.cdmx === false, 'la premisa NO se sostiene: `cdmx` salió ' + JSON.stringify(c9.cdmx)
     + ' y youngmiko es de Monterrey — el careo no está leyendo el catálogo real');
  af(!c9.catalogo_error, 'el careo reportó catálogo ilegible: ' + c9.catalogo_error);
  const R9 = d9.totales_cero_regla || [];
  const T9 = d9.totales_contrato || [];
  R9.forEach((x) => console.log(`    · en regla: ${x.nombre.padEnd(12)} ${String(x.paquete).padEnd(6)} sistema=${x.sistema_total} (${x.sistema_total_origen})${x.sistema_total_motivo ? ' motivo=' + x.sistema_total_motivo : ''}`));
  T9.forEach((x) => console.log(`    · sigue siendo diferencia: ${x.nombre.padEnd(12)} excel=${x.excel_total} sistema=${x.sistema_total} dif=${x.diferencia}`));
  // EL CONTEO POR CLASE, que es lo que Memo pidió VER.
  af(c9.en_regla === 6, 'en_regla = ' + c9.en_regla + ', se esperaban 6 (Lupe · Mara · Noe · Quique de 4 boletos · Tere repartida · Ulises con una fila sin zona)');
  af(c9.fuera_libreta === 1, 'fuera_libreta = ' + c9.fuera_libreta + ', se esperaba 1 (Olga)');
  af(c9.fuera_cdmx === 0, 'fuera_cdmx = ' + c9.fuera_cdmx + ', se esperaba 0: youngmiko no es de CDMX');
  // Las tres clases PARTEN los $0 tecleados: 3 + 0 + 1 = los cuatro sembrados.
  // Si no suman, algún renglón se está contando dos veces o ninguna.
  af(c9.en_regla + c9.fuera_cdmx + c9.fuera_libreta === 7,
     'las clases del $0 no suman los 7 sembrados: ' + JSON.stringify([c9.en_regla, c9.fuera_cdmx, c9.fuera_libreta]));
  af(c9.fuera_otro === 0, '`fuera_otro` = ' + c9.fuera_otro + ' y debe ser 0: hay una clase de $0 sin nombre');
  af(R9.length === c9.en_regla, 'el conteo dice ' + c9.en_regla + ' y el montón trae ' + R9.length
     + ': el número y la lista tienen que salir del mismo sitio');
  const enR = (n) => R9.find((x) => x.nombre === n);
  const enT = (n) => T9.find((x) => x.nombre === n);
  // Los tres cubiertos SALEN del montón de diferencias.
  ['Lupe Ozuna', 'Mara Tovar', 'Noe Quiroz', 'Quique Rios', 'Tere Ancira', 'Ulises Vega'].forEach((n) => {
    af(!!enR(n), n + ' no entró al montón de la regla');
    af(!enT(n), n + ' sigue contándose como diferencia además de estar en la regla: estaría en DOS montones');
  });
  // [4] el exacto de libreta se queda pidiendo ojo humano.
  af(!enR('Olga Prado'), 'Olga (exacto de libreta) se colló en la regla: «los exactos de libreta no entran»');
  af(!!enT('Olga Prado'), 'Olga desapareció de los dos montones: un renglón que nadie ve es un renglón que nadie revisa');
  // [5] la regla NO se come las diferencias que no son $0.
  const pepe = enT('Pepe Salas');
  af(!!pepe && pepe.diferencia === 500,
     'Pepe (Excel $5,200 vs sistema $4,700) dejó de ser diferencia: la regla solo cubre el $0 tecleado');
  // EL TOTAL QUE MANDA · y de dónde salió.
  const lupe = enR('Lupe Ozuna');
  af(!!lupe && lupe.sistema_total === 4700 && lupe.sistema_total_origen === 'base',
     'Lupe: el total del sistema ya existía ($4,700) y debía quedarse tal cual, no pisarse — salió '
     + JSON.stringify(lupe && lupe.sistema_total) + ' (' + (lupe && lupe.sistema_total_origen) + ')');
  // 🔒 EL PRECIO NO SE TECLEA AQUÍ: se le PREGUNTA AL DUEÑO DE LA ARITMÉTICA,
  // el mismo `resolverPrecioVenta` que usa el runner. Escribir «3600» en el
  // arnés lo volvería una foto que se podre el día que Memo suba el precio.
  delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'))];
  delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js'))];
  const { resolverPrecioVenta } = require(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js'));
  for (const [nombre, paquete, zona] of [['Mara Tovar', 'CHEAP', 'Cancha General'], ['Noe Quiroz', 'CHEAP', 'Platino']]) {
    const fila = enR(nombre);
    const dueno = await resolverPrecioVenta({ evento_id: 'youngmiko', paquete, zona, num_personas: 1, para_careo: true });
    console.log('    · ' + nombre + ': el dueño de la aritmética dice ' + JSON.stringify(dueno.precio_unit)
      + ' y el careo trae ' + JSON.stringify(fila && fila.sistema_total));
    af(dueno.ok && Number(dueno.precio_unit) > 0,
       'la premisa del precio no se sostiene: el catálogo no cotiza ' + paquete + '/' + zona + ' ('
       + (dueno.motivo || 'sin motivo') + ') — sin eso, el caso del total pendiente no se puede medir');
    af(!!fila && fila.sistema_total === Number(dueno.precio_unit),
       nombre + ': el total pendiente NO se pisó con el precio vivo (careo '
       + JSON.stringify(fila && fila.sistema_total) + ' vs dueño ' + JSON.stringify(dueno.precio_unit) + ')');
    af(!!fila && fila.sistema_total_origen === 'catalogo',
       nombre + ': el origen dice ' + JSON.stringify(fila && fila.sistema_total_origen)
       + ' y debe decir «catalogo» — de dónde salió el número es parte del dato');
  }
  // ── EL CONTEO DE BOLETOS (hallazgo de Jane) ──────────────────────────────
  // 🔒 EL NÚMERO NO SE TECLEA NI SE MULTIPLICA AQUÍ: se le pide al DUEÑO el
  // total del GRUPO (`num_personas: 4`) y se carea contra eso. Multiplicar
  // `unit × 4` en el arnés sería repetir la aritmética del runner y los dos
  // podrían estar igual de equivocados.
  const quique = enR('Quique Rios');
  const grupo4 = await resolverPrecioVenta({ evento_id: 'youngmiko', paquete: 'CHEAP', zona: 'Cancha General', num_personas: 4, para_careo: true });
  const unoSolo = await resolverPrecioVenta({ evento_id: 'youngmiko', paquete: 'CHEAP', zona: 'Cancha General', num_personas: 1, para_careo: true });
  console.log('    · Quique Rios: 4 boletos de una zona · el dueño cotiza el grupo en ' + JSON.stringify(grupo4.total)
    + ' (una persona: ' + JSON.stringify(unoSolo.precio_unit) + ') y el careo trae ' + JSON.stringify(quique && quique.sistema_total));
  af(grupo4.ok && Number(grupo4.total) > Number(unoSolo.precio_unit),
     'la premisa no se sostiene: el total de 4 boletos no es mayor que el de uno, así que este caso no puede distinguir nada');
  af(!!quique && quique.filas === 4, 'Quique: el careo contó ' + JSON.stringify(quique && quique.filas) + ' filas y son 4 boletos');
  af(!!quique && quique.sistema_total === Number(grupo4.total),
     'Quique: el total pisado es ' + JSON.stringify(quique && quique.sistema_total) + ' y el del GRUPO es '
     + JSON.stringify(grupo4.total) + ' — pisar con el de una persona pinta 1/4 del total real');
  af(!!quique && quique.sistema_total !== Number(unoSolo.precio_unit),
     'Quique: se pisó con el precio de UNA persona teniendo 4 boletos — es el defecto que Jane cazó');
  af(!!quique && quique.sistema_total_boletos === 4,
     'Quique: el renglón no dice cuántos boletos entraron en el total: un número 4 veces mayor sin esa palabra se lee como un error');
  // Y el repartido SE REHÚSA, diciendo por qué.
  const tere = enR('Tere Ancira');
  console.log('    · Tere Ancira: 2 boletos en 2 zonas · origen=' + (tere && tere.sistema_total_origen)
    + ' motivo=' + JSON.stringify(tere && tere.sistema_total_motivo));
  af(!!tere && tere.sistema_total_origen === 'pendiente',
     'Tere: se pisó un total con los boletos REPARTIDOS en dos zonas — cada zona tiene su precio y repartirlos sería inventar');
  af(!!tere && /2 boletos en 2 zonas/.test(String(tere.sistema_total_motivo || '')),
     'Tere: el renglón no DICE por qué se quedó pendiente, y un pendiente mudo no se puede revisar: '
     + JSON.stringify(tere && tere.sistema_total_motivo));
  af(!!tere && tere.sistema_total == null,
     'Tere: quedó con un número (' + JSON.stringify(tere && tere.sistema_total) + ') aunque se rehusó a cotizarlo');
  // Y la cara fina: zona ÚNICA pero no la de todos los boletos.
  const ulises = enR('Ulises Vega');
  console.log('    · Ulises Vega: 3 boletos, 2 con zona · origen=' + (ulises && ulises.sistema_total_origen)
    + ' motivo=' + JSON.stringify(ulises && ulises.sistema_total_motivo));
  af(!!ulises && ulises.filas === 3, 'Ulises: el careo contó ' + JSON.stringify(ulises && ulises.filas) + ' filas y son 3');
  af(!!ulises && Object.keys(ulises.zonas || {}).length === 1,
     'la premisa del caso fino no se sostiene: Ulises debía tener UNA zona en el mapa y tiene '
     + JSON.stringify(Object.keys((ulises || {}).zonas || {})) + ' — así no prueba nada sobre `zonas.length===1`');
  af(!!ulises && ulises.sistema_total_origen === 'pendiente',
     'Ulises: se pisó el total dando por hecho que la fila SIN zona es de la única zona que se ve — eso no se sabe');
  af(!!ulises && /3 boletos y 2 con zona/.test(String(ulises.sistema_total_motivo || '')),
     'Ulises: el motivo no dice que falta una zona: ' + JSON.stringify(ulises && ulises.sistema_total_motivo));

  // Ningún renglón de la regla lleva una `diferencia` vieja al lado del total
  // que el runner acaba de pisar.
  const conDif = R9.find((x) => 'diferencia' in x);
  af(!conDif, 'un renglón de la regla trae `diferencia` después de pisarse el total: ' + JSON.stringify(conDif));
  // La fecha de la regla viaja en la respuesta y sale del LIB, no de un literal
  // del endpoint ni de la pantalla.
  const { CUADRE5_FECHA } = require(path.join(RAIZ, 'netlify/functions/_lib/excel-careo.js'));
  af(c9.fecha === CUADRE5_FECHA, 'la respuesta dice la fecha ' + JSON.stringify(c9.fecha)
     + ' y el lib la tiene en ' + JSON.stringify(CUADRE5_FECHA));

  // ── [10] EL EVENTO DE CDMX · la acotación de Memo ─────────────────────────
  console.log('\n[10] CUADRE-5 · evento de CDMX (soad): el CHEAP entra, el PLUS no');
  const C5_CDMX = () => ({
    eventoId: 'soad', catalogo: true,
    pestanas: {
      // El NOMBRE de la pestaña es de fixture; la CABECERA es la real medida.
      'SOAD - 28 de Mayo': conPreludio(CAB_YOUNGMIKO, [
        // FUERA · PLUS en CDMX: el autobús son $2,500 pero el avión se cotiza a
        // mano, así que el index no sabe el total completo.
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Rita Bueno', 'Paquete': 'PLUS', 'Boleto': 'General A', 'Separo': '$500', '1': '$500', 'Total': '$0', 'TALLA': 'M' }),
        // DENTRO · CHEAP es solo el boleto, y eso el index SÍ lo sabe.
        filaExcel(CAB_YOUNGMIKO, { 'Nombre': 'Saul Nieto', 'Paquete': 'CHEAP', 'Boleto': 'General A', 'Separo': '$1,000', '1': '$1,000', 'Total': '$0', 'TALLA': 'L' }),
      ]),
    },
    base: {
      excel_pestanas: [{ evento_id: 'soad', pestana: 'SOAD - 28 de Mayo', regla_zona: null, activa: true, notas: null }],
      viajeros_evento: [
        { id: 'c5-6', evento_id: 'soad', nombre: 'Rita Bueno', tipo_viajero: 'cliente', abonado_previo: 500,  total_contrato: 6800, notas: 'TOTAL-1: contrato derivado del catálogo', zona_boleto: 'General A', tipo_paquete: 'PLUS' },
        { id: 'c5-7', evento_id: 'soad', nombre: 'Saul Nieto', tipo_viajero: 'cliente', abonado_previo: 1000, total_contrato: null, notas: 'TOTAL-1: contrato derivado del catálogo · ⚠ total pendiente', zona_boleto: 'General A', tipo_paquete: 'CHEAP' },
      ],
      abonos_viajero: [],
    },
  });
  const { d: d10 } = await correr(C5_CDMX());
  const c10 = d10.cuadre5 || {};
  console.log('    cuadre5 = ' + JSON.stringify(c10));
  af(c10.cdmx === true, 'la premisa NO se sostiene: `esCDMX` dice ' + JSON.stringify(c10.cdmx)
     + ' de soad, que es del Palacio de los Deportes — sin CDMX, la acotación no se está midiendo');
  af(c10.en_regla === 1, 'en_regla = ' + c10.en_regla + ', se esperaba 1 (solo el CHEAP)');
  af(c10.fuera_cdmx === 1, 'fuera_cdmx = ' + c10.fuera_cdmx + ', se esperaba 1 (el PLUS con transporte)');
  af(c10.fuera_libreta === 0, 'fuera_libreta = ' + c10.fuera_libreta + ', se esperaba 0');
  af(c10.fuera_otro === 0, '`fuera_otro` = ' + c10.fuera_otro + ' y debe ser 0: hay una clase de $0 sin nombre');
  const R10 = d10.totales_cero_regla || [];
  af(R10.length === 1 && R10[0].nombre === 'Saul Nieto',
     'el montón de la regla en CDMX trae ' + JSON.stringify(R10.map((x) => x.nombre)) + ' y debía traer solo a Saul (CHEAP)');
  af(!!(d10.totales_contrato || []).find((x) => x.nombre === 'Rita Bueno'),
     'Rita (PLUS en CDMX) dejó de pedir ojo humano: el index NO sabe el vuelo');

  // ── [11] CONTROL POSITIVO · sin catálogo, la regla NO TAPA NADA ───────────
  // El mismo fixture NO-CDMX, con el catálogo ilegible. Si las clases salieran
  // iguales que en [9], querría decir que no dependen de lo medido — y el verde
  // de arriba no probaría nada. Éste es el control que no puede caducar: no
  // depende de ningún pasado, solo de apagarle la fuente al careo.
  console.log('\n[11] CONTROL POSITIVO · el mismo caso con el catálogo ILEGIBLE');
  const { d: d11 } = await correr({ ...C5_YM(), catalogo: false });
  const c11 = d11.cuadre5 || {};
  console.log('    cuadre5 = ' + JSON.stringify(c11));
  // ⚠️ `cuadre5.cdmx` dice el valor que el careo USÓ, no el que midió: con el
  // catálogo ilegible es `true` porque ante la duda se asume CDMX. Quien
  // distingue «medido» de «asumido» es `catalogo_error`, y la pantalla lo
  // pinta. Mi primera aserción pedía `null` — era mía, no del código.
  af(c11.cdmx === true, '`cdmx` debía quedar en el conservador `true` y salió ' + JSON.stringify(c11.cdmx));
  af(!!c11.catalogo_error, 'el careo NO dijo que no pudo leer el catálogo: un fail-soft mudo es peor que el error');
  // 🔒 EL CONTRASTE ES LA MEDICIÓN: con el catálogo apagado el PLUS derivado
  // sale de la regla (3 → 2) y pasa a la clase «fuera por CDMX» (0 → 1).
  // ⚠️ Los dos CHEAP se quedan DENTRO, y está bien: el CHEAP es solo el boleto,
  // así que la regla lo cubre EN CUALQUIER LADO — asumir CDMX no los toca.
  // Esperaba `en_regla:0` y la aritmética era mía otra vez.
  af(c11.en_regla === 5, 'con el catálogo ilegible la regla cubrió ' + c11.en_regla
     + ' renglón(es) y debían ser 5 (los CHEAP, que la regla cubre en cualquier lado)');
  af(c11.fuera_cdmx === 1 && c11.fuera_libreta === 1,
     'las clases del control positivo salieron ' + JSON.stringify([c11.fuera_cdmx, c11.fuera_libreta])
     + ' y debían ser [1, 1] — Lupe por CDMX asumido, Olga por libreta');
  af(c11.fuera_otro === 0, '`fuera_otro` = ' + c11.fuera_otro + ' y debe ser 0 también con el catálogo apagado');
  af(c9.en_regla !== c11.en_regla && c9.fuera_cdmx !== c11.fuera_cdmx,
     'las clases salieron IGUALES con y sin catálogo (' + c9.en_regla + '/' + c9.fuera_cdmx + ' vs '
     + c11.en_regla + '/' + c11.fuera_cdmx + '): entonces no dependen de lo medido y el verde de [9] no prueba nada');
  af(!!(d11.totales_contrato || []).find((x) => x.nombre === 'Lupe Ozuna'),
     'Lupe no volvió al montón de diferencias con el catálogo apagado: la clasificación no depende de lo medido');

  // ── [12] LA PANTALLA DE CUADRE-5 · el chip y los conteos ──────────────────
  console.log('\n[12] la pantalla de CUADRE-5');
  const html9 = pintar(d9);
  af(/data-chip="cuadre5"/.test(html9), 'la pantalla no pinta el chip de la regla');
  af(html9.includes(CUADRE5_FECHA), 'el chip no dice la FECHA de la regla (' + CUADRE5_FECHA + ')');
  ['Lupe Ozuna', 'Mara Tovar', 'Noe Quiroz'].forEach((n) =>
    af(html9.includes(n), 'la pantalla no imprime a ' + n + ', que está en el montón de la regla'));
  af(/del catálogo vivo/.test(html9), 'la pantalla no dice cuáles totales salieron del catálogo vivo');
  af(/4 boletos/.test(html9),
     'la pantalla no dice que el total de Quique cubre 4 boletos: $14,400 sin esa palabra se lee como un error de la cuenta');
  af(/2 boletos en 2 zonas/.test(html9),
     'la pantalla no pinta el motivo del renglón que se rehusó: un pendiente mudo no se puede revisar');
  af(/CDMX/.test(html9) && /libreta/.test(html9),
     'la pantalla no nombra las dos clases que quedan FUERA: el conteo sin su razón no se puede leer');
  // 🔒 EL LETRERO SE DERIVA, NO SE TECLEA — y se prueba MUTANDO el dato en vez
  // de buscar la palabra en el fuente: se le cambia la fecha y los conteos a un
  // testigo y se exige que la pantalla los diga. Un `grep` del literal se caza
  // solo (mi propio comentario lo contiene).
  const testigo = JSON.parse(JSON.stringify(d9));
  testigo.cuadre5.fecha = 'FECHA-TESTIGO-777';
  testigo.cuadre5.en_regla = 4242;
  testigo.cuadre5.fuera_cdmx = 3131;
  testigo.cuadre5.fuera_libreta = 2121;
  const htmlT = pintar(testigo);
  af(htmlT.includes('FECHA-TESTIGO-777'), 'la fecha del chip NO se deriva de la respuesta: está tecleada en la pantalla');
  ['4242', '3131', '2121'].forEach((n) =>
    af(htmlT.includes(n), 'el conteo ' + n + ' no llegó a la pantalla: la pantalla lo está recontando por su cuenta'));
  console.log('    HTML con CUADRE-5: ' + html9.length + ' bytes');

  // ── [13] LA PUERTA `para_careo` NO DEBILITA LA VENTA ──────────────────────
  // La puerta abre cuatro candados de AUD-2 y la única forma de saber que no
  // abrió de más es EJERCITAR LOS DOS LADOS con el mismo evento y la misma
  // zona: por la puerta tiene que dar precio, y sin la puerta tiene que
  // REHUSARSE. El caso se busca en el catálogo vivo —un evento A LA VENTA con
  // una zona agotada que sí trae precio—, que es donde un candado debilitado
  // costaría dinero de verdad; medirlo solo en un evento agotado habría dejado
  // el caso peligroso sin tocar.
  console.log('\n[13] la puerta `para_careo` contra la VENTA');
  // ⚠️ El escenario de [11] dejó la red falsa SIN servir el catálogo, así que
  // aquí se vuelve a poner —con el índice real— y se tira el módulo cacheado.
  // Sin esto el bloque se cae al `null` de `fetchEventosRaw` y sus aserciones
  // pasarían en vacío; el candado de cardinalidad lo cazó en la primera
  // corrida, que es exactamente para lo que está.
  global.fetch = async (url) => {
    if (/\/index\.html$/.test(String(url))) return { ok: true, status: 200, text: async () => INDEX_REAL, json: async () => ({}) };
    throw new Error('la red falsa del bloque [13] solo sirve el index: ' + url);
  };
  for (const f of ['_lib/catalogo-index.js', '_lib/precio-zona.js']) {
    delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))];
  }
  const { resolverPrecioVenta: resolverPrecioVenta13 } = require(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js'));
  const { fetchEventosRaw } = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
  const evCrudos = await fetchEventosRaw();
  af(Array.isArray(evCrudos) && evCrudos.length > 50,
     'el catálogo no se pudo leer para este bloque: llegó ' + JSON.stringify(evCrudos && evCrudos.length));
  const HOY = '2026-09-23';
  let caso = null;
  for (const e of (evCrudos || [])) {
    const st = String(e.st || '').toLowerCase();
    if (['agotado', 'por-confirmar', 'proceso', 'proximamente', 'pronto'].includes(st)) continue;
    if (!e.ds || e.ds <= HOY || (Array.isArray(e.multifecha) && e.multifecha.length)) continue;
    const ag = (e.zonas || []).find((z) => z && z.ag && Number(z.p) > 0);
    const libre = (e.zonas || []).find((z) => z && !z.ag && !z.prox && Number(z.p) > 0);
    if (ag && libre) { caso = { e, ag, libre }; break; }
  }
  // CANDADO DE CARDINALIDAD: sin el caso, las cuatro aserciones de abajo
  // pasarían en hueco y el verde no diría nada de la venta.
  af(!!caso, 'no hay en el catálogo un evento A LA VENTA con una zona agotada CON precio: '
     + 'sin ese caso este bloque pasa en vacío y no puede afirmar que la venta sigue cerrada');
  if (caso) {
    const pide = (zona, puerta) => resolverPrecioVenta13(Object.assign(
      { evento_id: caso.e.id, paquete: 'PLUS', zona, num_personas: 1, hoyISO: HOY },
      puerta ? { para_careo: true } : {}));
    const vAg = await pide(caso.ag.n, false);
    const cAg = await pide(caso.ag.n, true);
    const vLibre = await pide(caso.libre.n, false);
    const cFantasma = await pide('No Existe Esta Zona', true);
    console.log('    caso: ' + caso.e.id + ' (st=' + JSON.stringify(caso.e.st) + ', ' + caso.e.ds + ')'
      + ' · zona agotada «' + caso.ag.n + '» · zona libre «' + caso.libre.n + '»');
    console.log('    venta de la agotada: ok=' + vAg.ok + ' (' + (vAg.motivo || '') + ')'
      + ' · careo de la agotada: ok=' + cAg.ok + ' precio=' + cAg.precio_unit);
    af(vAg.ok === false, 'LA VENTA SE DEBILITÓ: se pudo cotizar la zona agotada «' + caso.ag.n
       + '» de ' + caso.e.id + ' SIN la puerta del careo — la puerta abrió de más');
    af(cAg.ok === true && Number(cAg.precio_unit) > 0,
       'la puerta del careo NO deja cotizar la zona agotada: ' + (cAg.motivo || 'sin motivo'));
    af(vLibre.ok === true && Number(vLibre.precio_unit) > 0,
       'la VENTA normal dejó de funcionar en una zona libre: ' + (vLibre.motivo || 'sin motivo'));
    // 🔒 Y LO QUE LA PUERTA **NO** ABRE: una zona que no existe no tiene precio
    // que decir, y el careo tampoco lo inventa. La puerta abre lo que no se
    // vende, jamás lo que no se sabe.
    af(cFantasma.ok === false, 'la puerta del careo cotizó una zona que NO EXISTE en el catálogo: '
       + 'eso ya no es abrir un candado de venta, es inventar un dato');
  }

  // ── [14] LA PUERTA ES OPT-IN, Y SE CUENTA QUIÉN LA PASA ───────────────────
  // Una puerta que apaga candados de venta solo es segura mientras tenga UN
  // cliente. Aquí se cuentan los archivos que la nombran de verdad —con los
  // comentarios QUITADOS, porque una aserción de ausencia por grep se caza sola
  // (este mismo comentario dice `para_careo`)— y se exige que sean dos: su
  // dueño y el careo. `resolverPrecioVenta` tiene SIETE llamadores; los otros
  // cinco (el separo de Mercado Pago ×2, el alta del Portal, /rol y las
  // cortesías) cotizan VENTA de verdad y no deben pasarla nunca.
  console.log('\n[14] quién pasa la puerta');
  const sinComentarios = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fsx = require('fs');
  const dirs = [path.join(RAIZ, 'netlify/functions'), path.join(RAIZ, 'netlify/functions/_lib')];
  const conPuerta = [];
  for (const dir of dirs) {
    for (const f of fsx.readdirSync(dir)) {
      if (!f.endsWith('.js')) continue;
      const p = path.join(dir, f);
      if (!fsx.statSync(p).isFile()) continue;
      if (/para_careo/.test(sinComentarios(fsx.readFileSync(p, 'utf8')))) conPuerta.push(f);
    }
  }
  conPuerta.sort();
  console.log('    la nombran (sin comentarios): ' + JSON.stringify(conPuerta));
  af(conPuerta.length === 2 && conPuerta.includes('precio-zona.js') && conPuerta.includes('excel-careo-correr.js'),
     'la puerta `para_careo` la pasa alguien más: ' + JSON.stringify(conPuerta)
     + ' — debe ser solo su dueño (precio-zona.js) y el careo (excel-careo-correr.js)');
  // CONTROL DEL INSTRUMENTO: si el buscador no encuentra la puerta ni en su
  // propio dueño, su lista vacía no significaría «nadie la pasa».
  af(conPuerta.includes('precio-zona.js'),
     'el buscador no ve la puerta ni en precio-zona.js: su lista no dice nada');

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); process.exit(1); });
