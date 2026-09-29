#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-dispo-norm-1.js — DISPO-NORM-1 · LA PUERTA DE ZONAS
//
// Firmado por Memo (28-sep-2026): opción A — la zona capturada se valida
// contra la FICHA al nacer. Desconocida se rechaza nombrando las de la ficha;
// mal escrita se guarda con la ortografía canónica; catálogo ilegible pasa
// tal cual Y SE DICE.
//
// Lo que costó no tenerla, dos veces el mismo día (28-sep):
//   · madrugada: 4 filas de stock_ajustes restaban de llaves fantasma
//     (ultramexico anunciaba 18 Generales teniendo 16);
//   · tarde: el careo del Excel propuso DESHACER esa alineación — crear
//     «GENERAL» y poner en cero «General» — porque el montón `fuera`
//     emparejaba por cadena exacta.
//
// 🔒 LOS DOS LADOS SON COMMITS (`git archive`); BASE anclado a su sha, no a
//    `origin/main` (la caducidad de LAND-2c).
// 🔒 SE ENTRA POR LOS HANDLERS REALES con la red falsa que respeta filtros;
//    el catálogo es el REAL del árbol (el mismo index que sirve el sitio).
// 🔒 EL CONTROL POSITIVO ES BASE: acepta «GENERAL» y produce el par
//    envenenado. Si BASE dejara de fallar, este careo caducó — se re-lee.
//
// Se corre:  npm run mide:dispo-norm-1
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
  fallos.slice(0, 20).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
// BASE = el main de antes de esta tuerca. HEAD = el commit del MERGE.
// 🔒 Re-anclado tras mergear (la ley del ancla: commitear exige RE-ANCLAR;
// dejarlo en 'HEAD' habría hecho que la siguiente tuerca reviente aserciones
// ajenas — o peor, que un rojo futuro se lea como suyo).
const BASE = process.env.BASE || '5963e21';
const HEAD_SHA = process.env.HEAD_SHA || '6ca49aa';

// ── LA RED FALSA · respeta filtros, guarda estado, CAPTURA CUERPOS ─────────
// Los nombres de tabla y columna están LEÍDOS de los handlers, no recordados.
function armarRed(dir, db) {
  const escrituras = [];
  const SB = 'https://kh.test';
  const INDEX = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
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
      if ((m = /^not\.ilike\.(.*)$/.exec(expr))) { continue; }
      throw new Error('la red falsa no entiende el filtro: ' + campo + '=' + expr);
    }
    return out;
  };
  const fetchFalso = async (url, opts) => {
    const met = (opts && opts.method) || 'GET';
    const su = String(url);
    if (/\/index\.html$/.test(su)) {
      return { ok: true, status: 200, text: async () => INDEX, json: async () => ({}) };
    }
    if (su.startsWith(SB)) {
      const u = new URL(su);
      const tabla = u.pathname.replace('/rest/v1/', '');
      if (met === 'GET') {
        const filas = filtrar(db[tabla] || [], u.searchParams);
        return { ok: true, status: 200, json: async () => filas, text: async () => JSON.stringify(filas) };
      }
      const cuerpo = opts && opts.body ? JSON.parse(opts.body) : {};
      escrituras.push({ tabla, met, cuerpo, url: su });
      if (met === 'POST') {
        const fila = Array.isArray(cuerpo) ? cuerpo : [{ id: 'nuevo-' + escrituras.length, ...cuerpo }];
        return { ok: true, status: 201, json: async () => (Array.isArray(cuerpo) ? fila : [fila[0]]), text: async () => '' };
      }
      // PATCH/DELETE: contesta las filas que casarían el filtro (representación).
      const filas = filtrar(db[tabla] || [], u.searchParams).map((f) => ({ ...f, ...(Array.isArray(cuerpo) ? {} : cuerpo) }));
      return { ok: true, status: 200, json: async () => filas, text: async () => JSON.stringify(filas) };
    }
    throw new Error('la red falsa no conoce ese destino: ' + su);
  };
  return { escrituras, fetchFalso };
}

