#!/usr/bin/env node
/* =============================================================================
 * mide-preventa-pn27 — PN27 · PREVENTA A CIEGAS Pa'l Norte 2027 (14-oct-2026)
 *
 * Palabra de Memo: preventa a ciegas, separo $300, fecha 26-28 mar 2027 SOLO
 * para el sistema (el público ve «Por confirmar»), bandeja de requisiciones
 * encendida POR EVENTO (solo palnorte), blast por tandas después.
 * ⚰️ El blast se RETIRÓ el 21-oct (BLAST-RETIRO-1): su bloque [F] quedó como
 * guardia de la poda; la bitácora preventa_blast vive y Genkidama la lee.
 *
 * ⚠️ SIN ANCLA a propósito (árbol de trabajo, como mide:req-b1 y
 * mide:cuadre-aplicar): mide lo que acabas de escribir y no sufre la trampa
 * del commit; a cambio no puede traer control positivo por commit. Sus
 * controles son POR CONSTRUCCIÓN: dos fichas (nueva/vieja) y dos catálogos
 * (compilado nuevo / index actual del árbol) que DEBEN contestar distinto.
 *
 * Secciones:
 *  [A] El COMPILADOR real emite el palnorte nuevo: concierto vivo, cheapOnly,
 *      zona «Preventa a ciegas» $300, sep/sepCheap 300, f:'Por confirmar'
 *      (f_texto tapa la fecha), ds:'2027-03-26' (sistema), staticImg (la
 *      portada viaja → MEDIA-GUARD no rebota). Control: la ficha VIEJA emite
 *      proximamente sin zona — el careo distingue los dos mundos.
 *  [B] El GATE por evento, EJECUTADO en vm (no leído): palnorte prende,
 *      otro evento no, sin cur no, el override ?req=1 sigue vivo, y
 *      REQUISICION_VIVA sigue siendo false (el global no se encendió).
 *  [C] La TIRA del hero no fuga la fecha: la EXPRESIÓN real de hs-fecha,
 *      ejecutada con la fechaCorta real del hero — «Por confirmar» tapa,
 *      y el control positivo: un evento que SÍ anuncia pinta su fecha.
 *  [D] El HANDLER REAL (requisicion-crear) con red falsa que habla el idioma
 *      del código (leído, no recordado): contra el catálogo NUEVO la
 *      requisición de $300 NACE (total_sistema=300, separo_sistema=300,
 *      zona canónica); contra el index ACTUAL del árbol (palnorte viejo,
 *      proximamente) REBOTA 409 con CERO escrituras. Honeypot: folio falso
 *      y cero red.
 *  [E] _redirects: /palnorte27 → /palnorte 301, ANTES del catchall
 *      (first match wins en Netlify).
 *
 * ⏳ Lo que este arnés NO puede medir y queda dicho: la tira y la ficha EN
 * NAVEGADOR contra PRODUCCIÓN (la ley del sorteo) — va después del push de
 * Memo + su publish desde Esferas, con captura.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
function af(cond, msg) {
  let ok = false;
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}

// ── Rebanado por balance de llaves (la receta de la casa) ────────────────────
function rebanarFn(src, ancla) {
  const i = src.indexOf(ancla);
  if (i < 0) throw new Error('ancla no encontrada: ' + ancla);
  let j = src.indexOf('{', i); let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('llaves sin balance desde: ' + ancla);
}
function sinComentarios(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1'); }

const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

// ── Las dos fichas: la NUEVA (foto de lo escrito hoy en la base) y la VIEJA ──
const FICHA_BASE = {
  slug: 'palnorte', nombre: 'Tecate Pa´l Norte 2027', venue: 'Parque Fundidora',
  ciudad: 'MTY', color: 'azul', publicado: true, archivado: false,
  created_at: '2026-09-15T20:40:34.685456+00:00',
  foto: 'https://npgnhsmwpcipxgvfxrho.supabase.co/storage/v1/object/public/mapas-eventos/palnorte-portada.webp',
  mapa: '', mapa_null: true, lineup: null, lineup_null: false,
  inc: '["Costo preferencial en nuestra fase más baja","Gorra conmemorativa Pa\'l Norte x Conecta MX","Gafete + boleto laminado conmemorativo","Prioridad para elegir viaje de 1, 2 o 3 días","Descuento especial para una segunda persona o para otro tour durante 2027"]',
};
const FICHA_NUEVA = Object.assign({}, FICHA_BASE, {
  tipo: 'concierto', status: '', sep: 300, sep_cheap: 300, cheap_only: true,
  cheap_zonas: '[{"n":"Preventa a ciegas","p":300,"ag":0,"prox":0,"vip":0,"sepEspecial":null,"requiereViajeros":null}]',
  fecha_inicio: '2027-03-26', fecha_fin: '2027-03-28', f_texto: 'Por confirmar',
  static_img: FICHA_BASE.foto,
  nota: 'PREVENTA A CIEGAS · Aparta tu paquete con solo $300. Cartel y fases por anunciarse — tu separo asegura el costo preferencial de la fase más baja.',
});
const FICHA_VIEJA = Object.assign({}, FICHA_BASE, {
  tipo: 'festival', status: 'proximamente', sep: 500, sep_cheap: 500, cheap_only: false,
  cheap_zonas: null, fecha_inicio: null, fecha_fin: null, f_texto: null, static_img: null,
  festival: { switches: { cheap: true, stay: true, ride: false, transporte: 'cdmx' }, portada: FICHA_BASE.foto, lineup: null, lineup_mostrar: true, musica: [], paquetes: [] },
  inc: null, nota: null,
});

function extraerObj(contenido, id) {
  const ancla = "{id:'" + id + "'";
  const i = contenido.indexOf(ancla);
  if (i < 0) return null;
  let depth = 0;
  for (let k = i; k < contenido.length; k++) {
    if (contenido[k] === '{') depth++;
    else if (contenido[k] === '}') { depth--; if (depth === 0) return contenido.slice(i, k + 1); }
  }
  return null;
}

(async function main() {
  // ═══ [A] EL COMPILADOR EMITE EL PALNORTE NUEVO ════════════════════════════
  console.log('\n[A] compilador · la ficha nueva emite la preventa, la vieja no');
  const { compilarEV } = require(path.join(RAIZ, 'netlify/functions/_lib/esferas-compile.js'));

  const outNuevo = compilarEV({ esferas: [FICHA_NUEVA], indexHtml: INDEX });
  const objN = extraerObj(outNuevo.contenidoNuevo || '', 'palnorte');
  af(!!objN, 'el compilado nuevo trae el objeto palnorte (cardinalidad)');
  if (objN) {
    af(objN.includes("st:''") || !/st:'[a-z]/.test(objN), 'palnorte queda VIVO (sin st de cierre)');
    af(objN.includes('cheapOnly:true'), 'cheapOnly:true — el único paquete es el apartado');
    af(objN.includes('Preventa a ciegas'), 'la zona «Preventa a ciegas» existe');
    af(/Preventa a ciegas',p:300/.test(objN.replace(/\s+/g, '')) || /p:300/.test(objN), 'la zona vale $300');
    af(objN.includes('sep:300'), 'sep:300 (separo de Memo)');
    af(objN.includes('sepCheap:300'), 'sepCheap:300 — el separo CHEAP también es $300');
    af(objN.includes("f:'Por confirmar'"), "f:'Por confirmar' — el público NO ve la fecha (f_texto la tapa)");
    af(objN.includes("ds:'2027-03-26'"), "ds:'2027-03-26' — el SISTEMA sí la tiene (época, orden, contador)");
    // ⚠️ La primera versión usaba /Mar.*2027/ y casaba «...confirMAR',ds:'2027...»
    // — el instrumento acusaba al código sano (la familia de «el comentario
    // contiene la palabra», en regex). El hecho: quitado el ds del SISTEMA,
    // ninguna forma humana de la fecha (26/27/28 mar · marzo · mar 2027) queda.
    const sinSistema = objN.replace(/ds:'2027-03-26'/g, '').replace(/added:'[^']*'/g, '');
    af(!/2[678]\s*(de\s*)?mar\b|\bmar(zo)?\s*(de\s*)?2027|2027-03/i.test(sinSistema),
      'ninguna forma HUMANA de la fecha viaja en el objeto (quitado el ds del sistema)');
    af(objN.includes('palnorte-portada.webp'), 'la portada viaja como staticImg (MEDIA-GUARD contento)');
    af(objN.includes('Gorra conmemorativa'), 'los beneficios del copy viven en inc (QUÉ INCLUYE)');
    af(!objN.includes('cdmx:true'), 'NO hereda cdmx:true del festival viejo — es Monterrey');
  }
  af(!(outNuevo.medios_en_riesgo || []).some(m => String(m).includes('palnorte')), 'MEDIA-GUARD no nombra a palnorte');

  // Control por construcción: la ficha VIEJA emite el otro mundo.
  const outViejo = compilarEV({ esferas: [FICHA_VIEJA], indexHtml: INDEX });
  const objV = extraerObj(outViejo.contenidoNuevo || '', 'palnorte');
  af(!!objV, 'control: el compilado con la ficha VIEJA también emite palnorte');
  if (objV) {
    af(objV.includes("st:'proximamente'"), 'control: la ficha vieja emite proximamente — el careo distingue los dos mundos');
    af(!objV.includes('Preventa a ciegas'), 'control: la ficha vieja NO trae la zona de preventa');
  }

  // ═══ [B] EL GATE POR EVENTO, EJECUTADO ════════════════════════════════════
  console.log('\n[B] gate · la requisición prende SOLO en palnorte');
  const litGlobal = (INDEX.match(/var REQUISICION_VIVA=false;/g) || []).length;
  af(litGlobal === 1, 'el interruptor GLOBAL sigue apagado, exactamente una declaración (hay ' + litGlobal + ')');
  // [NSQK-PREVENTA-1] La aserción vieja exigía «SOLO palnorte» y caducó el
  // 26-oct con la palabra de Memo («nsqkmty lo activamos como Pal Norte»):
  // se actualiza a la verdad nueva, no se silencia.
  af(INDEX.includes("var REQUISICION_EVENTOS=['palnorte','nsqkmty'];"), 'la lista por evento trae palnorte Y nsqkmty (NSQK-PREVENTA-1)');

  const iGate = INDEX.indexOf('var REQUISICION_VIVA=false;');
  const fnGate = rebanarFn(INDEX.slice(iGate), 'function _requisicionActiva()');
  const gateSrc = INDEX.slice(iGate, iGate + INDEX.slice(iGate).indexOf(fnGate) + fnGate.length);
  function probarGate(curVal, ssVal) {
    const store = {};
    if (ssVal) store.conecta_req_preview = ssVal;
    const sandbox = {
      cur: curVal,
      sessionStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
      URLSearchParams, location: { search: '' }, console,
    };
    vm.createContext(sandbox);
    vm.runInContext(gateSrc, sandbox);
    return vm.runInContext('_requisicionActiva()', sandbox);
  }
  af(probarGate({ id: 'palnorte' }) === true, 'cur=palnorte → la sección PRENDE');
  af(probarGate({ id: 'nsqkmty' }) === true, 'cur=nsqkmty → la sección PRENDE (NSQK-PREVENTA-1)');
  af(probarGate({ id: 'karolg' }) === false, 'cur=karolg → sigue APAGADA (el resto del sitio no cambia)');
  af(probarGate(undefined) === false, 'sin evento abierto → apagada');
  af(probarGate({ id: 'karolg' }, '1') === true, 'el override ?req=1 sigue vivo para probar en producción');

  // ═══ [N] NSQK-PREVENTA-1 · el segundo evento de la preventa ═══════════════
  console.log('\n[N] nsqkmty entra a la preventa — derivado, no disfrazado');
  {
    // _esPreventaCiegas y _pvPkgNombre, las REALES del index, corridas en vm.
    const src = [rebanarFn(INDEX, 'function _esPreventaCiegas(ev)'),
                 rebanarFn(INDEX, 'function _preventaZona(ev)'),
                 rebanarFn(INDEX, 'function _pvPkgNombre(ev)')].join('\n');
    const ctx = { String };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const esPv = (ev) => vm.runInContext('_esPreventaCiegas', ctx)(ev);
    const nom = (ev) => vm.runInContext('_pvPkgNombre', ctx)(ev);
    const zonaPv = [{ n: 'Preventa a ciegas', p: 300 }];
    af(esPv({ id: 'nsqkmty', cheapOnly: true, cheapZonas: zonaPv }) === true,
       'nsqkmty cheapOnly con su zona ES preventa a ciegas');
    af(esPv({ id: 'palnorte', cheapOnly: true, cheapZonas: zonaPv }) === true,
       'palnorte sigue siendo preventa (regresión)');
    af(esPv({ id: 'karolg', cheapOnly: true, cheapZonas: zonaPv }) === false,
       'un evento FUERA de la lista no es preventa aunque tenga la forma');
    af(esPv({ id: 'nsqkmty', cheapOnly: false, cheapZonas: zonaPv }) === false,
       'sin cheapOnly no hay preventa — la lista sola no basta');
    // El nombre se DERIVA del evento, en los dos sentidos.
    af(nom({ a: 'NSQK - Mosca World Tour' }) === 'PREVENTA A CIEGAS — NSQK - Mosca World Tour',
       'el nombre del paquete se deriva del evento (nsqk)');
    af(nom({ a: 'Tecate Pa´l Norte 2027' }) === 'PREVENTA A CIEGAS — Tecate Pa´l Norte 2027',
       'y palnorte dice su propio nombre — cero literal tecleado');
    // Los TRES llamadores pasan el evento; el literal viejo murió.
    const llam = (sinComentarios(INDEX).match(/_pvPkgNombre\(cur\)/g) || []).length;
    af(llam === 3, 'los 3 llamadores pasan cur a _pvPkgNombre (hay ' + llam + ')');
    af(!sinComentarios(INDEX).includes("'PREVENTA A CIEGAS — Pa\\'l Norte 2027'"),
       'el nombre tecleado del paquete ya no vive en el código');
    // El correo único y el redirect corto.
    const correoLib = fs.readFileSync(path.join(RAIZ, 'netlify/functions/_lib/correo-confirmacion.js'), 'utf8');
    af(/EVENTOS_CORREO\s*=\s*\['palnorte',\s*'nsqkmty'\]/.test(correoLib),
       'EVENTOS_CORREO trae a los dos — la confirmación de nsqk saldrá al aprobar');
    const redir = fs.readFileSync(path.join(RAIZ, '_redirects'), 'utf8');
    af(/^\/nsqk\s+\/nsqkmty\s+301/m.test(redir), 'el redirect corto /nsqk → /nsqkmty existe');
  }

  // ═══ [C] LA TIRA NO FUGA LA FECHA (la expresión real, ejecutada) ══════════
  console.log('\n[C] tira del hero · «Por confirmar» tapa la fecha del sistema');
  const limpio = sinComentarios(INDEX);
  const anclaIni = '\'<div class="hs-fecha">\'+esc(';
  const iExp = limpio.indexOf(anclaIni);
  af(iExp > -1, 'la expresión de hs-fecha existe (cardinalidad del ancla)');
  if (iExp > -1) {
    const fin = limpio.indexOf(")+'</div>'", iExp);
    const expr = limpio.slice(iExp + anclaIni.length, fin);
    const mescLine = INDEX.split('\n').find(l => l.includes("var MESC=["));
    const fcHero = rebanarFn(INDEX, 'function fechaCorta(ds)');
    function pintarFecha(e) {
      const sandbox = { Date, parseInt, String };
      vm.createContext(sandbox);
      vm.runInContext(mescLine + '\n' + fcHero + '\nfunction esc(s){return String(s);}\nfunction dsEfectivo(e){return e.ds;}', sandbox);
      sandbox.e = e;
      return vm.runInContext('(' + expr + ')', sandbox);
    }
    af(pintarFecha({ f: 'Por confirmar', ds: '2027-03-26' }) === 'Por confirmar',
      'palnorte en la tira dice «Por confirmar» — la fecha del sistema NO se anuncia');
    af(pintarFecha({ f: '6 Nov 2026', ds: '2026-11-06' }) === '6 nov',
      'control positivo: un evento que SÍ anuncia su fecha la sigue pintando');
    af(pintarFecha({ f: '26 Mar 2027', ds: '2027-03-26' }) === '26 mar 2027',
      'control: con la fecha ANUNCIADA, la tira pinta año (LAND-2c intacto) — el guard solo tapa lo no anunciado');
  }

  // ═══ [D] EL HANDLER REAL: nace con el catálogo nuevo, rebota con el viejo ═
  console.log('\n[D] requisicion-crear · la autoridad del precio contra los dos catálogos');
  process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.fake';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'llave-falsa';
  process.env.URL = 'https://sitio.fake';

  const JPEG_B64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]).toString('base64');
  function payload(extra) {
    return Object.assign({
      web: '', evento_id: 'palnorte', paquete: 'cheap', zona: 'Preventa a ciegas',
      num_personas: 1, hotel: null, transporte: null,
      cotizacion_texto: 'PREVENTA A CIEGAS $300', nombre: 'Prueba PN27',
      celular: '8991234567', correo: 'pn27@prueba.mx', forma_pago: 'oxxo',
      comprobante_base64: JPEG_B64,
    }, extra || {});
  }
  function limpiarCache() {
    for (const k of Object.keys(require.cache)) {
      if (k.includes(path.join('netlify', 'functions'))) delete require.cache[k];
    }
  }
  async function correr(catalogo, body) {
    limpiarCache();
    const llamadas = { index: 0, topeGet: 0, storagePost: 0, reqPost: 0, otras: [] };
    let filaInsertada = null;
    global.fetch = async (url, init) => {
      const u = String(url); const metodo = (init && init.method) || 'GET';
      if (u.includes('/index.html')) { llamadas.index++; return { ok: true, status: 200, text: async () => catalogo }; }
      if (u.includes('/rest/v1/requisiciones') && metodo === 'GET') { llamadas.topeGet++; return { ok: true, status: 200, json: async () => [] }; }
      if (u.includes('/storage/v1/object/') && metodo === 'POST') { llamadas.storagePost++; return { ok: true, status: 200, text: async () => '{}' }; }
      if (u.includes('/rest/v1/requisiciones') && metodo === 'POST') {
        llamadas.reqPost++; filaInsertada = JSON.parse(init.body);
        return { ok: true, status: 201, json: async () => [Object.assign({ id: 'uuid-fake' }, filaInsertada)], text: async () => '' };
      }
      llamadas.otras.push(metodo + ' ' + u);
      throw new Error('red no prevista: ' + metodo + ' ' + u);
    };
    const { handler } = require(path.join(RAIZ, 'netlify/functions/requisicion-crear.js'));
    const res = await handler({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx' }, body: JSON.stringify(body) });
    return { res, llamadas, fila: filaInsertada, json: JSON.parse(res.body || '{}') };
  }

  // D1 · catálogo NUEVO (el compilado de [A]) → la requisición NACE con $300.
  const d1 = await correr(outNuevo.contenidoNuevo, payload());
  af(d1.res.statusCode === 200 && d1.json.ok === true, 'con el catálogo NUEVO la requisición nace (200 ok) — salió ' + d1.res.statusCode + (d1.json.error ? ' · ' + d1.json.error : ''));
  af(/^R-/.test(d1.json.folio || ''), 'trae folio real R-…');
  af(d1.llamadas.reqPost === 1 && !!d1.fila, 'se insertó UNA fila (contador del mock, no fe)');
  if (d1.fila) {
    af(d1.fila.total_sistema === 300, 'total_sistema = $300 — lo recalculó el DUEÑO, no el cliente (vale ' + d1.fila.total_sistema + ')');
    af(d1.fila.separo_sistema === 300, 'separo_sistema = $300 (vale ' + d1.fila.separo_sistema + ')');
    af(d1.fila.zona === 'Preventa a ciegas', 'la zona guardada es la CANÓNICA del catálogo');
    af(d1.fila.estado === 'pendiente', 'nace pendiente — la aprueba un humano en la bandeja');
    af(d1.fila.forma_pago === 'oxxo', 'OXXO viaja como forma de pago (ya era forma soportada)');
  }
  af(d1.llamadas.storagePost === 1, 'el comprobante subió al bucket (1 POST storage)');
  af(d1.llamadas.otras.length === 0, 'cero red fuera del guion (ninguna URL sorpresa)');

  // D2 · el index SIN la preventa publicada (palnorte viejo: proximamente) → REBOTA.
  // ⚰️ Antes esto servía el index del árbol tal cual, y CADUCÓ el 13-oct: el
  // publish de Memo metió la preventa al index y el «antes» se volvió «después»
  // (el verde también caduca). Hoy el «sin publicar» se FABRICA compilando la
  // FICHA VIEJA — no depende de en qué día se corra.
  const INDEX_SIN_PUB = require(path.join(RAIZ, 'netlify/functions/_lib/esferas-compile.js'))
    .compilarEV({ esferas: [FICHA_VIEJA], indexHtml: INDEX }).contenidoNuevo;
  af(/id:'palnorte'[^}]*st:'proximamente'/.test(INDEX_SIN_PUB), 'premisa: el index fabricado trae palnorte SIN publicar (proximamente)');
  const d2 = await correr(INDEX_SIN_PUB, payload());
  af(d2.res.statusCode !== 200 || d2.json.ok !== true, 'control: contra el catálogo ACTUAL (preventa aún no publicada) la requisición NO nace (salió ' + d2.res.statusCode + ')');
  af(d2.llamadas.reqPost === 0 && d2.llamadas.storagePost === 0, 'control: y no escribió NADA (0 storage, 0 insert)');

  // D3 · honeypot: folio de utilería, cero red.
  const d3 = await correr(outNuevo.contenidoNuevo, payload({ web: 'soy-un-bot' }));
  af(d3.res.statusCode === 200 && /^R-/.test(d3.json.folio || ''), 'honeypot: contesta folio de utilería (200)');
  af(d3.llamadas.reqPost === 0 && d3.llamadas.storagePost === 0 && d3.llamadas.index === 0, 'honeypot: CERO red — nada se escribió ni se consultó');

  // ═══ [E] EL REDIRECT, ANTES DEL CATCHALL ══════════════════════════════════
  console.log('\n[E] _redirects · /palnorte27 → /palnorte, antes del catchall');
  const RED = fs.readFileSync(path.join(RAIZ, '_redirects'), 'utf8');
  const lineas = RED.split('\n').map(l => l.trim());
  const iRegla = lineas.findIndex(l => /^\/palnorte27\s+\/palnorte\s+301$/.test(l));
  const iCatch = lineas.findIndex(l => /^\/\*\s+\/index\.html\s+200$/.test(l));
  af(iRegla > -1, 'la regla /palnorte27 → /palnorte 301 existe');
  af(iCatch > -1, 'el catchall sigue existiendo (cardinalidad del control)');
  af(iRegla > -1 && iCatch > -1 && iRegla < iCatch, 'y la regla va ANTES del catchall (first match wins)');

  // ═══ [F] EL BLAST: RETIRADO (BLAST-RETIRO-1, 21-oct-2026) ═════════════════
  // Palabra de Memo: «ya terminé con el blast del Pa'l Norte, podemos
  // eliminarlo para trabajar solo con Genkidama». El endpoint, la pantalla y
  // su careo se van JUNTOS — este bloque no se silencia: se actualiza a la
  // verdad nueva (la ley de los arneses podridos). Lo que QUEDA de guardia:
  console.log('\n[F] el blast RETIRADO · lo que queda de guardia');
  af(!fs.existsSync(path.join(RAIZ, 'netlify/functions/admin-preventa-blast.js')), 'el endpoint del blast ya no existe');
  af(!fs.existsSync(path.join(RAIZ, 'kamehouse-blast.js')), 'la pantalla del blast ya no existe');
  const _kjs = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  const _khtml = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(!/'blast'/.test(_kjs) && !/loadBlast/.test(_kjs), 'kamehouse.js sin permiso ni cargador del blast');
  af(!/nav-blast|page-blast|kamehouse-blast\.js/.test(_khtml), 'kamehouse.html sin botón, página ni script del blast');
  // 🔒 La TABLA preventa_blast NO se toca: es la bitácora (acta) de los ~240
  // correos ya mandados, y GENKIDAMA la sigue leyendo para tres cosas que no
  // pueden morir con el botón: la ENERGÍA del día, la SIEMBRA de contactos y
  // la exclusión `excluir_blast` de GENKIDAMA-2.
  const _gklib = fs.readFileSync(path.join(RAIZ, 'netlify/functions/_lib/genkidama.js'), 'utf8');
  const _gk = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-genkidama.js'), 'utf8');
  af(/preventa_blast/.test(_gklib), 'la energía de Genkidama sigue contando la bitácora del blast');
  af((_gk.match(/preventa_blast/g) || []).length >= 2, 'y Genkidama sigue leyendo la bitácora (siembra + excluir_blast)');

  // ═══ RESULTADO ════════════════════════════════════════════════════════════
  console.log('\n══ RESULTADO ══');
  if (V + R === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R === 0 ? '✅ VERDE' : '🔴 ROJO') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  console.log('⏳ Pendiente que este arnés NO cubre: la ficha y la tira EN NAVEGADOR');
  console.log('   contra PRODUCCIÓN, después del push + publish (la ley del sorteo).');
  process.exit(R === 0 ? 0 : 1);
})().catch(e => { console.error('🔴 EL ARNÉS SE CAYÓ (eso también es un rojo):', e); process.exit(1); });
