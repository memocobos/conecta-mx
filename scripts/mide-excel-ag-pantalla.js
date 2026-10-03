#!/usr/bin/env node
// =============================================================================
// mide:excel-ag-pantalla — LA SECCIÓN SE PINTA Y EL BOTÓN MANDA LO QUE ENSEÑÓ
// =============================================================================
// 🔴 ESTE CAREO EXISTE PORQUE FALTÓ: construí `ag_cerrar`/`ag_abrir` en el plan y
// NINGÚN módulo de UI los pintaba. Lo cazó Jane contra el árbol mergeado, y mi
// «vista previa real» había salido de un SCRIPT, no de la pantalla de Memo.
// 🔒 Es *probar el camino, no la función*, y el camino es LA PANTALLA. Así que
// aquí se renderiza con la FUNCIÓN REAL de la UI (`_excelAgHtml`) y se mide el
// HTML que sale, no lo que yo creo que sale.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let v = 0, r = 0;
const af = (c, m) => { let ok = false, ex = '';
  try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; ex = ' [' + e.message + ']'; }
  if (ok) v++; else { r++; console.log('  ❌ ' + (typeof m === 'function' ? m() : m) + ex); } };

// ── Se carga el MÓDULO REAL de la UI en un `vm`, con los ayudantes que usa ───
// 🔒 No se re-implementa `_excelAgHtml`: se EJECUTA la del archivo. Copiarla aquí
// sería medir mi copia — el defecto de las dos listas que todavía no divergen.
const FUENTE = fs.readFileSync(path.join(RAIZ, 'kamehouse-eventos.js'), 'utf8');
const ctx = { document: { getElementById: () => null }, window: {}, showToast: () => {},
              console: { log: () => {} } };
vm.createContext(ctx);
vm.runInContext(FUENTE, ctx, { filename: 'kamehouse-eventos.js' });
const _excelAgHtml = ctx._excelAgHtml;

console.log('\n═══ mide:excel-ag-pantalla ═══════════════════════════════════');

