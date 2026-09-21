// =============================================================================
// VIAJEROS-CONTADOR-1 · el acumulado de viajeros en la portada
// =============================================================================
// La portada presume los viajeros reales. Lo que este careo tiene que sostener
// no es que el número sea bonito, sino tres cosas que se rompen solas:
//
//   1. QUE EL CRITERIO SEA EL DEL RESUMEN, no una copia. Se ejercita el
//      handler REAL y `cuentasDeTodos` REAL sobre EL MISMO FIXTURE y se exige
//      el MISMO número — con control positivo: un handler saboteado que cuente
//      por su cuenta tiene que poner esto en rojo. Sin esa segunda mitad, la
//      igualdad no prueba nada (ver «el control positivo · ley grande»).
//   2. QUE EL NÚMERO NO ESTÉ TECLEADO. Se afirma sobre el HTML SERVIDO, no
//      sobre el fuente: si el 2468 apareciera ahí, el careo pasaría igual el
//      día que el sistema diga otra cosa.
//   3. QUE UN FALLO NO DEJE BASURA EN LA PORTADA. Endpoint caído → la sección
//      NO EXISTE en el DOM (no «escondida»: borrada) y la portada vive normal.
//
// 🔒 CERO RED REAL Y CERO SQL. Las 9 consultas del endpoint —medidas, no
// recordadas: solicitudes_tour · viajeros_evento · compras · abonos ·
// esferas_eventos · pagos · gastos · abonos_viajero, más el index del
// catálogo— se sirven de un fixture que respeta los filtros. Un mock que
// ignora el filtro no simplifica: falsifica.
//
// Uso: node scripts/mide-viajeros-contador.js
// =============================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

// ── EL MUNDO DE MENTIRA ──────────────────────────────────────────────────────
// Cinco eventos, elegidos para que cada rama de la cascada del año se ejercite:
//   arena2026  → ficha CON fecha 2026            (paso 1)
//   festi2027  → ficha CON fecha 2027            (paso 1, otro año)
//   melanie    → SIN fila en esferas, ds en el catálogo (paso 2)
//   palnorte   → ficha con fecha NULL y ds vacío (paso 3, el de ANIO_A_MANO)
//   vacio      → existe pero con CERO viajeros   (no debe crear renglón)
const VIAJEROS = [];
const sembrar = (slug, n) => { for (let i = 0; i < n; i++) VIAJEROS.push({
  id: `${slug}-${i}`, evento_id: slug, total_contrato: 1000, abonado_previo: 0, tipo_paquete: 'PLUS' }); };
sembrar('arena2026', 7);
sembrar('festi2027', 5);
sembrar('melanie', 3);
sembrar('palnorte', 4);
// `vacio` a propósito sin filas.
const TOTAL_ESPERADO = 19;          // 7 + 5 + 3 + 4
const ANIOS_ESPERADOS = { 2026: 14, 2027: 5 };   // arena+melanie+palnorte · festi

const ESFERAS = [
  { slug: 'arena2026', fecha_inicio: '2026-05-10' },
  { slug: 'festi2027', fecha_inicio: '2027-03-02' },
  { slug: 'palnorte', fecha_inicio: null },        // ficha SÍ, fecha NO
  { slug: 'vacio', fecha_inicio: '2026-01-01' },
  // melanie NO aparece: es el caso "sin ficha".
];

// El catálogo servido. `melanie` trae su `ds` — por ahí se resuelve sin
// teclearla— y `palnorte` lo trae VACÍO, como en producción.
const INDEX_FALSO = `<!doctype html><html><body>
<script>
var EV=[
 {id:'arena2026',a:'Arena 2026',ds:'2026-05-10',f:'10 may 2026',v:'Arena, Mty',st:''},
 {id:'festi2027',a:'Festi 2027',ds:'2027-03-02',f:'2 mar 2027',v:'Parque, Mty',st:''},
 {id:'melanie',a:'Melanie Martinez',ds:'2026-08-06',f:'6 ago 2026',v:'Arena Monterrey, Mty',st:'agotado'},
 {id:'palnorte',a:'Tecate Pa\\u00b4l Norte 2027',ds:'',f:'Por confirmar',v:'Parque Fundidora',st:'proximamente'},
 {id:'vacio',a:'Vacio',ds:'2026-01-01',f:'1 ene 2026',v:'X',st:''}
];
</script></body></html>`;

