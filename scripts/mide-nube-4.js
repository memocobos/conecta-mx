#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-nube-4.js — NUBE-4 · la cotización POR EVENTO, con herencia rotulada
//
// Orden de Memo (24-sep-2026): el dato por evento y la pluma con selector.
//
// 🔒 LOS DOS LADOS SON COMMITS. Y commitear exige RE-ANCLAR.
//
// 🔒 SE ENTRA POR EL HANDLER REAL y se simula UN SALTO MÁS ADENTRO (el `fetch`
// a PostgREST). Un mock por ruta salta al portero: tres tuercas llegaron ROTAS
// a producción con el careo en verde.
//
// 🔴 EL CANDADO DE NUBE-3 SE RE-FORMA, Y ESTA VEZ CON RAZÓN. Ese careo exigía
// que `_lib/nube.js` fuera BYTE A BYTE el de BASE, porque la forma fácil de
// romper «pregúntale al dueño» es cambiarle la respuesta al dueño. Aquí el
// dueño cambia DE VERDAD —recibe `evento_id`, que es una pregunta nueva— así
// que el candado ya no puede ser la igualdad. Se re-forma a lo que de verdad
// protege: que los CUATRO bebedores consuman LA MISMA función nueva, ninguno
// con su propia resolución al lado. Un dueño con cuatro clientes y una sola
// respuesta sigue siendo un dueño; cuatro copias que hoy coinciden no.
//
// Se corre:  npm run mide:nube-4
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let verde = 0, rojo = 0, completo = false;
const fallos = [];
// 🔒 [NUBE4-ARNES-1] EL MENSAJE TAMBIÉN PUEDE SER UNA FUNCIÓN, y por una razón
// medida: `af` ya atrapaba la excepción de la CONDICIÓN, pero el `msg` se armaba
// ANTES de llamarla — un `JSON.stringify(d.resuelto.bus)` dentro del texto
// reventaba fuera del try y tiraba el arnés entero. Con el reloj corrido eso es
// justo lo que pasó: `TypeError: Cannot read properties of null (reading
// 'precio')` en la línea 213, y las secciones de abajo NO se midieron. Un arnés
// que se cae no reporta: esconde cuál candado habría cazado el fallo.
function af(cond, msg) {
  let ok = false, extra = '';
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { ok = false; extra = '  [EXCEPCIÓN: ' + e.message + ']'; }
  if (ok) { verde++; return; }
  let texto;
  try { texto = (typeof msg === 'function') ? msg() : msg; }
  catch (e) { texto = '(el mensaje de este fallo también reventó: ' + e.message + ')'; }
  rojo++; fallos.push(texto + extra); console.log('   ✗ ' + texto + extra);
}
// Lectura que NUNCA lanza: para los `console.log` del recorrido, que no son
// aserciones y por eso tirarían la corrida sin dejar ni un renglón de rojo.
function ver(fn) {
  try { const v = fn(); return v === undefined ? 'undefined' : JSON.stringify(v); }
  catch (e) { return '«no se pudo leer: ' + e.message + '»'; }
}
const seg = (fn, pordefecto) => { try { const v = fn(); return v == null ? pordefecto : v; } catch (_) { return pordefecto; } };
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  console.log((rojo ? '❌ ROJO · ' : '✅ VERDE · ') + verde + ' en verde, ' + rojo + ' en rojo');
  fallos.slice(0, 16).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '5b2c107';
const HEAD_SHA = process.env.HEAD_SHA || '356449e';   // el merge de NUBE4-ARNES-1
const iso = (s) => new Date(s).toISOString();
// ══ [NUBE4-ARNES-1] EL RELOJ ════════════════════════════════════
// 🔴 `AHORA` existía —y NO SE USABA EN NINGUNA PARTE: la intención de fijar el
// reloj se escribió y nunca se cableó, y por eso el padrón se podrió. Las fechas
// iban TECLEADAS (22/23/24/28/30-sep) y el 1-oct la lib contestó, con toda la
// razón, que no había nada vigente: siete rojos y una caída sobre código sano.
// Hermana de las fechas vencidas de `flashPromo`.
//
// 🔒 LA RECETA: las fechas del fixture van RELATIVAS a hoy. Un fixture con
// fechas tecleadas es una FOTO, y una foto caduca sin avisar — el día que caduca
// no se entera nadie, porque se lee igual que un defecto del código.
//
// ⚠️ La lib SÍ acepta el reloj inyectado (`ahoraMs` con respaldo a `Date.now()`,
// y su comentario dice por qué), pero aquí se entra por el HANDLER y el handler
// no lo pasa — entrar por donde entra el cliente es la ley, así que el reloj se
// mueve del lado del DATO, no del lado del lector.
const AHORA = Date.now();
const dias = (n) => new Date(AHORA + n * 86400000).toISOString();
// El día que se le pide al historial, en el formato que usa la pantalla.
const diaDe = (n) => new Date(AHORA + n * 86400000).toISOString().slice(0, 10);