console.log('\n[A] la función existe y está cableada en el panel');
af(() => typeof _excelAgHtml === 'function', '🔴 `_excelAgHtml` no existe en el módulo de UI');
// 🔒 Y ALGUIEN LA LLAMA. Una función de UI sin llamador es la guarda inalcanzable:
// exactamente el defecto que esta tuerca viene a arreglar.
af(() => (FUENTE.match(/\$\{_excelAgHtml\(/g) || []).length === 1,
   '🔴 nadie la llama desde el panel: un pintor sin llamador no pinta nada');
af(() => /_excelAplicarPreviaHtml/.test(FUENTE.slice(0, FUENTE.indexOf('${_excelAgHtml('))),
   'no se llama desde dentro de la vista previa del aplicar');

const CERRAR = [{ zona: 'Perfil', zona_excel: 'Perfil', ag: true, pedido: 2, restan: 0, motivo: 'el pedido de 2 se agotó (Restan 0)' }];
const ABRIR  = [{ zona: 'Oro', zona_excel: 'Oro', ag: false, pedido: 5, restan: 3, motivo: 'quedan 3 de un pedido de 5' }];
// 🔴 [AG-CERO-FALSO-1] EL ARNÉS SE ACTUALIZA A LA VERDAD NUEVA. Estos fixtures
// hablaban el idioma viejo (`ag_cerrar`), y la pantalla ahora pinta de
// `ag_propuesta` — que es justo el defecto que Jane cazó: `ag_cerrar` es lo que
// el servidor va a ESCRIBIR y viene vacío en toda vista previa. La traducción
// vive en UN solo sitio y queda dicha.
// ⚠️ Pero estos fixtures siguen siendo datos A MANO, y por eso NO bastan: el
// hueco pasó justo por aquí. La sección [F] entra por el BOTÓN REAL.
const plan = (extra) => {
  const e = Object.assign({}, extra || {});
  const cerrar = e.ag_cerrar || [], abrir = e.ag_abrir || [];
  delete e.ag_cerrar; delete e.ag_abrir;
  return Object.assign({ ag_estado: 'no_pedido', ag_propuesta: { cerrar, abrir },
    ag_avisos: { sobrevendidas: [], vendo_sin_pedido: [], sin_ficha: [], sin_ficha_sobrevendidas: 0, prox_saltadas: [] } }, e);
};

console.log('\n[B] 🔒 los CUATRO estados, cuatro letreros');
{
  af(() => _excelAgHtml(plan({ ag_estado: 'apagada' })) === '',
     'con la palomita APAGADA la sección se pinta: no es un hueco, es que nadie la prendió');
  const il = _excelAgHtml(plan({ ag_estado: 'ilegible', ag_motivo: 'no se pudo leer el catálogo' }));
  af(() => /alert-error/.test(il) && /no se pudo leer el cat/.test(il),
     '🔴 «prendida pero ilegible» no se dice: un vacío sin razón se lee como «nada que cambiar»');
  af(() => /no es porque no hubiera nada que cambiar/.test(il), 'el letrero de ilegible no lo aclara');
  const np = _excelAgHtml(plan({ ag_cerrar: CERRAR }));
  af(() => /NO la incluye en el bot/.test(np),
     '🔴 con estado `no_pedido` la pantalla no avisa de que el botón grande no la manda');
}

console.log('\n[C] 🔒 CERRADAS Y REACTIVADAS: botones SEPARADOS');
{
  const h = _excelAgHtml(plan({ ag_cerrar: CERRAR, ag_abrir: ABRIR }));
  const alcances = [...h.matchAll(/data-alcance="([^"]*)"/g)]
    .map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
  console.log('    botones: ' + alcances.length + '  ·  alcances: ' + JSON.stringify(alcances));
  af(() => alcances.length === 2, '🔴 hay ' + alcances.length + ' botón(es): cerrar y reactivar deben tener el SUYO');
  // 🔒 LO QUE SE ENSEÑA ES LO QUE SE MANDA: las claves de cada botón son las zonas
  // que ESE renglón pintó, ni una más.
  af(() => alcances.every((a) => a.solo === 'disponibilidad'),
     '🔴 un botón no acota a `disponibilidad`: mandaría el plan global');
  af(() => JSON.stringify(alcances[0].claves) === '["Perfil"]',
     'el botón de cerrar no manda exactamente la zona pintada: ' + JSON.stringify(alcances[0].claves));
  af(() => JSON.stringify(alcances[1].claves) === '["Oro"]',
     'el botón de reactivar no manda exactamente su zona: ' + JSON.stringify(alcances[1].claves));
  // 🔴 Y NUNCA LOS DOS EN UN BOTÓN: aceptar un cierre no puede deshacer una
  // decisión de Memo (él agota zonas a propósito).
  af(() => !alcances.some((a) => a.claves.length === 2),
     '🔴 UN SOLO BOTÓN manda cierre Y reactivación: aplicar uno desharía la decisión del otro');
  af(() => /NO la apliques/.test(h), 'la reactivación no avisa de que pudo ser a propósito');
  // Cada renglón enseña sus números y el de/a.
  af(() => /pedido 2 · restan 0/.test(h), 'el renglón de cerrar no enseña pedido/restan');
  af(() => /a la venta → AGOTADA/.test(h), 'el renglón de cerrar no enseña el de/a');
  af(() => /AGOTADA → a la venta/.test(h), 'el renglón de reactivar no enseña el de/a');
  // 🔒 CONTROL POSITIVO: sin propuesta NO hay botón. Si lo hubiera, el botón no
  // saldría de lo pintado.
  const vacio = _excelAgHtml(plan({ ag_cerrar: [], ag_abrir: [] }));
  af(() => !/data-alcance/.test(vacio),
     '🔴 CONTROL POSITIVO: sin nada que proponer SIGUE habiendo botón — no sale de lo pintado');
  af(() => (vacio.match(/— ninguna/g) || []).length === 2, 'sin propuesta no dice «ninguna» en los dos montones');
}

console.log('\n[D] 🔴 los AVISOS se pintan y NO tienen botón');
{
  const h = _excelAgHtml(plan({ ag_cerrar: CERRAR, ag_avisos: {
    sobrevendidas: [{ zona: 'Platino', zona_ficha: 'Platino', aviso: 'SOBREVENDIDA -7', pedido: 5, restan: -7, pestana: 'Ricardo Arjona - 5 de diciembre' },
                    { zona: 'VIP', zona_ficha: 'VIP', aviso: 'SOBREVENDIDA -1', pedido: 6, restan: -1, prox: true, pestana: 'X' }],
    vendo_sin_pedido: [{ zona: 'Oro', zona_ficha: 'Oro', pedido: 0, restan: -2, motivo: 'Pedido 0: se compra conforme se vende' }],
    sin_ficha: [{ zona: 'Club Seat', pedido: 25, restan: -4, sobrevendida: true },
                { zona: 'Otra', pedido: 3, restan: 1, sobrevendida: false }],
    sin_ficha_sobrevendidas: 1, prox_saltadas: [{ zona: 'Plata', zona_ficha: 'Plata', pedido: 10, restan: 0 }] } }));
  af(() => /SOBREVENDIDA -7/.test(h), '🔴 la sobrevendida no GRITA su número');
  af(() => /Ricardo Arjona - 5 de diciembre/.test(h), '🔴 la sobrevendida no nombra la PESTAÑA que hay que revisar');
  af(() => /NO se arregla cerrando la zona/.test(h), 'no se dice que cerrar no lo arregla');
  af(() => /en PRÓXIMAMENTE, no se cierra/.test(h), 'una sobrevendida `prox` no dice que no se cierra');
  af(() => /Pedido 0<\/b> la palomita jamás cierra/.test(h) || /Pedido 0.*jamás cierra/.test(h),
     'no se dice que con Pedido 0 jamás se cierra la venta');
  af(() => /1 de éstas están SOBREVENDIDAS y van primero/.test(h),
     'el listado sin_ficha no dice cuántas están sobrevendidas');
  af(() => h.indexOf('Club Seat') < h.indexOf('Otra'), '🔴 la sobrevendida sin ficha no va ARRIBA');
  // 🔒 Y NINGÚN AVISO TRAE BOTÓN: no escriben nada.
  const alc = [...h.matchAll(/data-alcance="([^"]*)"/g)]
    .map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
  af(() => alc.length === 1 && JSON.stringify(alc[0].claves) === '["Perfil"]',
     '🔴 un AVISO trae botón: los avisos no escriben nada. Alcances: ' + JSON.stringify(alc));
  // Y el letrero de publicar.
  af(() => /no se ve en el sitio hasta que publiques/.test(h),
     'no se avisa de que el cierre no se ve hasta publicar');
}

console.log('\n[E] 🔒 el botón GRANDE no promete la disponibilidad');
{
  // Con el opt-in, el clic global manda `ag_estado:'no_pedido'`. Si el botón la
  // prometiera, el letrero no correspondería a lo que hace.
  const i = FUENTE.indexOf('id="excel-aplicar-ok"');
  const trozo = FUENTE.slice(i, i + 900);
  af(() => i > 0, 'no se encontró el botón grande');
  af(() => !/zona\(s\) de disponibilidad|disponibilidad/.test(trozo.split('</button>')[0]),
     '🔴 el botón GRANDE promete la disponibilidad y el opt-in NO la manda: letrero que no corresponde');
}

console.log('\n[F] 🔴 EL CAMINO REAL: handler de verdad → vista previa → pantalla');
// =============================================================================
// 🔴 ESTA SECCIÓN EXISTE PORQUE MI «VERIFICACIÓN EN NAVEGADOR» FUE A MEDIAS.
// Rendericé `_excelAgHtml` con datos A MANO, así que medí la PROMESA del
// comentario y no el camino. Jane entró por el botón y vio «ZONAS A CERRAR · 0 —
// ninguna» con la palomita prendida y el Excel proponiendo cerrar «Perfil».
// 🔒 Aquí se invoca el HANDLER REAL (`admin-excel-aplicar`) con EXACTAMENTE el
// cuerpo que manda el botón —`{evento_id}`, sin `solo` ni `claves`— y su
// respuesta se le da a la pantalla REAL. Se simula UN SALTO MÁS ADENTRO (la red
// y el Excel), nunca el handler: un mock por ruta esconde al portero.
// =============================================================================
const { execSync } = require('child_process');
const os = require('os');
const BASE_SHA = process.env.BASE_AG || '9e166d3';   // el main con el cero falso

const EVENTO = 'trueno';
const PESTANA = 'Trueno - 26 de noviembre';
// El bloque «Disponibilidad» en fila 0 col 1, que es DONDE SE MIDIÓ en la
// pestaña real de trueno (3-oct, cosecha en vivo: fila 0 col 1, 213 filas).
const EXCEL_FILAS = [
  ['', 'Disponibilidad', 'Precio', 'Pedido', 'Restan'],
  ['', 'Perfil', 3800, 2, 0],
  ['', 'Oro', 2900, 5, 3],
  [],
  [],
  ['', 'Nombre', 'Zona', 'Talla', 'Separo', 'Pago 1', 'Total'],
  ['', 'Ana Ruiz', 'Oro', 'M', 1000, 500, 2900],
];
// La ficha: «Perfil» a la venta (se puede cerrar) y «Oro» también.
const INDEX_HTML = '<html><script>var EV=['
  + JSON.stringify({ id: 'trueno', n: 'Trueno', f: '26 de noviembre',
                     zonas: [{ n: 'Perfil', p: 3800 }, { n: 'Oro', p: 2900 }], cheapZonas: [] })
  + '];</script></html>';

function mundoFalso() {
  const SB = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
  const escrituras = [];
  const tablas = {
    excel_pestanas: [{ evento_id: EVENTO, pestana: PESTANA, activa: true, ag_activa: true, regla_zona: null, notas: null }],
    viajeros_evento: [{ id: 'v-1', evento_id: EVENTO, nombre: 'Ana Ruiz', abonado_previo: 0, total_contrato: 2900, boletos: 1, notas: '', zona: 'Oro' }],
    abonos_viajero: [{ id: 'a-1', viajero_id: 'v-1', monto: 1500, fecha: '2026-10-01' }],
    numerologia_eventos: [],
    // La ficha que gobierna Esferas: `zonas` viaja como TEXTO, que es como vive y
    // como `aplicarAgEnFicha` la escribe (por balance de llaves).
    // 🔴 JSON ESTRICTO, medido: `agEnArreglo` ancla en `"n":"..."`. Mi primer
    // fixture copió el literal del index (`n:'Pista'`, comillas simples) y el
    // escritor no encontraba la zona — el rojo era del fixture, no del código.
    // Las dos formas existen de verdad y NO son la misma: el index.html habla
    // literal de JS, la columna de `esferas_eventos` habla JSON.
    esferas_eventos: [{ slug: 'trueno',
                        zonas: JSON.stringify([{ n: 'Perfil', p: 3800 }, { n: 'Oro', p: 2900 }]),
                        cheap_zonas: '[]', multifecha: null }],
  };
  const fetchFalso = async (url, opts) => {
    const met = (opts && opts.method) || 'GET';
    const u = String(url);
    if (u.indexOf('/index.html') !== -1) return { ok: true, status: 200, text: async () => INDEX_HTML };
    if (u.startsWith('https://script.test')) {
      const c = JSON.parse(opts.body);
      if (!c.pestana) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, pestanas: [PESTANA] }) };
      if (c.pestana !== PESTANA) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, codigo: 'PESTANA_NO_EXISTE', error: 'no existe' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, filas: EXCEL_FILAS, pestanas: [PESTANA], rojas: [], colores_leidos: false }) };
    }
    if (!u.startsWith(SB)) throw new Error('destino desconocido: ' + u);
    const url2 = new URL(u);
    const tabla = url2.pathname.replace('/rest/v1/', '');
    tablas[tabla] = tablas[tabla] || [];
    if (met === 'GET') {
      let out = tablas[tabla];
      for (const [k, expr] of url2.searchParams.entries()) {
        if (['select', 'limit', 'order', 'or'].includes(k)) continue;
        let m;
        if ((m = /^eq\.(.*)$/.exec(expr))) { out = out.filter((f) => String(f[k]) === decodeURIComponent(m[1])); continue; }
        if ((m = /^is\.(.*)$/.exec(expr))) { const vv = m[1] === 'true' ? true : m[1] === 'false' ? false : null; out = out.filter((f) => f[k] === vv); continue; }
        if ((m = /^in\.\((.*)\)$/.exec(expr))) { const vals = m[1].split(',').map((x) => decodeURIComponent(x).replace(/^"|"$/g, '')); out = out.filter((f) => vals.includes(String(f[k]))); continue; }
        throw new Error('el mundo falso no entiende el filtro: ' + k + '=' + expr);
      }
      return { ok: true, status: 200, json: async () => out, text: async () => '' };
    }
    escrituras.push({ tabla, op: met, cuerpo: opts.body });
    if (met === 'PATCH') {
      const parche = JSON.parse(opts.body);
      tablas[tabla].forEach((f) => Object.assign(f, parche));
      return { ok: true, status: 200, json: async () => tablas[tabla], text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => [], text: async () => '' };
  };
  return { fetchFalso, escrituras, tablas };
}

