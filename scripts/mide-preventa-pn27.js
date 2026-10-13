#!/usr/bin/env node
/* =============================================================================
 * mide-preventa-pn27 — PN27 · PREVENTA A CIEGAS Pa'l Norte 2027 (14-oct-2026)
 *
 * Palabra de Memo: preventa a ciegas, separo $300, fecha 26-28 mar 2027 SOLO
 * para el sistema (el público ve «Por confirmar»), bandeja de requisiciones
 * encendida POR EVENTO (solo palnorte), blast por tandas después.
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
  af(INDEX.includes("var REQUISICION_EVENTOS=['palnorte'];"), 'la lista por evento existe y trae SOLO palnorte');

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
  af(probarGate({ id: 'karolg' }) === false, 'cur=karolg → sigue APAGADA (el resto del sitio no cambia)');
  af(probarGate(undefined) === false, 'sin evento abierto → apagada');
  af(probarGate({ id: 'karolg' }, '1') === true, 'el override ?req=1 sigue vivo para probar en producción');

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

  // ═══ [F] EL BLAST: seco no manda, enviar exige confirmar, el sitio manda ══
  console.log('\n[F] admin-preventa-blast · las cuatro puertas del correo real');
  process.env.JWT_SECRET = 'secreto-del-arnes';
  process.env.PORTAL_SUPABASE_URL = 'https://portal.fake';
  process.env.PORTAL_SUPABASE_SERVICE_KEY = 'llave-portal-falsa';
  process.env.RESEND_API_KEY = 're_fake_key';
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const tokenRoshi = jwtSign({ id: 'u-memo', rol: 'maestro_roshi', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
  const tokenBulma = jwtSign({ id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);

  async function correrBlast(catalogo, body, token, filasBitacora) {
    limpiarCache();
    const n = { resend: 0, patch: 0, postBitacora: 0, index: 0 };
    const filas = (filasBitacora || []).map((f, i) => Object.assign({ id: 'b' + i, campana: 'pn27', caliente: false, enviado_at: null, error: null }, f));
    const patches = [];
    global.fetch = async (url, init) => {
      const u = String(url); const metodo = (init && init.method) || 'GET';
      if (u.includes('api.resend.com')) { n.resend++; return { ok: true, status: 200, json: async () => ({ id: 'em' }) }; }
      if (u.includes('/index.html')) { n.index++; return { ok: true, status: 200, text: async () => catalogo }; }
      // ⚠️ /rest/v1/usuarios sirve a DOS preguntas: la SESIÓN del verify (debe
      // tronar → fail-open documentado, el rol del JWT manda) y el STAFF de la
      // siembra (select=correo — debe contestar). Dos caminos, una ruta.
      if (u.includes('/rest/v1/usuarios') && u.includes('select=correo')) { return { ok: true, status: 200, json: async () => [] }; }
      if (u.includes('/rest/v1/usuarios') || u.includes('sesion')) { throw new Error('sesion-viva truena a propósito (fail-open documentado: el rol del JWT manda)'); }
      if (u.includes('/rest/v1/preventa_blast')) {
        if (metodo === 'GET') {
          const pend = filas.filter((f) => !f.enviado_at && !f.error);
          const lim = (u.match(/limit=(\d+)/) || [])[1];
          const quiere = u.includes('select=id&limit=1') && !u.includes('enviado_at') ? filas.slice(0, 1) : pend.slice(0, lim ? Number(lim) : 100);
          return { ok: true, status: 200, json: async () => quiere, headers: { get: (h) => h === 'content-range' ? `0-0/${pend.length}` : null }, text: async () => '' };
        }
        if (metodo === 'PATCH') {
          n.patch++; const id = (u.match(/id=eq\.([^&]+)/) || [])[1];
          const f = filas.find((x) => x.id === id); if (f) Object.assign(f, JSON.parse(init.body));
          patches.push({ id, body: JSON.parse(init.body) });
          return { ok: true, status: 204, text: async () => '' };
        }
        if (metodo === 'POST') { n.postBitacora += JSON.parse(init.body).length; return { ok: true, status: 201, text: async () => '' }; }
      }
      if (u.includes('portal.fake')) {
        if (u.includes('giveaway_registros')) return { ok: true, status: 200, json: async () => [{ correo: 'Nuevo@Correo.MX ', nombre: 'Nuevo' }, { correo: 'ya@estaba.mx', nombre: 'Dup' }] };
        if (u.includes('bkp_mel')) return { ok: true, status: 200, json: async () => [] };
      }
      if (u.includes('/rest/v1/eventos_waitlist')) return { ok: true, status: 200, json: async () => [] };
      throw new Error('red no prevista en [F]: ' + metodo + ' ' + u);
    };
    const { handler } = require(path.join(RAIZ, 'netlify/functions/admin-preventa-blast.js'));
    const headers2 = { origin: 'https://conectareynosa.mx' };
    if (token) headers2.authorization = 'Bearer ' + token;
    const res = await handler({ httpMethod: 'POST', headers: headers2, body: JSON.stringify(body) });
    return { res, json: JSON.parse(res.body || '{}'), n, filas, patches };
  }

  // F1 · la pluma: bulma rebota, sin token rebota.
  const f1 = await correrBlast(outNuevo.contenidoNuevo, { accion: 'estado' }, tokenBulma, []);
  af(f1.res.statusCode === 403, 'bulma NO puede entrar al blast (403) — la pluma es de Memo (salió ' + f1.res.statusCode + ')');
  const f1b = await correrBlast(outNuevo.contenidoNuevo, { accion: 'estado' }, null, []);
  af(f1b.res.statusCode === 401 || f1b.res.statusCode === 403, 'sin token rebota (' + f1b.res.statusCode + ')');

  // F2 · seco: enseña el correo y NO manda (con su control positivo en F4).
  const f2 = await correrBlast(outNuevo.contenidoNuevo, { accion: 'seco' }, tokenRoshi, [{ correo: 'uno@x.mx', nombre: 'Ana' }]);
  af(f2.res.statusCode === 200 && f2.json.seco === true, 'el seco contesta 200 (salió ' + f2.res.statusCode + (f2.json.error ? ' · ' + f2.json.error : '') + ')');
  af(f2.n.resend === 0, 'el seco NO mandó un solo correo (Resend = 0)');
  if (f2.json.html) {
    af(f2.json.html.includes('$300') && f2.json.html.includes('Gorra conmemorativa'), 'el html trae el copy de Memo ($300 + beneficios)');
    af(f2.json.html.includes('palnorte27'), 'el CTA apunta a /palnorte27');
    af(f2.json.html.includes('BAJA'), 'la línea de baja existe (higiene del dominio que manda la cobranza)');
    af(!/2[678]\s*(de\s*)?mar|\bmar(zo)?\s*(de\s*)?2027|2027-03/i.test(f2.json.html), 'la FECHA no viaja en el correo');
  }

  // F3 · el candado del sitio: contra el catálogo ACTUAL (preventa sin publicar), ni seco ni enviar.
  const f3 = await correrBlast(INDEX_SIN_PUB, { accion: 'seco' }, tokenRoshi, []);
  af(f3.res.statusCode === 409, 'control: con el sitio SIN publicar, el seco se rehúsa (409 — CONSUELO-VERDAD) (salió ' + f3.res.statusCode + ')');
  const f3b = await correrBlast(INDEX_SIN_PUB, { accion: 'enviar', confirmar: true, tope: 5 }, tokenRoshi, [{ correo: 'uno@x.mx' }]);
  af(f3b.res.statusCode === 409 && f3b.n.resend === 0, 'control: enviar contra el sitio sin publicar tampoco manda NADA');

  // F4 · enviar: confirmar obligatorio · tope respetado · bitácora tras el envío.
  const f4a = await correrBlast(outNuevo.contenidoNuevo, { accion: 'enviar', tope: 5 }, tokenRoshi, [{ correo: 'uno@x.mx' }]);
  af(f4a.res.statusCode === 400 && f4a.n.resend === 0, 'enviar SIN confirmar:true rebota con cero envíos (dos gestos)');
  const f4 = await correrBlast(outNuevo.contenidoNuevo, { accion: 'enviar', confirmar: true, tope: 2 }, tokenRoshi,
    [{ correo: 'uno@x.mx', nombre: 'Ana', caliente: true }, { correo: 'dos@x.mx' }, { correo: 'tres@x.mx' }]);
  af(f4.json.ok === true && f4.json.enviados === 2, 'con confirmar manda EXACTO el tope (2 de 3 pendientes) — control positivo del contador (envió ' + f4.json.enviados + ')');
  af(f4.n.resend === 2, 'Resend vio 2 envíos (el contador no es ciego)');
  af(f4.n.patch === 2 && f4.patches.every((p) => p.body.enviado_at), 'la bitácora se asentó fila por fila DESPUÉS de cada envío');

  // F5 · sembrar: dedup + idempotencia (el duplicado no re-entra).
  const f5 = await correrBlast(outNuevo.contenidoNuevo, { accion: 'sembrar_giveaway', confirmar: true }, tokenRoshi, [{ correo: 'ya@estaba.mx' }]);
  af(f5.json.ok === true && f5.n.postBitacora === 1, 'la siembra insertó SOLO el correo nuevo (el duplicado del Portal no re-entra) — insertó ' + f5.n.postBitacora);

  // ═══ RESULTADO ════════════════════════════════════════════════════════════
  console.log('\n══ RESULTADO ══');
  if (V + R === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R === 0 ? '✅ VERDE' : '🔴 ROJO') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  console.log('⏳ Pendiente que este arnés NO cubre: la ficha y la tira EN NAVEGADOR');
  console.log('   contra PRODUCCIÓN, después del push + publish (la ley del sorteo).');
  process.exit(R === 0 ? 0 : 1);
})().catch(e => { console.error('🔴 EL ARNÉS SE CAYÓ (eso también es un rojo):', e); process.exit(1); });