function prepararArbol(dir) {
  process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.test';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  process.env.PORTAL_SUPABASE_URL = 'https://portal.test';
  process.env.PORTAL_SUPABASE_SERVICE_KEY = 'p';
  process.env.URL = 'https://sitio.test';
  delete process.env.DEPLOY_PRIME_URL;
  // El portero se releva en el arnés (la sesión no es el sujeto de esta tuerca).
  const va = require.resolve(path.join(dir, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    // `rol` LEÍDO del handler (jwtRol = auth.user.rol), no recordado: sin él,
    // viajero_migrar contesta 403 y el careo mediría el portero, no la puerta.
    verifyAdminAuthLive: async (ev, roles) => ({ valid: true, roles, user: { id: 'u1', correo: 'bulma@x', rol: 'maestro_roshi' } }),
  } };
  // 🔒 catalogo-index CACHEA 10 min: sin el borrado, un escenario le regala el
  // catálogo al siguiente y el orden de las corridas decide el resultado.
  for (const f of ['admin-compras.js', 'admin-coordi-asignaciones.js',
                   '_lib/zona-ficha.js', '_lib/catalogo-index.js', '_lib/excel-aplicar.js',
                   '_lib/excel-careo.js', '_lib/normalizar-zona.js', '_lib/precio-zona.js',
                   '_lib/disponibilidad.js', '_lib/paquete-viaje.js', '_lib/cuenta-evento.js']) {
    try { delete require.cache[require.resolve(path.join(dir, 'netlify/functions', f))]; } catch (_) {}
  }
}
const evPost = (accion, body) => ({
  httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
  body: JSON.stringify({ accion, ...body }),
});

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'dn-base'), h = sacar(HEAD_SHA, 'dn-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }

  // ══ [U] EL DUEÑO NUEVO, unidad por unidad ═══════════════════════════════
  console.log('[U] zona-ficha · el veredicto');
  prepararArbol(h.dir);
  const zf = require(path.join(h.dir, 'netlify/functions/_lib/zona-ficha.js'));
  const evFalso = {
    zonas: [{ n: 'General', p: 1 }, { n: 'General Viernes', p: 1 }, { n: 'VIP', p: 1 }],
    cheapZonas: [{ n: 'VIP Plus', p: 1 }],
    multifecha: [{ zonas: [{ n: 'Palco Norte', p: 1 }] }, null],
  };
  const cans = zf.zonasCanonicasDe(evFalso);
  af(JSON.stringify(cans) === JSON.stringify(['General', 'General Viernes', 'VIP', 'VIP Plus', 'Palco Norte']),
     'el universo es global + cheap + multifecha, sin repetir: ' + JSON.stringify(cans));
  af(zf.resolverZonaFicha(cans, 'General').estado === 'exacta', 'la exacta pasa tal cual');
  const c1 = zf.resolverZonaFicha(cans, 'GENERAL');
  af(c1.estado === 'canonizada' && c1.zona === 'General', '«GENERAL» se canoniza a «General»: ' + JSON.stringify(c1));
  const c2 = zf.resolverZonaFicha(cans, 'general   viernes');
  af(c2.estado === 'canonizada' && c2.zona === 'General Viernes', 'espacios y minúsculas se canonizan: ' + JSON.stringify(c2));
  const c3 = zf.resolverZonaFicha(cans, 'Vip Plus');
  af(c3.estado === 'canonizada' && c3.zona === 'VIP Plus', 'las cheapZonas también son ficha');
  // ⚠️ Lo que NO se funde: parecido no es igual.
  af(zf.resolverZonaFicha(cans, 'General Sabado').estado === 'desconocida', '«General Sabado» NO casa con «General» ni con «General Viernes»');
  af(zf.resolverZonaFicha(cans, 'VIP Oro').estado === 'desconocida', '«VIP Oro» no casa con «VIP» ni con «VIP Plus»');
  af(zf.resolverZonaFicha(cans, '-').estado === 'desconocida', 'la llave basura «-» es desconocida (el escritor decide)');
  const cAc = zf.resolverZonaFicha(['Retráctil Oro'], 'Retractil Oro');
  af(cAc.estado === 'canonizada' && cAc.zona === 'Retráctil Oro', 'el acento se canoniza por rango NFD (el caso frontera#1)');

  // ══ [C] VIGILANTE VIVO · el catálogo del ÁRBOL DE TRABAJO ═══════════════
  // La puerta canoniza dentro de UNA ficha: si una ficha tuviera dos zonas
  // distintas que normalizadas coincidan, canonizar las FUNDIRÍA. Es el mismo
  // vigilante de ZONA-NORM-1, ahora con el universo de la puerta (global +
  // cheap + multifecha por evento).
  console.log('[C] vigilante vivo · cero colisiones normalizadas por ficha');
  {
    const ci = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
    const nz = require(path.join(RAIZ, 'netlify/functions/_lib/normalizar-zona.js')).normalizarZona;
    const zfv = require(path.join(RAIZ, 'netlify/functions/_lib/zona-ficha.js'));
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const EV = ci._parseEV(html);
    af(Array.isArray(EV) && EV.length > 100, 'el catálogo del árbol parsea (' + (EV && EV.length) + ' eventos)');
    let zonasTot = 0; const choques = [];
    for (const e of (EV || [])) {
      const lista = zfv.zonasCanonicasDe(e);
      zonasTot += lista.length;
      const porNorm = new Map();
      for (const z of lista) {
        const k = nz(z);
        if (porNorm.has(k)) choques.push(e.id + ': «' + porNorm.get(k) + '» / «' + z + '»');
        else porNorm.set(k, z);
      }
    }
    console.log('    ' + (EV || []).length + ' fichas · ' + zonasTot + ' zonas en el universo de la puerta');
    // ⚠️ El universo de la PUERTA es por ficha SIN repetir (875 el 28-sep);
    // el 2 302 de ZONA-NORM-1 contaba por LISTA (una zona en 3 fechas = 3).
    // Son dos preguntas distintas — la lección de los dos barridos de Jane.
    af(zonasTot > 500, 'el barrido midió de verdad (cardinalidad): ' + zonasTot);
    af(choques.length === 0, 'CERO colisiones normalizadas dentro de una ficha: ' + choques.join(' · '));
    // 🔒 Control positivo del instrumento: se siembra el par y se exige cazarlo.
    const evTrampa = { id: 'trampa', zonas: [{ n: 'Vip', p: 1 }, { n: 'VIP', p: 1 }] };
    const listaT = zfv.zonasCanonicasDe(evTrampa);
    const normT = new Set(listaT.map(nz));
    af(listaT.length === 2 && normT.size === 1, 'el instrumento SÍ ve un choque sembrado («Vip»/«VIP»)');
  }

  // ══ [1] admin-compras · crear, por la puerta (HEAD) ═════════════════════
  console.log('[1] compras crear · HEAD');
  {
    prepararArbol(h.dir);
    const red = armarRed(h.dir, { proveedores: [{ id: '11111111-1111-1111-1111-111111111111', nombre: 'Prov' }] });
    global.fetch = red.fetchFalso;
    const mod = require(path.join(h.dir, 'netlify/functions/admin-compras.js'));
    const base = { evento_id: 'ultramexico', cantidad: 5, costo_unitario: 100, proveedor_id: '11111111-1111-1111-1111-111111111111', fecha: '2026-09-28' };
    // canonizada
    const r1 = await mod.handler(evPost('crear', { ...base, zona: 'GENERAL' }));
    const d1 = JSON.parse(r1.body);
    const ins1 = red.escrituras.find((x) => x.tabla === 'compras' && x.met === 'POST');
    af(r1.statusCode === 200 && ins1 && ins1.cuerpo.zona === 'General',
       'compras: «GENERAL» se guarda como «General» (ficha): ' + JSON.stringify(ins1 && ins1.cuerpo.zona));
    af(typeof d1.zona_aviso === 'string' && /GENERAL.*General/.test(d1.zona_aviso), 'y la corrección SE DICE en la respuesta');
    // desconocida → rechazo nombrando la ficha, SIN escribir
    const antes = red.escrituras.length;
    const r2 = await mod.handler(evPost('crear', { ...base, zona: 'Zona Inventada' }));
    af(r2.statusCode === 400 && /no existe en la ficha/.test(JSON.parse(r2.body).error || ''),
       'compras: la zona inventada se RECHAZA diciendo por qué: ' + r2.body.slice(0, 120));
    af(/General/.test(JSON.parse(r2.body).error || ''), 'y el rechazo NOMBRA las zonas de la ficha');
    af(red.escrituras.length === antes, 'el rechazo no escribió NADA');
    // exacta → intacta y sin aviso
    const r3 = await mod.handler(evPost('crear', { ...base, zona: 'General' }));
    const ins3 = red.escrituras.filter((x) => x.tabla === 'compras' && x.met === 'POST')[1];
    af(r3.statusCode === 200 && ins3 && ins3.cuerpo.zona === 'General' && JSON.parse(r3.body).zona_aviso == null,
       'compras: la exacta pasa tal cual, sin aviso');
  }

  // ══ [2] admin-compras · BASE acepta el defecto (control positivo) ═══════
  console.log('[2] compras crear · BASE (el defecto que HEAD cierra)');
  {
    prepararArbol(b.dir);
    const red = armarRed(b.dir, { proveedores: [{ id: '11111111-1111-1111-1111-111111111111', nombre: 'Prov' }] });
    global.fetch = red.fetchFalso;
    const mod = require(path.join(b.dir, 'netlify/functions/admin-compras.js'));
    const r = await mod.handler(evPost('crear', { evento_id: 'ultramexico', zona: 'GENERAL', cantidad: 5, costo_unitario: 100, proveedor_id: '11111111-1111-1111-1111-111111111111', fecha: '2026-09-28' }));
    const ins = red.escrituras.find((x) => x.tabla === 'compras' && x.met === 'POST');
    af(r.statusCode === 200 && ins && ins.cuerpo.zona === 'GENERAL',
       'BASE aceptaba «GENERAL» tal cual — el hoyo que la puerta cierra: ' + JSON.stringify(ins && ins.cuerpo.zona));
  }

  // ══ [3] ajuste_guardar · la holgura de las llaves viejas (HEAD) ═════════
  console.log('[3] vendidos_fuera · HEAD');
  {
    prepararArbol(h.dir);
    const db = { stock_ajustes: [
      { id: 'a1', evento_id: 'ultramexico', zona: 'General', vendidos_fuera: 2 },
      { id: 'a2', evento_id: 'ultramexico', zona: '-', vendidos_fuera: 1 },
    ], usuarios: [{ id: 'u1', nombre: 'Bulma' }] };
    const red = armarRed(h.dir, db);
    global.fetch = red.fetchFalso;
    const mod = require(path.join(h.dir, 'netlify/functions/admin-compras.js'));
    // «GENERAL» tecleado → PATCH sobre la fila CANÓNICA, no una fila nueva
    const r1 = await mod.handler(evPost('ajuste_guardar', { evento_id: 'ultramexico', zona: 'GENERAL', vendidos_fuera: 3 }));
    const w1 = red.escrituras[red.escrituras.length - 1];
    af(r1.statusCode === 200 && w1 && w1.met === 'PATCH' && /zona=eq\.General(&|$)/.test(decodeURIComponent(w1.url)),
       'ajuste: «GENERAL» edita la fila «General» (PATCH, no INSERT fantasma): ' + (w1 && decodeURIComponent(w1.url)));
    af(/GENERAL.*General/.test(JSON.parse(r1.body).zona_aviso || ''), 'y lo dice');
    // la llave vieja «-» SIGUE editable (existe): la puerta no cierra lo que ya hay
    const r2 = await mod.handler(evPost('ajuste_guardar', { evento_id: 'ultramexico', zona: '-', vendidos_fuera: 0 }));
    const w2 = red.escrituras[red.escrituras.length - 1];
    af(r2.statusCode === 200 && w2.met === 'PATCH', 'la llave vieja «-» se puede seguir corrigiendo');
    // una desconocida SIN fila NO nace
    const antes = red.escrituras.length;
    const r3 = await mod.handler(evPost('ajuste_guardar', { evento_id: 'ultramexico', zona: 'Zona Fantasma', vendidos_fuera: 1 }));
    af(r3.statusCode === 400 && red.escrituras.length === antes,
       'una llave fantasma nueva NO nace: ' + r3.body.slice(0, 100));
  }

  // ══ [4] viajero_migrar · la zona del boleto por la puerta ═══════════════
  console.log('[4] viajero_migrar · HEAD y BASE');
  {
    prepararArbol(h.dir);
    // `eventos_meta` LEÍDO del handler: el candado de «el evento existe» se
    // pregunta ahí por slug, y sin la fila el careo mediría ese candado ajeno.
    const red = armarRed(h.dir, { viajeros_evento: [], stock_ajustes: [], usuarios: [], eventos_meta: [{ slug: 'ultramexico' }] });
    global.fetch = red.fetchFalso;
    const mod = require(path.join(h.dir, 'netlify/functions/admin-coordi-asignaciones.js'));
    const cuerpo = { evento_id: 'ultramexico', nombre: 'Prueba Puerta', tipo_paquete: 'cheap', total_contrato: 1000 };
    // desconocida → 400 sin escribir
    const r1 = await mod.handler(evPost('viajero_migrar', { ...cuerpo, zona_boleto: 'Zona Marciana' }));
    af(r1.statusCode === 400 && /no existe en la ficha/.test(JSON.parse(r1.body).error || '') && red.escrituras.length === 0,
       'migrar: la zona inventada se rechaza ANTES de escribir: ' + r1.body.slice(0, 110));
    // canonizada → el INSERT lleva la ortografía de la ficha
    const r2 = await mod.handler(evPost('viajero_migrar', { ...cuerpo, zona_boleto: 'GENERAL' }));
    const insV = red.escrituras.find((x) => x.tabla === 'viajeros_evento' && x.met === 'POST');
    af(r2.statusCode === 200 && insV && insV.cuerpo.zona_boleto === 'General',
       'migrar: «GENERAL» nace como «General»: ' + JSON.stringify(insV && insV.cuerpo.zona_boleto) + ' · ' + r2.body.slice(0, 90));
    af(/GENERAL.*General/.test(JSON.parse(r2.body || '{}').zona_aviso || ''), 'y la respuesta lo dice');
    // BASE: aceptaba la inventada Y la mal escrita — el par de este candado
    prepararArbol(b.dir);
    const redB = armarRed(b.dir, { viajeros_evento: [], stock_ajustes: [], usuarios: [], eventos_meta: [{ slug: 'ultramexico' }] });
    global.fetch = redB.fetchFalso;
    const modB = require(path.join(b.dir, 'netlify/functions/admin-coordi-asignaciones.js'));
    const rB = await modB.handler(evPost('viajero_migrar', { ...cuerpo, zona_boleto: 'GENERAL' }));
    const insB = redB.escrituras.find((x) => x.tabla === 'viajeros_evento' && x.met === 'POST');
    af(rB.statusCode === 200 && insB && insB.cuerpo.zona_boleto === 'GENERAL',
       'BASE dejaba nacer «GENERAL» — control positivo: ' + JSON.stringify(insB && insB.cuerpo.zona_boleto));
  }

  // ══ [5] planear · el montón `fuera` empareja NORMALIZADO ════════════════
  console.log('[5] planear fuera · el par envenenado muere');
  {
    // El careo sembrado ES el de producción del 28-sep: chatarra del Excel con
    // la ortografía chueca contra la fila canónica alineada esa mañana.
    const careoSem = (chatarra, ajustes) => ({
      montones: { pagos: [], totales_contrato: [] }, personas: [], viajeros: [],
      chatarraPorZona: chatarra, ajustes,
    });
    prepararArbol(h.dir);
    const ap = require(path.join(h.dir, 'netlify/functions/_lib/excel-aplicar.js'));
    // (a) mismo conteo, otra ortografía → NINGÚN renglón (antes: crear + poner en cero)
    const p1 = ap.planear(careoSem({ 'Retractil Oro': 2 }, [{ id: 'x1', zona: 'Retráctil Oro', vendidos_fuera: 2 }]), {});
    af(p1.fuera.length === 0, 'HEAD: «Retractil Oro»(2) contra «Retráctil Oro»(2) = NADA que aplicar: ' + JSON.stringify(p1.fuera));
    // (b) cambio real → UN renglón, con la ortografía DE LA BASE y su id
    const p2 = ap.planear(careoSem({ 'GENERAL': 3 }, [{ id: 'x2', zona: 'General', vendidos_fuera: 2 }]), {});
    af(p2.fuera.length === 1 && p2.fuera[0].zona === 'General' && p2.fuera[0].de === 2 && p2.fuera[0].a === 3 && p2.fuera[0].ajuste_id === 'x2',
       'HEAD: el cambio real sale UNA vez, con la fila canónica: ' + JSON.stringify(p2.fuera));
    // (c) la llave «-» sobrevive como contador (sin ficha no hay canónica)
    const p3 = ap.planear(careoSem({ '-': 1 }, []), {});
    af(p3.fuera.length === 1 && p3.fuera[0].zona === '-' && p3.fuera[0].a === 1, 'la chatarra sin zona («-») no se pierde');
    // (d) dos ortografías del Excel que colapsan se SUMAN, no se pisan
    const p4 = ap.planear(careoSem({ 'General': 2, 'GENERAL': 1 }, []), {});
    af(p4.fuera.length === 1 && p4.fuera[0].a === 3, 'dos ortografías del mismo Excel se suman: ' + JSON.stringify(p4.fuera));
    // (e) BASE producía el par envenenado — el control positivo del careo entero
    prepararArbol(b.dir);
    const apB = require(path.join(b.dir, 'netlify/functions/_lib/excel-aplicar.js'));
    const pB = apB.planear(careoSem({ 'Retractil Oro': 2 }, [{ id: 'x1', zona: 'Retráctil Oro', vendidos_fuera: 2 }]), {});
    const crea = pB.fuera.find((x) => x.zona === 'Retractil Oro');
    const mata = pB.fuera.find((x) => x.zona === 'Retráctil Oro');
    af(pB.fuera.length === 2 && crea && crea.a === 2 && mata && mata.a === 0,
       'BASE proponía el par envenenado (crear la fantasma + matar la canónica): ' + JSON.stringify(pB.fuera));
  }

  // ══ [6] fail-soft DICHO · catálogo ilegible no cierra la captura ════════
  console.log('[6] catálogo ilegible · se acepta Y SE DICE');
  {
    prepararArbol(h.dir);
    const red = armarRed(h.dir, { proveedores: [{ id: '11111111-1111-1111-1111-111111111111', nombre: 'Prov' }] });
    const conCat = red.fetchFalso;
    global.fetch = async (url, opts) => {
      if (/\/index\.html$/.test(String(url))) return { ok: false, status: 500, text: async () => 'no', json: async () => ({}) };
      return conCat(url, opts);
    };
    const mod = require(path.join(h.dir, 'netlify/functions/admin-compras.js'));
    const r = await mod.handler(evPost('crear', { evento_id: 'ultramexico', zona: 'GENERAL', cantidad: 1, costo_unitario: 1, proveedor_id: '11111111-1111-1111-1111-111111111111', fecha: '2026-09-28' }));
    const d = JSON.parse(r.body);
    const ins = red.escrituras.find((x) => x.tabla === 'compras' && x.met === 'POST');
    af(r.statusCode === 200 && ins && ins.cuerpo.zona === 'GENERAL',
       'sin catálogo, la captura NO se bloquea (pasa tal cual): ' + JSON.stringify(ins && ins.cuerpo.zona));
    af(/sin validar/i.test(d.zona_aviso || ''), 'pero la respuesta CONFIESA que no validó: ' + JSON.stringify(d.zona_aviso));
  }

  completo = true;
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN DEL ARNÉS: ' + e.stack); process.exit(1); });