// Invoca el handler REAL de un ÁRBOL dado (el de trabajo, o el de BASE).
async function previaDe(raiz, cuerpo) {
  const mundo = mundoFalso();
  const guardado = global.fetch;
  global.fetch = mundo.fetchFalso;
  process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec';
  process.env.EXCEL_SCRIPT_TOKEN = 't';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  process.env.URL = 'https://conectareynosa.mx';
  // 🔒 Caché fuera: si no, el catálogo y los libs de OTRO árbol se cuelan y se
  // mediría una mezcla de dos commits.
  for (const k of Object.keys(require.cache)) {
    if (k.indexOf('/netlify/functions/') !== -1) delete require.cache[k];
  }
  try {
    // 🔴 EL ORDEN ES PARTE DEL ARREGLO: el portero se abre DESPUÉS de limpiar la
    // caché. Al revés —como nació— el `delete require.cache` se llevaba el parche
    // y el handler contestaba 500 «JWT_SECRET no configurado». El rojo era mío.
    // 🔒 Y se parcha el GUARDIA, no el handler: un mock por ruta esconde al
    // portero, así que lo que se simula es UN SALTO MÁS ADENTRO.
    const guardia = require(path.join(raiz, 'netlify/functions/_lib/verify-admin.js'));
    guardia.verifyAdminAuthLive = async () => ({ valid: true, rol: 'maestro_roshi', usuario: 'arnes' });
    const mod = require(path.join(raiz, 'netlify/functions/admin-excel-aplicar.js'));
    const res = await mod.handler({ httpMethod: 'POST',
      headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify(cuerpo) });
    return { res, json: JSON.parse(res.body || '{}'), escrituras: mundo.escrituras, tablas: mundo.tablas };
  } finally { global.fetch = guardado; }
}