// ── EL PADRÓN FALSO · el caso que decide la tuerca ──────────────────────
// `edc27` tiene bus propio MÁS BARATO y la general del bus es MÁS NUEVA: si la
// herencia se resolviera por «la última capturada» en vez de por especificidad,
// edc27 vendería el precio general. Ése es el caso que hay que ver llegar.
// 🔒 SE ARMA CON UNA FUNCIÓN, no como literal, y por dos razones: las fechas se
// calculan desde hoy, y el padrón se puede RE-ARMAR con un desfase para el
// control del instrumento del bloque [V] (correr el reloj y exigir que el arnés
// SÍ note la diferencia). Un fixture que no se puede mover no se puede controlar.
//
// ⚠️ LOS TRES ESTADOS DE `regiaEl` NECESITAN SU FILA. Ahora que las fechas se
// mueven solas, la rama de «vencida» se quedaría sin medir si todo el padrón
// fuera vigente: `g2` está vencida A PROPÓSITO, y también relativa.
function armarFilas(desfase) {
  const f = (n) => dias(n + (desfase || 0));
  return [
    // GENERAL (evento_id null) · VIGENTE hoy.
    { id: 'g1', modo: 'bus', evento_id: null, precio_pp: 2500,
      vigente_desde: f(-2), vigente_hasta: f(5),
      horarios: 'Turistar · sale 9 pm, regresa 11 pm', nota: 'general', capturado_por: 'bulma@conectareynosa.mx',
      creado_en: f(-2) },
    // GENERAL del avión · **VENCIDA A PROPÓSITO** (murió ayer): es la fila con la
    // que se mide el estado `vencida` y el «no hay precio de avión» de la pantalla.
    { id: 'g2', modo: 'avion', evento_id: null, precio_pp: 4800,
      vigente_desde: f(-9), vigente_hasta: f(-1),
      horarios: null, nota: 'general vencida', capturado_por: 'milk@conectareynosa.mx',
      creado_en: f(-9) },
    // PROPIA de edc27: el bus, MÁS BARATO y capturado ANTES que la general — el
    // caso que decide la tuerca (lo específico le gana a lo nuevo).
    { id: 'e1', modo: 'bus', evento_id: 'edc27', precio_pp: 2100,
      vigente_desde: f(-4), vigente_hasta: f(3),
      horarios: 'Turistar directo · sale 6 am', nota: 'directo al Autódromo', capturado_por: 'milk@conectareynosa.mx',
      creado_en: f(-4) },
  ];
}
let FILAS = armarFilas(0);
// Lo que el catálogo REAL contesta (se pide al árbol servido, no se teclea).
let EVENTOS_REALES = [];

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'n4-base'), h = sacar(HEAD_SHA, 'n4-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }

  // ── [I] EL INSTRUMENTO, y la red falsa EXIGE los dos filtros ──────────
  // 🔒 Si `filasDe` se olvidara del filtro del evento, la general y la propia
  // se mezclarían y el ORDEN decidiría el precio. La red falsa se REHÚSA a
  // contestar sin los dos filtros, así que ese olvido es una CAÍDA, no un
  // verde: es la lección de «la base de mentira miente de un modo que la de
  // verdad no puede» — aquí se le pide que sea MÁS estricta, no menos.
  console.log('[I] el instrumento');
  let SIN_CATALOGO = false, SIN_TABLA = false;
  const pedidos = [];
  function armarRed(dir) {
    global.fetch = async (url, opts) => {
      const u = String(url), met = (opts && opts.method) || 'GET';
      if (/index\.html$/.test(u)) {
        if (SIN_CATALOGO) return { ok: false, status: 503, text: async () => 'nope', json: async () => ({}) };
        return { ok: true, status: 200, text: async () => fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), json: async () => ({}) };
      }
      pedidos.push(met + ' ' + u.replace(/^.*rest\/v1\//, ''));
      if (SIN_TABLA) return { ok: false, status: 404, text: async () => 'relation does not exist', json: async () => ({}) };
      if (met === 'POST') {
        const cuerpo = JSON.parse((opts && opts.body) || '{}');
        return { ok: true, status: 201, json: async () => [Object.assign({ id: 'nueva', creado_en: dias(0) }, cuerpo)], text: async () => '' };
      }
      const mm = /modo=eq\.([a-z]+)/.exec(u);
      if (!mm) throw new Error('la red falsa EXIGE el filtro por modo: ' + u);
      const esNull = /evento_id=is\.null/.test(u);
      const mev = /evento_id=eq\.([^&]+)/.exec(u);
      if (!esNull && !mev) throw new Error('la red falsa EXIGE el filtro por evento_id (is.null o eq.X): ' + u);
      const ev = esNull ? null : decodeURIComponent(mev[1]);
      const out = FILAS.filter((x) => x.modo === mm[1] && x.evento_id === ev);
      return { ok: true, status: 200, json: async () => out, text: async () => '' };
    };
  }
  function limpiar(dir) {
    for (const f of ['admin-nube.js', 'nube-vigente.js', '_lib/nube.js', '_lib/catalogo-index.js']) {
      const p = path.join(dir, 'netlify/functions', f);
      try { delete require.cache[require.resolve(p)]; } catch (_) {}
    }
    const va = require.resolve(path.join(dir, 'netlify/functions/_lib/verify-admin.js'));
    require.cache[va] = { id: va, filename: va, loaded: true, exports: {
      corsCheck: () => 'https://conectareynosa.mx',
      verifyAdminAuthLive: async (ev, roles) => ({ valid: true, roles, user: { id: 'u1', correo: 'bulma@conectareynosa.mx', rol: 'bulma' } }),
    } };
    process.env.SUPABASE_URL_KAMEHOUSE = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
    process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
    process.env.URL = 'https://conectareynosa.mx';
  }
  const admin = async (body, dir) => {
    const d0 = dir || h.dir;
    armarRed(d0); limpiar(d0);
    const mod = require(path.join(d0, 'netlify/functions/admin-nube.js'));
    const res = await mod.handler({
      httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify(body),
    });
    return { res, d: JSON.parse(res.body || '{}') };
  };
  const publico = async (qs, dir) => {
    const d0 = dir || h.dir;
    armarRed(d0); limpiar(d0);
    const mod = require(path.join(d0, 'netlify/functions/nube-vigente.js'));
    const res = await mod.handler({ httpMethod: 'GET', queryStringParameters: qs || {} });
    return { res, d: JSON.parse(res.body || '{}') };
  };
  const lib = (() => { limpiar(h.dir); return require(path.join(h.dir, 'netlify/functions/_lib/nube.js')); })();
  af(typeof lib.resolver === 'function' && typeof lib.vigentes === 'function' && typeof lib.regiaEl === 'function',
     'el dueño no exporta `resolver`/`vigentes`/`regiaEl`: todo lo de abajo mide otra cosa');
  af(lib.filasDe.length === 4,
     'la firma de `filasDe` no cambió a (pedir, modo, eventoId, limite): tiene ' + lib.filasDe.length + ' parámetros');

  // ── [A] LA LISTA DE EVENTOS, DERIVADA DEL CATÁLOGO ────────────────────
  console.log('\n[A] la acción `eventos` · la lista derivada');
  const rEv = await admin({ accion: 'eventos' });
  EVENTOS_REALES = (rEv.d.eventos || []).map((e) => e.id);
  console.log('    ' + EVENTOS_REALES.length + ' eventos: ' + EVENTOS_REALES.slice(0, 6).join(', ') + '…');
  af(rEv.res.statusCode === 200 && rEv.d.ok === true, 'la acción `eventos` no contestó 200/ok: ' + rEv.res.body.slice(0, 200));
  af(EVENTOS_REALES.length > 5,
     'CANDADO DE CARDINALIDAD: la lista derivada trae ' + EVENTOS_REALES.length + ' eventos. Con un puñado, '
     + 'las aserciones de abajo pasarían en vacío');
  af(EVENTOS_REALES.includes('edc27'), 'edc27 (CDMX, vivo) no está en la lista derivada: ' + JSON.stringify(EVENTOS_REALES.slice(0, 10)));
  af(EVENTOS_REALES.includes('vaiven') && EVENTOS_REALES.includes('coronacapital'),
     '`noBus` NO debe excluir: esos eventos siguen usando el paso del transporte, con avión solamente');
  // Un evento de MONTERREY no puede estar: la nube es de CDMX.
  const mty = ['frontera', 'youngmiko', 'soad'].filter((x) => EVENTOS_REALES.includes(x));
  af(mty.length === 0, 'la lista trae eventos que NO son de CDMX: ' + JSON.stringify(mty));
  // 🔒 «NO HAY» Y «NO PUDE» NO SE VEN IGUAL. Una lista vacía dejaría el
  // selector con solo la general y mandaría toda cotización al cajón general.
  SIN_CATALOGO = true;
  const rEvMal = await admin({ accion: 'eventos' });
  SIN_CATALOGO = false;
  console.log('    con el catálogo ilegible → ' + rEvMal.res.statusCode + ' ' + (rEvMal.d.error || '').slice(0, 50));
  af(rEvMal.res.statusCode >= 500,
     'con el catálogo ILEGIBLE la acción contestó ' + rEvMal.res.statusCode + ' en vez de un 5xx: una lista '
     + 'vacía se leería como «no hay eventos de CDMX» y toda cotización acabaría en el cajón general');
  af(!Array.isArray(rEvMal.d.eventos), 'contestó una lista de eventos aunque no pudo leer el catálogo');

  // ── [H] LA HERENCIA ROTULADA · el corazón de la tuerca ────────────────
  console.log('\n[H] la herencia rotulada');
  const rProp = await admin({ accion: 'listar', evento_id: 'edc27' });
  const resProp = rProp.d.resuelto || {};
  console.log('    edc27  bus → ' + ver(() => resProp.bus) + '\n           avion → ' + ver(() => resProp.avion));
  // 🔴 LO ESPECÍFICO LE GANA A LO GENERAL **AUNQUE LA GENERAL SEA MÁS NUEVA**.
  // La propia del bus de edc27 se capturó el 20 y la general el 22: si la
  // resolución fuera por «la última», edc27 vendería $2,500 en vez de $2,100.
  af(resProp.bus && resProp.bus.precio === 2100,
     'edc27 tenía que vender SU bus de $2,100 y salió ' + JSON.stringify(resProp.bus) + '. La general es MÁS '
     + 'NUEVA ($2,500, capturada dos días después): si la resolución se hace por orden y no por '
     + 'especificidad, el evento vende el precio de otro');
  af(resProp.bus && resProp.bus.heredado === false, 'el bus propio de edc27 salió rotulado como heredado');
  af(resProp.bus && resProp.bus.horarios === 'Turistar directo · sale 6 am',
     'los horarios de la cotización propia no viajan: ' + JSON.stringify(resProp.bus && resProp.bus.horarios));
  // El avión de edc27 NO tiene propia y la general está VENCIDA → sin precio.
  af(resProp.avion === null,
     'el avión de edc27 no tiene cotización propia y la general venció el 23: tenía que salir SIN PRECIO '
     + '(WhatsApp) y salió ' + JSON.stringify(resProp.avion));
  // Un evento SIN propia hereda la general, ROTULADO.
  const rHer = await admin({ accion: 'listar', evento_id: 'knotfest' });
  const resHer = rHer.d.resuelto || {};
  console.log('    knotfest bus → ' + JSON.stringify(resHer.bus));
  af(resHer.bus && resHer.bus.precio === 2500 && resHer.bus.heredado === true,
     'knotfest no tiene cotización propia: tenía que HEREDAR la general de $2,500 con heredado:true, y salió '
     + JSON.stringify(resHer.bus));
  af(resHer.bus && resHer.bus.evento_id === null,
     'la respuesta heredada tiene que decir que la fila es la GENERAL (evento_id null): ' + JSON.stringify(resHer.bus));
  af(resHer.bus && resHer.bus.horarios === 'Turistar · sale 9 pm, regresa 11 pm',
     'los horarios de la general no viajan con la herencia: ' + JSON.stringify(resHer.bus && resHer.bus.horarios));
  // 🔒 LA CONSULTA GENERAL NO PUEDE DECIR «heredado». No hay de quién heredar.
  const rGen = await admin({ accion: 'listar' });
  console.log('    general bus → ' + ver(() => rGen.d.resuelto.bus));
  af(() => rGen.d.resuelto && rGen.d.resuelto.bus && rGen.d.resuelto.bus.heredado === false,
     'la consulta GENERAL salió rotulada como heredada: la pantalla diría «hereda la general» sobre la '
     + 'general misma. ' + ver(() => rGen.d.resuelto && rGen.d.resuelto.bus));
  // 🔴 ESTA ES LA LÍNEA QUE TIRABA EL ARNÉS: leía `.bus.precio` con `.bus` en
  // null y reventaba FUERA del try de `af`, dejando [C], [G] y [R] sin medir.
  // Va como pensamiento, y su mensaje también, que es la otra mitad.
  af(() => rGen.d.resuelto.bus.precio === 2500,
     () => 'la general del bus no es $2,500: ' + ver(() => rGen.d.resuelto.bus));
  // Y el fail-soft sigue siendo POR MODO: bus con precio, avión sin.
  af(() => rGen.d.resuelto.bus && rGen.d.resuelto.avion === null,
     'el fail-soft dejó de ser POR MODO: bus vigente con avión vencido tiene que vender el bus. '
     + ver(() => rGen.d.resuelto));

  // ── [E] EL ENDPOINT PÚBLICO, por evento ───────────────────────────────
  console.log('\n[E] nube-vigente?evento=');
  const pE = await publico({ evento: 'edc27' });
  const pK = await publico({ evento: 'knotfest' });
  const pG = await publico({});
  console.log('    edc27 → ' + ver(() => pE.d.bus) + '\n    knotfest → ' + ver(() => pK.d.bus)
    + '\n    (sin evento) → ' + ver(() => pG.d.bus));
  af(() => pE.res.statusCode === 200 && pE.d.ok === true && pE.d.bus.precio === 2100 && pE.d.bus.heredado === false,
     'el endpoint público no resuelve el precio PROPIO de edc27: ' + pE.res.body.slice(0, 200));
  af(() => pK.d.bus.precio === 2500 && pK.d.bus.heredado === true,
     'el endpoint público no rotula la herencia de knotfest: ' + pK.res.body.slice(0, 200));
  af(() => pG.d.bus.precio === 2500 && pG.d.bus.heredado === false,
     'sin `?evento` el endpoint tiene que contestar la GENERAL sin rotularla heredada: ' + pG.res.body.slice(0, 200));
  af(pE.d.evento === 'edc27' && pG.d.evento === null,
     'la respuesta no dice de QUÉ evento habla, y el CDN llavea por url: sin eso nadie puede comprobar que '
     + 'la respuesta cacheada es la del evento que pidió');
  // La caché sigue siendo la misma, y eso es seguro porque la url lleva el evento.
  af(/s-maxage=600/.test(pE.res.headers['Cache-Control'] || ''),
     'el endpoint perdió su caché de CDN: esta respuesta la pide la ficha de cada evento de CDMX');
  // Y el fail-soft DURO: un tropiezo contesta 200 con los dos en null y no-store.
  SIN_TABLA = true;
  const pMal = await publico({ evento: 'edc27' });
  SIN_TABLA = false;
  console.log('    con la tabla caída → ' + pMal.res.statusCode + ' ' + JSON.stringify(pMal.d));
  af(pMal.res.statusCode === 200 && pMal.d.ok === false && pMal.d.bus === null && pMal.d.avion === null,
     'el fail-soft duro se rompió: un tropiezo tiene que dar 200 con los dos modos en null, nunca un 5xx '
     + 'seco en la página del cliente. Salió ' + pMal.res.statusCode + ' ' + pMal.res.body.slice(0, 120));
  af(/no-store/.test(pMal.res.headers['Cache-Control'] || ''),
     'el tropiezo salió cacheable: el CDN congelaría diez minutos de «no hay precio» por una caída de un segundo');

  // ── [C] COTIZAR · el evento se valida en la PUERTA ────────────────────
  console.log('\n[C] cotizar');
  // 🔴 SEGUNDA BOMBA DE RELOJERÍA, encontrada al arreglar la primera: este
  // `hasta` iba TECLEADO al 5-oct. Hoy (1-oct) pasa porque faltan cuatro días, y
  // el 6-oct TODO este bloque se volvería 400 «ya pasó» — la guarda de «nace
  // vencida» de NUBE-1 cazando al fixture en vez de al defecto. Relativa.
  const base = { accion: 'cotizar', modo: 'bus', precio_pp: 2222, vigente_hasta: dias(14) };
  const cMal = await admin(Object.assign({}, base, { evento_id: 'no-existe-este-evento' }));
  console.log('    evento inventado → ' + cMal.res.statusCode + ' ' + (cMal.d.error || '').slice(0, 60));
  af(cMal.res.statusCode === 400,
     'un slug inventado se guardó (' + cMal.res.statusCode + '): sería una fila huérfana que no rige para '
     + 'nadie, con la pantalla diciendo «ya coticé» — el éxito vacío con dinero enfrente');
  const cOk = await admin(Object.assign({}, base, { evento_id: 'edc27', horarios: 'Turistar · 6 am / 11 pm', nota: 'x' }));
  console.log('    edc27 → ' + cOk.res.statusCode + ' fila.evento_id=' + JSON.stringify(cOk.d.fila && cOk.d.fila.evento_id)
    + ' horarios=' + JSON.stringify(cOk.d.fila && cOk.d.fila.horarios));
  af(cOk.res.statusCode === 200 && cOk.d.ok === true, 'cotizar para un evento válido falló: ' + cOk.res.body.slice(0, 200));
  af(cOk.d.fila && cOk.d.fila.evento_id === 'edc27', 'la fila no se guardó con su evento: ' + JSON.stringify(cOk.d.fila));
  af(cOk.d.fila && cOk.d.fila.horarios === 'Turistar · 6 am / 11 pm', 'los horarios no se guardaron: ' + JSON.stringify(cOk.d.fila));
  const cGen = await admin(Object.assign({}, base, { horarios: 'general' }));
  af(cGen.res.statusCode === 200 && cGen.d.fila && cGen.d.fila.evento_id === null,
     'la cotización GENERAL (sin evento_id) tiene que guardarse con evento_id NULL: ' + JSON.stringify(cGen.d.fila));
  // Las guardas de NUBE-1 siguen en pie: nace vencida, al revés, precio cero.
  // Un `hasta` en el PASADO a propósito —relativo, para que siga siendo «hace un
  // mes» y no una fecha que un día significó eso.
  const cVenc = await admin(Object.assign({}, base, { evento_id: 'edc27', vigente_hasta: dias(-30) }));
  af(cVenc.res.statusCode === 400 && /ya pas/i.test(cVenc.d.error || ''),
     'la guarda de «nace vencida» se perdió al meter el evento: ' + cVenc.res.body.slice(0, 160));
  const cCero = await admin(Object.assign({}, base, { evento_id: 'edc27', precio_pp: 0 }));
  af(cCero.res.statusCode === 400, 'un precio 0 pasó: sería un transporte gratis publicado al sitio');

  // ── [G] EL HISTORIAL, por evento y con la herencia rotulada ───────────
  console.log('\n[G] historial por evento');
  const hProp = await admin({ accion: 'historial', dia: diaDe(0), evento_id: 'edc27' });
  const hHer = await admin({ accion: 'historial', dia: diaDe(0), evento_id: 'knotfest' });
  // ANTES DEL NACIMIENTO: la general del bus arranca hace 2 días, así que hace 6
  // no había nada — ni propio ni general.
  const hAntes = await admin({ accion: 'historial', dia: diaDe(-6), evento_id: 'knotfest' });
  const mB = (r) => seg(() => r.d.modos.bus, {});
  console.log('    edc27 hoy → ' + ver(() => mB(hProp).estado) + '/' + ver(() => (mB(hProp).fila || {}).precio)
    + ' heredado=' + ver(() => mB(hProp).heredado));
  console.log('    knotfest hoy → ' + ver(() => mB(hHer).estado) + '/' + ver(() => (mB(hHer).fila || {}).precio)
    + ' heredado=' + ver(() => mB(hHer).heredado));
  console.log('    knotfest hace 6 d → ' + ver(() => mB(hAntes).estado)
    + ' general=' + ver(() => mB(hAntes).general) + ' heredado=' + ver(() => mB(hAntes).heredado));
  af(() => mB(hProp).estado === 'vigente' && mB(hProp).fila.precio === 2100 && mB(hProp).heredado === false,
     () => 'el historial de edc27 no da SU precio: ' + ver(() => mB(hProp)));
  af(() => mB(hHer).estado === 'vigente' && mB(hHer).fila.precio === 2500 && mB(hHer).heredado === true,
     () => '🔒 el historial de un evento sin cotización propia tiene que contestar la GENERAL con heredado:true. '
     + 'Decir «sin datos» sería FALSO: ese día SÍ hubo un precio. ' + ver(() => mB(hHer)));
  // 🔒 LOS ESTADOS SE EXIGEN POR **NOMBRE**, no por «distinto de vigente». La
  // aserción vieja decía `estado !== 'vigente'` y eso lo cumplen TRES estados
  // distintos (`sin_datos`, `antes_del_nacimiento`, `vencida`): un «no es A» no
  // distingue entre B, C y D, y aquí cada uno le dice otra cosa al humano.
  af(() => mB(hAntes).estado === 'sin_datos' && mB(hAntes).general === 'antes_del_nacimiento'
        && mB(hAntes).heredado === false,
     () => 'hace 6 días no había NADA (la general del bus arranca hace 2): knotfest no tiene filas propias, '
     + 'así que su estado es `sin_datos` y la general tiene que venir como `antes_del_nacimiento` — es lo que '
     + 'EXPLICA por qué la herencia no salvó el día. Y no se rotula heredado. ' + ver(() => mB(hAntes)));
  af(hProp.d.evento_id === 'edc27', 'la respuesta del historial no dice de qué evento habla');

  // 🔒 EL TERCER ESTADO: **VENCIDA**, con su propia fila y por su nombre. `g2`
  // (la general del avión) murió ayer a propósito, así que hoy el historial del
  // avión tiene que decir `vencida` Y entregar la fila que murió — «vencida» sin
  // decir cuál era el precio no sirve para explicarle nada a nadie.
  const hAvion = await admin({ accion: 'historial', dia: diaDe(0) });
  const mA = seg(() => hAvion.d.modos.avion, {});
  console.log('    avión general hoy → ' + ver(() => mA.estado) + '/' + ver(() => (mA.fila || {}).precio));
  af(() => mA.estado === 'vencida' && mA.fila && mA.fila.precio === 4800,
     () => 'el estado `vencida` no se mide: `g2` murió ayer A PROPÓSITO y el historial del avión de hoy '
     + 'tenía que decir `vencida` con su fila de $4,800. De los TRES estados de `regiaEl`, éste es el que se '
     + 'quedaría sin fila si todo el padrón fuera vigente. Salió ' + ver(() => mA));

  // ── [R] EL CANDADO RE-FORMADO · UN dueño, CUATRO bebedores ────────────
  // 🔴 El de NUBE-3 exigía `_lib/nube.js` byte a byte. Aquí el dueño cambia DE
  // VERDAD, así que el candado se re-forma a lo que de verdad protege: que
  // NADIE resuelva la herencia por su cuenta. Cuatro copias que hoy coinciden
  // son cuatro respuestas esperando a divergir — y la pregunta es un precio.
  console.log('\n[R] el candado re-formado · un dueño, cuatro bebedores');
  const sinCom = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const leer = (dir, f) => sinCom(fs.readFileSync(path.join(dir, f), 'utf8'));
  const BEBEDORES = [
    ['netlify/functions/nube-vigente.js', 'el endpoint público'],
    ['netlify/functions/admin-nube.js', 'la pluma y el historial'],
  ];
  for (const [f, quien] of BEBEDORES) {
    const t = leer(h.dir, f);
    af(/require\('\.\/_lib\/nube'\)|require\('\.\.\/_lib\/nube'\)/.test(t),
       quien + ' (' + f + ') dejó de pedirle al dueño');
    // Ningún bebedor puede tener su PROPIA cascada de herencia.
    af(!/evento_id=is\.null/.test(t),
       '🔴 ' + quien + ' arma su propio filtro `evento_id=is.null`: eso es resolver la herencia por su '
       + 'cuenta, al lado del dueño. La consulta de la general vive en `filasDe`, y en un solo sitio');
    af(!/heredado\s*[:=]\s*(true|false)/.test(t.replace(/heredado === (true|false)/g, '')),
       '🔴 ' + quien + ' DECIDE el `heredado` en vez de recibirlo: el rótulo es parte de la respuesta del '
       + 'dueño, y calcularlo aquí lo vuelve una segunda opinión sobre de quién es el precio');
  }
  // Y los dos del navegador consumen el dato por su endpoint, sin re-resolver.
  for (const [f, quien] of [['kamehouse-nube.js', 'la pluma'], ['kamehouse-radar.js', 'el Radar']]) {
    const t = leer(h.dir, f);
    af(!/evento_id\s*=?=\s*null\s*\?\s*[^:]*:\s*[^;]*precio/.test(t) && !/is\.null/.test(t),
       '🔴 ' + quien + ' resuelve la herencia en el navegador: pide y pinta, no decide');
  }
  // 🔒 UN SOLO SITIO ESCRIBE LA CASCADA. Se cuenta el HECHO en el lib.
  const libTxt = leer(h.dir, 'netlify/functions/_lib/nube.js');
  const cascadas = (libTxt.match(/heredado:\s*(true|eventoId != null)/g) || []).length;
  console.log('    la cascada se escribe en ' + cascadas + ' sitio(s) del dueño (resolver + regiaEl)');
  af(cascadas >= 2 && cascadas <= 4,
     'la cascada de herencia aparece ' + cascadas + ' veces en el dueño. Son DOS preguntas («cuál rige '
     + 'ahora» y «cuál regía el día X») y cada una la contesta una vez: más que eso es una copia');
  // La nota del candado viejo tiene que estar ESCRITA en el careo de NUBE-3.
  const n3 = fs.readFileSync(path.join(h.dir, 'scripts/mide-nube-3.js'), 'utf8');
  af(/NUBE-4/.test(n3),
     '🔴 el careo de NUBE-3 sigue exigiendo `_lib/nube.js` byte a byte SIN decir que NUBE-4 lo cambió a '
     + 'propósito. Un candado que caduca sin su razón escrita manda a buscar un defecto que no existe — y '
     + 'peor: alguien lo «arregla» revirtiendo esta tuerca');

  // ── [P] LA MUDANZA DEL NAV · sin estrenar permiso ─────────────────────
  console.log('\n[P] la mudanza al listado principal');
  const htmlH = fs.readFileSync(path.join(h.dir, 'kamehouse.html'), 'utf8');
  const htmlB = fs.readFileSync(path.join(b.dir, 'kamehouse.html'), 'utf8');
  // El instrumento se valida con un caso conocido ANTES de creerle la ausencia.
  const esNavBtn = (html, id) => new RegExp('class="nav-btn"[^>]*id="' + id + '"|id="' + id + '"[^>]*class="nav-btn"').test(html)
    || new RegExp('<button class="nav-btn"[^>]*id="' + id + '"').test(html);
  const enDropdown = (html, id) => new RegExp('class="nav-dropdown-item"[^>]*id="' + id + '"').test(html);
  af(esNavBtn(htmlH, 'nav-esferas') && esNavBtn(htmlB, 'nav-esferas'),
     'el instrumento no reconoce a `nav-esferas` como botón del listado principal: sin validarlo, su '
     + '«ausencia» sobre nav-nube no diría nada');
  af(enDropdown(htmlB, 'nav-nube'), 'en BASE la Nube tenía que estar en el desplegable: si no, no hay mudanza que medir');
  af(esNavBtn(htmlH, 'nav-nube'), 'la Nube no quedó como botón del listado principal (`nav-btn`) en HEAD');
  af(!enDropdown(htmlH, 'nav-nube'), 'la Nube sigue ADEMÁS en el desplegable: dos puertas al mismo sitio');
  af(/showPage\('nube'\)/.test(htmlH) && !/showHerramienta\('nube'\)/.test(htmlH),
     'el botón sigue llamando a `showHerramienta(\'nube\')`, que ya no la carga: la pantalla saldría VACÍA');
  // Y queda JUNTO a Esferas, que es lo que pidió la orden.
  const iEsf = htmlH.indexOf('id="nav-esferas"'), iNub = htmlH.indexOf('id="nav-nube"');
  af(iEsf > 0 && iNub > iEsf && (iNub - iEsf) < 1400,
     'la Nube no quedó junto a Esferas del Dragón en el menú (distancia ' + (iNub - iEsf) + ' bytes)');
  // 🔒 NO SE ESTRENÓ PERMISO: el bloque de PERMISOS_TABS es el MISMO.
  const permis = (txt) => {
    const i = txt.indexOf('const PERMISOS_TABS = {');
    const j = txt.indexOf('};', i);
    return txt.slice(i, j + 2);
  };
  const pB = permis(fs.readFileSync(path.join(b.dir, 'kamehouse.js'), 'utf8'));
  const pH = permis(fs.readFileSync(path.join(h.dir, 'kamehouse.js'), 'utf8'));
  af(pB && pH && pB === pH,
     '🔴 esta tuerca TOCÓ PERMISOS_TABS y no debía: `nube` ya estaba concedido a roshi, bulma y milk desde '
     + 'NUBE-1, y mudar un botón no reparte privilegios. ' + pB.length + ' vs ' + pH.length + ' bytes');
  const rolesConNube = ['maestro_roshi', 'bulma', 'milk'].filter((r) => new RegExp(r + ":\\s*\\[[^\\]]*'nube'").test(pH));
  console.log('    roles con `nube`: ' + JSON.stringify(rolesConNube) + ' · PERMISOS_TABS idéntico: ' + (pB === pH));
  af(rolesConNube.length === 3, 'bulma o milk perdieron el permiso `nube`: ' + JSON.stringify(rolesConNube));
  // El barrido del menú DERIVA su lista de `[id^="page-"]` + `nav-<id>`, así que
  // la mudanza no le cambia nada. Se afirma que las dos piezas siguen ahí.
  af(/id="page-nube"/.test(htmlH) && /id="nav-nube"/.test(htmlH),
     'el barrido de permisos deriva de `page-<x>` + `nav-<x>`: si falta una, el botón nace CERRADO');
  // ⚠️ Y LA CONSECUENCIA MEDIDA: a bulma y milk se les apaga el desplegable de
  // Herramientas, porque la Nube era la única que tenían. Es correcto y va DICHO.
  const itemsDrop = (htmlH.match(/class="nav-dropdown-item"[^>]*id="nav-([a-z_]+)"/g) || [])
    .map((x) => /id="nav-([a-z_]+)"/.exec(x)[1]);
  console.log('    herramientas que quedan en el desplegable: ' + JSON.stringify(itemsDrop));
  const bulmaTabs = (/bulma:\s*\[([^\]]*)\]/.exec(pH) || ['', ''])[1];
  const bulmaHerr = itemsDrop.filter((i) => new RegExp("'" + i + "'").test(bulmaTabs));
  af(itemsDrop.length >= 3, 'el desplegable quedó con ' + itemsDrop.length + ' herramientas: ¿se cayó algo más?');
  af(bulmaHerr.length === 0,
     'PREMISA DE LA NOTA: se documentó que a bulma se le apaga el desplegable porque la Nube era su única '
     + 'herramienta, y resulta que le quedan ' + JSON.stringify(bulmaHerr) + '. La nota del código está mal');

  // ── [B] CONTROL POSITIVO · BASE no tiene nada de esto ─────────────────
  console.log('\n[B] control positivo · BASE');
  const libB = leer(b.dir, 'netlify/functions/_lib/nube.js');
  af(!/evento_id/.test(libB), 'BASE ya conocía `evento_id`: la tuerca no prueba nada. ');
  af(!/horarios/.test(libB), 'BASE ya conocía `horarios`');
  af(!/'eventos'/.test(leer(b.dir, 'netlify/functions/admin-nube.js')), 'BASE ya tenía la acción `eventos`');
  af(!/nube-evento/.test(htmlB), 'BASE ya tenía el selector de evento');
  // Y el par: BASE no puede contestar por evento.
  armarRed(b.dir); limpiar(b.dir);
  let errB = null;
  try {
    const modB = require(path.join(b.dir, 'netlify/functions/admin-nube.js'));
    const rB = await modB.handler({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify({ accion: 'listar', evento_id: 'edc27' }) });
    errB = JSON.parse(rB.body || '{}');
  } catch (e) { errB = { __excepcion: e.message }; }
  console.log('    BASE listar con evento_id → ' + JSON.stringify(errB).slice(0, 140));
  af(errB && (errB.__excepcion || !errB.resuelto),
     'BASE contestó una resolución por evento: entonces esta tuerca no aporta la herencia. ' + JSON.stringify(errB).slice(0, 200));

  // ── [V] EL SQL · el acta dice lo que la base contesta ─────────────────
  console.log('\n[V] la migración');
  const sql = fs.readFileSync(path.join(h.dir, 'migraciones/NUBE-4.sql'), 'utf8');
  // 🔒 LOS COMENTARIOS FUERA ANTES DE ASERTAR AUSENCIA. Mi primera versión de
  // la aserción de abajo se puso ROJA cazando la palabra «UPDATE» **del propio
  // acta**, que explica que el trigger cubre UPDATE y DELETE. Es la aserción de
  // ausencia que se caza sola, y ya van cinco: el comentario que explica por
  // qué X no está CONTIENE X.
  const sqlCodigo = sql.replace(/--[^\n]*/g, '');
  af(/add column if not exists evento_id text null/i.test(sqlCodigo), 'el SQL no agrega `evento_id text null`');
  af(/add column if not exists horarios\s+text null/i.test(sqlCodigo), 'el SQL no agrega `horarios text`');
  // Lo que NO puede hacer: tocar filas ni re-crear la tabla. Un índice sí — la
  // consulta del dueño filtra por (modo, evento_id) y sin él cada card de un
  // evento hace un scan de la tabla entera.
  af(!/\b(create|drop)\s+table\b|\bdelete\s+from\b|\bupdate\s+\w+\s+set\b|\binsert\s+into\b/i.test(sqlCodigo),
     'el SQL toca FILAS o re-crea la tabla: es INSERT-only y su historial ES el dato. Solo puede agregar '
     + 'columnas (y su índice).');
  af(/create index/i.test(sqlCodigo),
     'falta el índice por (modo, evento_id, vigencia): sin él, resolver el card de cada evento de CDMX '
     + 'escanea la tabla completa, y son 18 eventos vivos por visita');
  af(/UPDATE DELETE|UPDATE y DELETE|UPDATE\b[\s\S]{0,40}DELETE/i.test(sql),
     'el acta no dice que el trigger cubre UPDATE y DELETE (y NO INSERT): un acta que no reproduce lo que '
     + 'la base contesta manda a buscar un hueco que no existe');

  // ══ [Z] CONTROL DEL INSTRUMENTO · ¿el arnés SÍ nota el reloj? ══════════
  // 🔴 LA PREGUNTA QUE VUELVE PELIGROSO ESTE ARREGLO: unas fechas relativas
  // pueden ARREGLAR la medición o pueden TAPARLA. Si el padrón se mueve siempre
  // con el reloj, un arnés que ya no mira la vigencia saldría verde para siempre
  // — verde por no estar midiendo, que es el peor verde de todos.
  // Así que se corre el MISMO escenario con el padrón 40 días atrás (todo vencido)
  // y se EXIGE que la respuesta cambie. Si no cambiara, estas fechas relativas
  // habrían tapado el hoyo en vez de cerrarlo.
  console.log('\n[Z] control del instrumento · el padrón 40 días atrás');
  {
    const guardado = FILAS;
    try {
      FILAS = armarFilas(-40);
      const rViejo = await admin({ accion: 'listar', evento_id: 'edc27' });
      const rVGen = await admin({ accion: 'listar' });
      console.log('    edc27 bus → ' + ver(() => rViejo.d.resuelto.bus)
        + '   ·   general bus → ' + ver(() => rVGen.d.resuelto.bus));
      af(() => rViejo.d.resuelto && rViejo.d.resuelto.bus === null,
         () => '🔴 CONTROL DEL INSTRUMENTO: con TODO el padrón vencido, edc27 siguió vendiendo un bus. '
         + 'Entonces el arnés ya no mira la vigencia y las fechas relativas TAPARON la medición en vez de '
         + 'arreglarla: todo lo de arriba sería verde por no estar midiendo. Salió '
         + ver(() => rViejo.d.resuelto.bus));
      af(() => rVGen.d.resuelto && rVGen.d.resuelto.bus === null && rVGen.d.resuelto.avion === null,
         () => '🔴 CONTROL DEL INSTRUMENTO: con todo vencido la general tampoco puede regir: '
         + ver(() => rVGen.d.resuelto));
      // Y el historial de hoy, con todo muerto, tiene que decir `vencida` — no
      // `sin_datos`: las filas EXISTEN, lo que pasó es que murieron.
      const hV = await admin({ accion: 'historial', dia: diaDe(0) });
      const mV = seg(() => hV.d.modos.bus, {});
      console.log('    historial de hoy → ' + ver(() => mV.estado) + '/' + ver(() => (mV.fila || {}).precio));
      af(() => mV.estado === 'vencida' && mV.fila && mV.fila.precio === 2500,
         () => 'con todo vencido el historial de hoy tenía que decir `vencida` con la fila que murió, no '
         + '`sin_datos`: las filas EXISTEN, solo que ya no rigen. Salió ' + ver(() => mV));
    } finally {
      // 🔒 El padrón se RESTAURA: un escenario que deja el mundo tocado hace que
      // el ORDEN de las corridas decida el resultado.
      FILAS = guardado;
    }
  }
  // ✅ Y la vuelta: restaurado, el mundo vuelve a regir. Sin esto, el `finally`
  // podría no haber servido de nada y nadie se enteraría.
  {
    const rOtra = await admin({ accion: 'listar', evento_id: 'edc27' });
    af(() => rOtra.d.resuelto.bus.precio === 2100,
       () => 'el padrón no quedó restaurado tras el control del instrumento: lo que midan otros bloques '
       + 'dependería del ORDEN. Salió ' + ver(() => rOtra.d.resuelto.bus));
  }

  completo = true;
  process.exitCode = rojo ? 1 : 0;
})();