// Un PostgREST de mentira que SÍ respeta los filtros que el código manda.
function responder(url) {
  const u = String(url);
  const j = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
  if (/\/index\.html$/.test(u)) {
    return { ok: true, status: 200, text: async () => INDEX_FALSO, json: async () => ({}) };
  }
  const m = /\/rest\/v1\/([^?]+)\?/.exec(u);
  if (!m) return { ok: false, status: 404, json: async () => ({}), text: async () => 'no' };
  const tabla = m[1];
  const q = decodeURIComponent(u.split('?')[1] || '');
  switch (tabla) {
    case 'viajeros_evento': return j(VIAJEROS);
    case 'esferas_eventos': return j(ESFERAS);
    // El resto del mundo del dinero existe y va VACÍO: este careo mide el
    // conteo de personas, y la cuenta del dinero ya la miden sus propios
    // arneses. Vacío NO es «ignorado»: la lib los lee y tiene que aguantarlo.
    case 'solicitudes_tour':
      af(/estado=in\.\(pendiente,en_pagos,pagado\)/.test(q),
        'el filtro de estados de solicitudes_tour cambió: el fixture dejó de parecerse a producción');
      return j([]);
    case 'pagos':
      af(/estado=eq\.pagado/.test(q), 'el filtro de pagos cambió: el fixture dejó de parecerse a producción');
      return j([]);
    case 'compras': case 'abonos': case 'gastos': case 'abonos_viajero': return j([]);
    default: return { ok: false, status: 404, json: async () => ({}), text: async () => 'tabla inesperada: ' + tabla };
  }
}

function conFixture(fn) {
  const real = globalThis.fetch;
  const vistas = [];
  globalThis.fetch = async (u) => { vistas.push(String(u)); return responder(u); };
  return Promise.resolve()
    .then(fn)
    .then((r) => ({ r, vistas }))
    .finally(() => { globalThis.fetch = real; });
}

function frescoEndpoint() {
  const f = path.join(RAIZ, 'netlify/functions/viajeros-contador.js');
  delete require.cache[require.resolve(f)];
  delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'))];
  return require(f);
}

// Sirve el index REAL del árbol, con el endpoint interceptado por la página.
function servir() {
  const s = http.createServer((q, r) => {
    const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\//, '') || 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); return r.end('no'); }
      r.writeHead(200, { 'Content-Type': /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'text/html; charset=utf-8' });
      r.end(b);
    });
  });
  return new Promise((res) => s.listen(0, '127.0.0.1', () => res({ s, p: s.address().port })));
}