// La pantalla REAL del árbol que toque.
function pantallaDe(raiz) {
  const src = fs.readFileSync(path.join(raiz, 'kamehouse-eventos.js'), 'utf8');
  const c = { document: { getElementById: () => null }, window: {}, showToast: () => {}, console: { log: () => {} } };
  vm.createContext(c);
  vm.runInContext(src, c, { filename: 'kamehouse-eventos.js' });
  return c._excelAgHtml;
}

(async () => {
  // ── HEAD: el camino completo ─────────────────────────────────────────────
  const H = await previaDe(RAIZ, { evento_id: EVENTO });
  af(() => H.res.statusCode === 200, () => '🔴 el handler no contestó 200: ' + H.res.statusCode + ' ' + JSON.stringify(H.json).slice(0, 180));
  const planH = H.json.plan || {};
  console.log('    ag_estado=' + planH.ag_estado
    + '  ag_propuesta=' + JSON.stringify(planH.ag_propuesta)
    + '  ag_cerrar=' + (planH.ag_cerrar || []).length);
  af(() => planH.ag_estado === 'no_pedido',
     () => 'la vista previa no viene como `no_pedido`: ' + planH.ag_estado);
  // 🔒 LO QUE SE CALCULA PARA ENSEÑAR, Y LO QUE SE ESCRIBIRÍA: SON DOS CAMPOS.
  af(() => planH.ag_propuesta && (planH.ag_propuesta.cerrar || []).length === 1,
     () => '🔴 EL CERO FALSO: la vista previa no calculó la propuesta — ' + JSON.stringify(planH.ag_propuesta));
  af(() => (planH.ag_cerrar || []).length === 0,
     () => '🔒 la vista previa trae `ag_cerrar` lleno: el clic global podría ESCRIBIR sin enseñar (' + (planH.ag_cerrar || []).length + ')');
  af(() => H.escrituras.length === 0,
     () => '🔒 correr la vista previa ESCRIBIÓ ' + H.escrituras.length + ' vez(ces): enseñar no es aplicar');

  // Y la PANTALLA, con esa respuesta tal cual.
  const htmlH = pantallaDe(RAIZ)(planH);
  const alcH = [...htmlH.matchAll(/data-alcance="([^"]*)"/g)]
    .map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
  console.log('    pantalla: ' + htmlH.length + ' bytes · botones=' + alcH.length
    + ' · ' + JSON.stringify(alcH));
  af(() => /Perfil/.test(htmlH), '🔴 la sección no enseña «Perfil» por el camino real');
  af(() => /pedido 2 · restan 0/.test(htmlH), '🔴 no enseña los números del Excel');
  af(() => /zonas a CERRAR[^·]*· 1/i.test(htmlH) || /· 1</.test(htmlH),
     () => '🔴 el conteo de «zonas a cerrar» no dice 1: ' + (htmlH.match(/CERRAR[^<]*/i) || [''])[0]);
  af(() => alcH.length === 1 && JSON.stringify(alcH[0]) === JSON.stringify({ solo: 'disponibilidad', claves: ['Perfil'] }),
     () => '🔴 el botón no sale, o no manda lo enseñado: ' + JSON.stringify(alcH));
  af(() => !/— ninguna<\/div>[\s\S]*zonas a REACTIVAR/i.test(htmlH),
     'el montón de cerrar sigue diciendo «ninguna» con una zona propuesta');

  // ── 🔒 CONTROL POSITIVO: el MISMO camino en BASE enseña el CERO FALSO ────
  const sha = execSync('git rev-parse ' + BASE_SHA, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agcero-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' netlify kamehouse-eventos.js | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  const B = await previaDe(dir, { evento_id: EVENTO });
  const planB = B.json.plan || {};
  const htmlB = pantallaDe(dir)(planB);
  const alcB = [...htmlB.matchAll(/data-alcance="([^"]*)"/g)];
  console.log('    BASE ' + sha.slice(0, 7) + ' → ag_cerrar=' + (planB.ag_cerrar || []).length
    + ' · botones=' + alcB.length + ' · dice «ninguna»: ' + /— ninguna/.test(htmlB));
  af(() => B.res.statusCode === 200, () => 'el handler de BASE no contestó 200: ' + B.res.statusCode);
  af(() => (planB.ag_cerrar || []).length === 0 && !planB.ag_propuesta,
     '🔒 BASE no traía la propuesta (es el defecto): ' + JSON.stringify(planB.ag_propuesta));
  af(() => !/Perfil/.test(htmlB),
     '🔒 CONTROL POSITIVO: BASE ya enseñaba «Perfil» — entonces este careo no mide el arreglo');
  af(() => /— ninguna/.test(htmlB),
     '🔒 CONTROL POSITIVO: BASE no enseñaba el cero falso que Jane vio');
  af(() => alcB.length === 0,
     '🔒 CONTROL POSITIVO: BASE ya traía botón — el defecto era otro');

  // ── 🔒 Y EL CANDADO DE SEGURIDAD SIGUE EN PIE: el clic global NO escribe ag ──
  const G = await previaDe(RAIZ, { evento_id: EVENTO, confirmar: true });
  const planG = G.json.plan || {};
  const tocoFicha = G.escrituras.filter((e) => /esferas_eventos/.test(e.tabla));
  console.log('    clic GLOBAL con confirmar → ag_cerrar=' + (planG.ag_cerrar || []).length
    + ' · escrituras a la ficha=' + tocoFicha.length);
  af(() => (planG.ag_cerrar || []).length === 0 && (planG.ag_abrir || []).length === 0,
     '🔴 el clic GLOBAL volvió a meter la disponibilidad al plan: es el hueco que cazó Jane');
  af(() => tocoFicha.length === 0,
     '🔴 el clic GLOBAL escribió en la ficha sin que la pantalla lo enseñara: ' + JSON.stringify(tocoFicha));
  af(() => planG.ag_propuesta && (planG.ag_propuesta.cerrar || []).length === 1,
     'y aun así la propuesta se CALCULA para enseñarla: ' + JSON.stringify(planG.ag_propuesta));

  // ── 🔴 LA OTRA MITAD DE LA PUERTA: APLICAR SIGUE ESCRIBIENDO ────────────
  // 🔒 El alcance NO se escribe a mano: se saca del botón que la vista previa
  // acabó de pintar. Lo que se confirma tiene que ser lo que se enseñó — si el
  // arreglo de «enseñar» hubiera roto «aplicar», esto lo caza.
  const A = await previaDe(RAIZ, Object.assign({ evento_id: EVENTO, confirmar: true }, alcH[0]));
  const planA = A.json.plan || {};
  const fichaPatch = A.escrituras.filter((e) => e.tabla === 'esferas_eventos');
  console.log('    2º clic (del botón pintado) → ag_cerrar=' + (planA.ag_cerrar || []).length
    + ' · PATCH a la ficha=' + fichaPatch.length
    + ' · ag_cerradas=' + JSON.stringify(((A.json.resultado || {}).ag_cerradas || []).map((x) => x.zona))
    + ' · requiere_publicar=' + ((A.json.resultado || {}).requiere_publicar));
  af(() => planA.ag_estado === 'propuesto',
     () => 'el clic acotado no llega como `propuesto`: ' + planA.ag_estado);
  af(() => (planA.ag_cerrar || []).length === 1,
     () => '🔴 el clic acotado no mete «Perfil» al plan: ' + JSON.stringify(planA.ag_cerrar));
  af(() => fichaPatch.length === 1,
     () => '🔴 el clic acotado no escribió la ficha (' + fichaPatch.length + ' PATCH): enseñar se arregló y aplicar se rompió');
  // 🔒 Medido: el escritor pone `"ag":1` junto a `"n"`, no `ag:true`.
  af(() => /\\"ag\\":1|"ag":1/.test(String((fichaPatch[0] || {}).cuerpo || '')),
     () => '🔴 el PATCH no prende el `ag`: ' + String((fichaPatch[0] || {}).cuerpo || '').slice(0, 200));
  // 🔴 AFIRMÉ SOBRE EL SITIO EQUIVOCADO: `requiere_publicar` NO va en el cuerpo del
  // PATCH —ahí solo viajan las tres columnas de la ficha— sino en el RESULTADO que
  // lee la pantalla. Es la señal de que el sitio sigue vendiendo la zona cerrada
  // hasta que Memo publique, y es ahí donde tiene que estar.
  af(() => (A.json.resultado || {}).requiere_publicar === true,
     () => '🔴 el resultado no pide publicar: el cierre no se vería en el sitio y nadie lo sabría — '
         + JSON.stringify((A.json.resultado || {}).requiere_publicar));
  af(() => ((A.json.resultado || {}).ag_cerradas || []).length === 1
        && ((A.json.resultado || {}).ag_abiertas || []).length === 0,
     () => '🔒 el resultado no reporta la zona cerrada, SEPARADA de las abiertas: '
         + JSON.stringify({ c: (A.json.resultado || {}).ag_cerradas, a: (A.json.resultado || {}).ag_abiertas }));
  af(() => !((A.json.resultado || {}).errores || []).length,
     () => '🔴 el aplicar reportó errores: ' + JSON.stringify((A.json.resultado || {}).errores));
  // 🔒 Y el cuerpo del PATCH toca SOLO las columnas que movieron.
  af(() => { const c = JSON.parse(String((fichaPatch[0] || {}).cuerpo || '{}'));
             return Object.keys(c).length === 1 && 'zonas' in c; },
     () => '🔒 el PATCH toca columnas que no movieron: ' + Object.keys(JSON.parse(String((fichaPatch[0] || {}).cuerpo || '{}'))).join(','));
  // 🔒 Y SOLO «Perfil»: «Oro» queda BYTE A BYTE como estaba.
  const zonasTras = String((A.tablas.esferas_eventos[0] || {}).zonas || '');
  af(() => /\{"n":"Perfil","ag":1,"p":3800\}/.test(zonasTras),
     () => '«Perfil» no quedó agotada en la ficha: ' + zonasTras);
  // 🔒 BYTE A BYTE: «Oro» no se tocó. Cerrar una zona no puede mover otra.
  af(() => zonasTras.indexOf('{"n":"Oro","p":2900}') !== -1,
     () => '🔒 «Oro» se tocó y NO debía: ' + zonasTras);

  // ── 🔒 UN HUECO NO SE DICE «0 · NINGUNA» ────────────────────────────────
  const hueco = pantallaDe(RAIZ)(Object.assign({}, planH, { ag_propuesta: null }));
  af(() => /NO se calcul/.test(hueco), '🔴 sin propuesta la pantalla no dice que no se calculó');
  af(() => !/— ninguna/.test(hueco),
     '🔴 sin propuesta la pantalla dice «ninguna»: eso AFIRMA que el Excel no propone nada, y no se midió');
  af(() => !/data-alcance/.test(hueco), 'sin propuesta sigue habiendo botón');

  console.log('\n' + (r === 0
    ? (v === 0 ? '⚠️  NADA MEDIDO · esto NO es un verde' : '✅ VERDE · ' + v + ' en verde, 0 en rojo')
    : '🔴 ROJO · ' + v + ' en verde, ' + r + ' en rojo'));
  process.exit(r === 0 && v > 0 ? 0 : 1);
})().catch((e) => { console.log('\n💥 ARNÉS CAÍDO · ' + e.stack); process.exit(1); });