(async () => {
  console.log('CAREO VIAJEROS-CONTADOR-1 · el acumulado en la portada\n');

  // ── [1] EL ENDPOINT: forma y caché ─────────────────────────────────────────
  console.log('[1] el endpoint');
  process.env.SUPABASE_URL_KAMEHOUSE = process.env.SUPABASE_URL_KAMEHOUSE || 'https://kh.test';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE || 'k';
  process.env.PORTAL_SUPABASE_URL = process.env.PORTAL_SUPABASE_URL || 'https://pt.test';
  process.env.PORTAL_SUPABASE_SERVICE_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY || 'k';
  process.env.URL = 'https://sitio.test';

  const { r: res, vistas } = await conFixture(() => frescoEndpoint().handler({ httpMethod: 'GET' }));
  const cuerpo = JSON.parse(res.body);
  console.log('    status ' + res.statusCode + ' · ' + JSON.stringify(cuerpo));
  console.log('    consultas: ' + vistas.length);
  af(res.statusCode === 200, '[1] el endpoint no dio 200: ' + res.statusCode + ' ' + res.body.slice(0, 160));
  af(cuerpo.total === TOTAL_ESPERADO, `[1] total = ${cuerpo.total}, se esperaba ${TOTAL_ESPERADO}`);
  af(JSON.stringify(cuerpo.por_anio) === JSON.stringify(ANIOS_ESPERADOS),
    `[1] por_anio = ${JSON.stringify(cuerpo.por_anio)}, se esperaba ${JSON.stringify(ANIOS_ESPERADOS)}`);
  const sumaA = Object.values(cuerpo.por_anio || {}).reduce((a, b) => a + b, 0);
  af(sumaA === cuerpo.total, `[1] el desglose suma ${sumaA} y el total dice ${cuerpo.total}`);
  af(cuerpo.sin_anio === undefined, '[1] quedó gente sin año: ' + JSON.stringify(cuerpo.sin_anio));
  af(cuerpo.descuadre === undefined, '[1] el endpoint reporta descuadre: ' + cuerpo.descuadre);

  // La caché es REQUISITO, no adorno: esta respuesta la pide la portada entera.
  const cc = res.headers['Cache-Control'] || '';
  console.log('    Cache-Control: ' + cc);
  af(/s-maxage=\d+/.test(cc), '[1] falta s-maxage en Cache-Control: "' + cc + '"');
  const sm = Number((/s-maxage=(\d+)/.exec(cc) || [])[1]);
  af(sm >= 300 && sm <= 1800, `[1] s-maxage = ${sm}s; fuera del rango razonable (5-30 min)`);
  af(/public/.test(cc), '[1] el Cache-Control no es `public`: el CDN no lo guardaría');

  // 🔒 NI UNA PALABRA DE DINERO. La lib calcula ventas, ganancia y deuda de
  // paso; esto es un endpoint PÚBLICO y nada de eso puede salir. Se mide sobre
  // el cuerpo SERVIDO, no sobre el código.
  const DINERO = ['cobrado', 'ventas', 'ganancia', 'utilidad', 'gastos', 'facturado',
                  'deuda', 'inversion', 'en_mano', 'bodega', 'merma', 'saldo', 'precio'];
  const fuga = DINERO.filter((k) => res.body.toLowerCase().includes(k));
  af(fuga.length === 0, '[1] el endpoint público filtra dinero: ' + fuga.join(', '));
  // Control positivo de ESA aserción: si el barrido no puede ver una palabra
  // sembrada, sus ceros no dicen nada.
  af(DINERO.some((k) => (res.body + '"ganancia":1').toLowerCase().includes(k)),
    '[1] el barrido de dinero no caza una palabra sembrada: no está midiendo');

  // ── [2] 🔒 EL CRITERIO ES EL DEL RESUMEN, SOBRE EL MISMO FIXTURE ──────────
  console.log('\n[2] el criterio, careado contra la fuente del Resumen');
  const CE = require(path.join(RAIZ, 'netlify/functions/_lib/cuenta-evento.js'));
  const { r: delResumen } = await conFixture(() => CE.cuentasDeTodos({
    khUrl: 'https://kh.test', khService: 'k', portalUrl: 'https://pt.test', portalService: 'k',
    rol: 'maestro_roshi',
  }));
  const totResumen = delResumen && delResumen.totales && delResumen.totales.viajeros;
  console.log('    Resumen dice ' + totResumen + ' · el contador dice ' + cuerpo.total);
  af(totResumen === cuerpo.total,
    `[2] el contador dice ${cuerpo.total} y el Resumen ${totResumen} CON LOS MISMOS DATOS: son dos fórmulas`);
  af(totResumen === TOTAL_ESPERADO, `[2] el propio Resumen da ${totResumen}: el fixture no ejercita lo que cree`);

  // 🔒 CONTROL POSITIVO DEL CANDADO ANTERIOR. Se sirve el MISMO fixture pero
  // con una fila más SOLO al contador: si la igualdad de arriba no pudiera
  // ponerse en rojo, no estaría comparando nada.
  {
    const extra = { id: 'x-1', evento_id: 'arena2026', total_contrato: 1, abonado_previo: 0, tipo_paquete: 'PLUS' };
    VIAJEROS.push(extra);
    const { r: r2 } = await conFixture(() => frescoEndpoint().handler({ httpMethod: 'GET' }));
    VIAJEROS.pop();
    const t2 = JSON.parse(r2.body).total;
    console.log('    control positivo: con una fila más el contador dice ' + t2);
    af(t2 === TOTAL_ESPERADO + 1,
      `[2] con una fila MÁS el contador sigue diciendo ${t2}: no está leyendo los datos, trae el número de otro lado`);
    af(t2 !== totResumen, '[2] el careo de igualdad no puede ponerse en rojo: no prueba nada');
  }

  // ── [3] LA CASCADA DEL AÑO, rama por rama ─────────────────────────────────
  console.log('\n[3] la cascada del año');
  // Quitarle la ficha a arena2026 tiene que dejarlo IGUAL: su ds lo salva.
  {
    const i = ESFERAS.findIndex((e) => e.slug === 'arena2026');
    const guardo = ESFERAS[i];
    ESFERAS.splice(i, 1);
    const { r: r3 } = await conFixture(() => frescoEndpoint().handler({ httpMethod: 'GET' }));
    ESFERAS.splice(i, 0, guardo);
    const c3 = JSON.parse(r3.body);
    console.log('    sin ficha, con ds → ' + JSON.stringify(c3.por_anio));
    af(JSON.stringify(c3.por_anio) === JSON.stringify(ANIOS_ESPERADOS),
      '[3] sin ficha el catálogo no lo salvó: ' + JSON.stringify(c3.por_anio));
  }
  // Y sin NINGUNA de las dos, un evento desconocido cae a `sin_anio` — NO se
  // reparte ni se esconde: el total lo cuenta y la portada puede decirlo.
  {
    sembrar('fantasma', 2);
    const { r: r4 } = await conFixture(() => frescoEndpoint().handler({ httpMethod: 'GET' }));
    VIAJEROS.splice(VIAJEROS.length - 2, 2);
    const c4 = JSON.parse(r4.body);
    console.log('    evento sin ficha ni ds → total ' + c4.total + ' · sin_anio ' + JSON.stringify(c4.sin_anio));
    af(c4.total === TOTAL_ESPERADO + 2, `[3] el total no contó al desconocido: ${c4.total}`);
    af(Array.isArray(c4.sin_anio) && c4.sin_anio.some((x) => x.slug === 'fantasma'),
      '[3] el evento sin fecha no salió en `sin_anio`: se perdería en silencio');
    af(c4.descuadre === 2, `[3] el descuadre no se reporta: ${c4.descuadre}`);
  }

  // ── [4] LA PÁGINA, web y móvil ────────────────────────────────────────────
  const { s, p } = await servir();
  const nav = await chromium.launch();

  // 🔒 EN PLAYWRIGHT MANDA LA ÚLTIMA RUTA REGISTRADA: LA ESPECÍFICA VA AL
  // FINAL. Registrada primero, la genérica se la come y el contador recibe un
  // `{ok:true}` sin `total` — que es exactamente lo que este careo interpreta
  // como «el endpoint falló». Mordió aquí antes de estar escrito el candado:
  // [4] salía «la pieza no existe» y parecía un defecto del código.
  //
  // Y el mock LLEVA CONTADOR: un `0 llamadas` no es un resultado, es que nunca
  // se ejecutó — y todas las aserciones de abajo pasarían en vacío.
  const abrir = async (width, respuesta) => {
    const pg = await nav.newPage({ viewport: { width, height: 900 } });
    pg.__llamadas = 0;
    // 1 · la genérica, PRIMERO: todo lo demás de red se corta.
    await pg.route('**/.netlify/functions/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    // 2 · la específica, AL FINAL, para que gane.
    await pg.route('**/.netlify/functions/viajeros-contador*', (route) => {
      pg.__llamadas++;
      if (respuesta === 'caido') return route.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false}' });
      if (respuesta === 'red') return route.abort('failed');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respuesta) });
    });
    await pg.goto(`http://127.0.0.1:${p}/index.html`, { waitUntil: 'domcontentloaded' });
    return pg;
  };

  const SERVIDO = { ok: true, total: 2468, por_anio: { 2026: 2281, 2027: 187 } };

  for (const [rotulo, width] of [['escritorio', 1280], ['celular', 390]]) {
    console.log(`\n[4] la pieza en la portada · ${rotulo} (${width}px)`);
    const pg = await abrir(width, SERVIDO);
    await pg.waitForTimeout(2600);          // deja terminar el count-up
    const v = await pg.evaluate(() => {
      const c = document.getElementById('hh-vcount');
      if (!c) return { existe: false };
      const n = document.getElementById('hh-vc-num');
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      const nEl = n ? getComputedStyle(n) : null;
      return {
        existe: true, oculto: c.hidden, display: cs.display,
        texto: n ? n.textContent : null,
        anios: [...document.querySelectorAll('#hh-vc-anios .hh-vc-anio')].map((e) => e.textContent.trim()),
        aLaVista: r.width > 0 && r.height > 0,
        fuente: nEl ? nEl.fontFamily : null,
        tam: nEl ? nEl.fontSize : null,
        tabular: nEl ? nEl.fontVariantNumeric : null,
        // ¿el número se DESBORDA de la columna del hero?
        sobra: (() => { const pa = c.parentElement; if (!pa) return 0;
          return Math.max(0, Math.round(c.scrollWidth - pa.clientWidth)); })(),
        // 🔴 Y DÓNDE queda. «Se ve» y «no se desborda» daban VERDE mientras en
        // escritorio la pieza caía al fondo, debajo de los CTA y medio fuera
        // del pliegue: sin área en la rejilla se iba a una fila implícita.
        // El hecho que importa es el ORDEN VISUAL, no la existencia.
        // El ORDEN DE LA PIEZA, leído de los hijos que de verdad pintan texto.
        // Tiene que ser exactamente: número → rótulo → chips de año.
        piezas: [...c.children].filter((e) => (e.textContent || '').trim())
          .map((e) => (e.className || e.tagName)),
        // Lo que se lee ARRIBA del número dentro del bloque, si algo hay.
        antesDelNumero: (() => {
          const n = document.getElementById('hh-vc-num');
          if (!n) return null;
          const t = (c.innerText || '').trim();
          const i = t.indexOf(n.textContent.trim());
          return i <= 0 ? '' : t.slice(0, i).trim();
        })(),
        yTop: Math.round(r.top),
        yProof: (() => { const e = document.querySelector('.hh-proof');
          return e ? Math.round(e.getBoundingClientRect().top) : null; })(),
        yCtas: (() => { const e = document.querySelector('.hh-ctas');
          return e ? Math.round(e.getBoundingClientRect().top) : null; })(),
        alto: document.documentElement.clientHeight,
      };
    });
    console.log('    ' + JSON.stringify(v));
    af(pg.__llamadas === 1, `[4/${rotulo}] la página pidió el contador ${pg.__llamadas} veces, no 1`);
    af(v.existe && !v.oculto && v.aLaVista, `[4/${rotulo}] la pieza no se ve`);
    // 🔒 EL NÚMERO PINTADO ES EL DEL JSON SERVIDO.
    af(v.texto === (2468).toLocaleString('es-MX'),
      `[4/${rotulo}] el número pintado es «${v.texto}» y el JSON servido dijo 2,468`);
    af(JSON.stringify(v.anios) === JSON.stringify(['2026: 2,281', '2027: 187']),
      `[4/${rotulo}] el desglose pintado es ${JSON.stringify(v.anios)}`);
    // La tipografía es la que el sitio SÍ carga.
    af(/Barlow Condensed/.test(v.fuente || ''),
      `[4/${rotulo}] el número no usa la display de la casa: «${v.fuente}»`);
    af(!/Kaneda/.test(v.fuente || ''),
      `[4/${rotulo}] pide Kaneda, que el sitio NO carga: caería a Montserrat en silencio`);
    af(/tabular-nums/.test(v.tabular || ''),
      `[4/${rotulo}] el número no va en tabular-nums: el count-up hará bailar el renglón`);
    af(v.sobra === 0, `[4/${rotulo}] la pieza se desborda ${v.sobra}px de su columna`);
    af(v.yProof !== null && v.yTop > v.yProof,
       `[4/${rotulo}] el contador no va DEBAJO de «13 años»: y=${v.yTop} contra ${v.yProof}`);
    af(v.yCtas !== null && v.yTop < v.yCtas,
       `[4/${rotulo}] el contador quedó DEBAJO de los CTA (y=${v.yTop} contra ${v.yCtas}): se fue al fondo de la rejilla`);
    af(v.yTop < v.alto,
       `[4/${rotulo}] el contador nace fuera del pliegue (y=${v.yTop}, pantalla ${v.alto}): nadie lo ve sin bajar`);

    // ── 🔒 LA PIEZA ARRANCA EN EL NÚMERO ─────────────────────────────────
    // Decisión de Memo con la palabra de Jane (21-sep-2026): se quitó el
    // renglón «Nos han acompañado» porque HABLA EN PASADO y la pieza dice
    // justo lo contrario — «y contando».
    //
    // ⚠️ Esto NO retira una aserción: NINGUNA exigía ese renglón, así que no
    // había nada que jubilar. Lo que se agrega es el candado que faltaba — sin
    // él, la decisión vive solo en un comentario, y esta casa ya pagó esta
    // semana lo que cuesta un candado prometido en un comentario.
    af(v.antesDelNumero === '',
       `[4/${rotulo}] hay texto ANTES del número dentro de la pieza: «${v.antesDelNumero}»`);
    af(JSON.stringify(v.piezas) === JSON.stringify(['hh-vc-n', 'hh-vc-anios']),
       `[4/${rotulo}] el orden de la pieza es ${JSON.stringify(v.piezas)}, se esperaba número+rótulo y luego los años`);
    await pg.close();
  }

  // ── [5] EL COUNT-UP TERMINA EN EL VALOR EXACTO ────────────────────────────
  console.log('\n[5] el count-up');
  {
    const pg = await abrir(1280, SERVIDO);
    // Se muestrea DURANTE la animación: si nunca hubo un valor intermedio, no
    // hubo count-up y la aserción del final pasaría en vacío.
    const muestras = [];
    for (let i = 0; i < 22; i++) {
      muestras.push(await pg.evaluate(() => {
        const n = document.getElementById('hh-vc-num');
        return n ? n.textContent : null;
      }));
      await pg.waitForTimeout(60);
    }
    await pg.waitForTimeout(2200);
    const fin = await pg.evaluate(() => document.getElementById('hh-vc-num').textContent);
    const distintos = [...new Set(muestras.filter(Boolean))];
    console.log('    valores intermedios distintos: ' + distintos.length + ' · final: ' + fin);
    af(distintos.length >= 3,
      `[5] no hubo count-up (solo ${distintos.length} valor(es)): la aserción del final no probaría nada`);
    af(fin === (2468).toLocaleString('es-MX'), `[5] el count-up terminó en «${fin}», no en 2,468`);
    await pg.close();
  }

  // ── [6] ENDPOINT CAÍDO → LA SECCIÓN NO EXISTE, Y LA PORTADA VIVE ──────────
  console.log('\n[6] fail-soft');
  for (const [rotulo, modo] of [['502', 'caido'], ['red cortada', 'red'], ['total cero', { ok: true, total: 0, por_anio: {} }]]) {
    const pg = await abrir(390, modo);
    await pg.waitForTimeout(1800);
    const v = await pg.evaluate(() => ({
      existe: !!document.getElementById('hh-vcount'),
      // La portada tiene que seguir viva: su título y sus CTA, en pie.
      titulo: !!document.querySelector('.hh-title'),
      ctas: document.querySelectorAll('.hh-ctas .hh-btn').length,
      proof: !!document.querySelector('.hh-proof'),
    }));
    console.log(`    ${rotulo}: sección en el DOM = ${v.existe} · título ${v.titulo} · CTAs ${v.ctas} · llamadas ${pg.__llamadas}`);
    af(pg.__llamadas === 1, `[6/${rotulo}] el mock no se llamó (${pg.__llamadas}): el caso pasaría en vacío`);
    af(v.existe === false, `[6/${rotulo}] la sección SIGUE en el DOM: debe BORRARSE, no esconderse`);
    af(v.titulo && v.ctas > 0 && v.proof, `[6/${rotulo}] la portada se dañó al fallar el contador`);
    await pg.close();
  }

  // ── [7] EL NÚMERO NO ESTÁ TECLEADO, medido sobre lo SERVIDO ───────────────
  console.log('\n[7] el número no está en el HTML');
  {
    const pg = await abrir(1280, SERVIDO);
    // 🔒 Se ESPERA POR LA CONDICIÓN, no por un sleep: leer el DOM antes de que
    // el fetch termine daba un rojo que parecía del código y era del reloj del
    // careo. Una espera floja disfraza cualquier cosa.
    await pg.waitForFunction(() => {
      const n = document.getElementById('hh-vc-num');
      return !!n && n.textContent === (2468).toLocaleString('es-MX');
    }, null, { timeout: 8000 });
    const crudo = await pg.evaluate(() => document.documentElement.outerHTML);
    // Antes de que el JS corra no puede existir; y el fuente del árbol tampoco.
    const fuente = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    af(!/2468|2,468/.test(fuente),
      '[7] el índice trae el número TECLEADO: el día que el sistema diga otra cosa, la portada mentirá');
    af(!/2281|2,281/.test(fuente), '[7] el índice trae el desglose 2026 tecleado');
    af(/2,468/.test(crudo), '[7] tras cargar, el número NO aparece en el DOM: el control no mide nada');
    console.log('    fuente sin el número ✅ · DOM con el número tras el fetch ✅');
    await pg.close();
  }

  await nav.close(); s.close();
  console.log('\n──────────────────────────────────────────────');
  if (mal) { console.log(`❌ ROJO · ${ok} en verde, ${mal} en rojo`); fallos.forEach((f) => console.log('  · ' + f)); process.exit(1); }
  console.log(`✅ VERDE · ${ok} aserciones en verde, 0 en rojo`);
})();
