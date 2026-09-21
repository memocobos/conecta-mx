#!/usr/bin/env node
// =============================================================================
// scripts/mide-giveaway-karolg.js — EL CAREO DEL GIVEAWAY DE KAROL G (FASE 1)
// =============================================================================
// El módulo de /giveaway y /sorteo ya existía para Natanael. Esta tuerca lo
// repunta a Karol G (7-nov-2026, Estadio BBVA) y le suma tres cosas al
// registro: los botones de redes, el Instagram y la foto del participante.
//
// 🔒 LO QUE ESTE CAREO CUIDA MÁS QUE NADA: que `instagram` y `foto_path` NO
// salgan por ninguna puerta pública. Se mide sobre el JSON SERVIDO por las
// funciones, no por grep del fuente — el comentario que explica por qué un
// campo no está contiene el nombre del campo.
// =============================================================================

const path = require('path');
const fs = require('fs');
const RAIZ = path.join(__dirname, '..');
let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

const http = require('http');
const { chromium } = require('playwright');
// ⚠️ ANTES de requerir el lib: `_lib/giveaway` lee las env vars AL CARGARSE.
// Puestas después, `faltaEnv()` detendría al handler antes de las guardas que
// esta prueba quiere medir, y el rojo sería del entorno, no del código.
process.env.PORTAL_SUPABASE_URL = process.env.PORTAL_SUPABASE_URL || 'https://pt.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY || 'k';
const G = require(path.join(RAIZ, 'netlify/functions/_lib/giveaway.js'));

// Sirve el árbol de trabajo para abrir la página como la abre la gente.
function servir() {
  const srv = http.createServer((req, res) => {
    const f = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'giveaway.html');
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404); return res.end('no'); }
      res.writeHead(200, { 'Content-Type': /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'text/html; charset=utf-8' });
      res.end(b);
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, puerto: srv.address().port })));
}

(async () => {
  console.log('CAREO GIVEAWAY KAROL G · fase 1\n');

  // ── [1] LAS DOS CONSTANTES DE FECHA ──────────────────────────────────────
  // Son DOS momentos distintos y viven en UNA sola definición: si la fecha se
  // copiara en las seis funciones, un cambio de última hora dejaría una puerta
  // abierta mientras las otras ya cerraron.
  console.log('[1] las dos fechas');
  console.log('    CIERRE ' + G.CIERRE + '  ·  SORTEO ' + G.SORTEO);
  af(G.CIERRE === '2026-10-01T20:00:00-05:00',
     'CIERRE = ' + G.CIERRE + ', se esperaba 2026-10-01T20:00:00-05:00 (8 PM Reynosa)');
  af(G.SORTEO === '2026-10-01T21:00:00-05:00',
     'SORTEO = ' + G.SORTEO + ', se esperaba 2026-10-01T21:00:00-05:00 (9 PM Reynosa)');
  // 🔒 EL OFFSET ES −05:00 Y NO −06:00. Reynosa vive en America/Matamoros, que
  // SÍ trae horario de verano hasta el 1-nov; Monterrey lo dejó en 2022. El
  // 1-oct Reynosa sigue en verano, así que −05:00. Escribir −06:00 correría
  // todo una hora y el registro cerraría cuando nadie lo espera.
  af(/-05:00$/.test(G.CIERRE) && /-05:00$/.test(G.SORTEO),
     'el offset no es -05:00: el 1-oct Reynosa SIGUE en horario de verano');
  af(Date.parse(G.SORTEO) - Date.parse(G.CIERRE) === 60 * 60 * 1000,
     'entre el cierre y el sorteo debe haber exactamente una hora');
  // Y la hora de Monterrey que la pantalla anuncia es UNA MENOS.
  const enMty = new Date(Date.parse(G.SORTEO)).toLocaleTimeString('es-MX',
    { timeZone: 'America/Monterrey', hour: 'numeric', minute: '2-digit', hour12: true });
  console.log('    el sorteo en Monterrey: ' + enMty);
  af(/^8:00/.test(enMty), 'en Monterrey el sorteo cae a las ' + enMty + ' y el copy dice 8:00 PM');

  // ── [2] EL CRON: la ventana y el schedule, que se mueven JUNTOS ──────────
  // 🔴 EL SCHEDULE NO DERIVA DE `SORTEO`: la FECHA sí (el cron se rehúsa si el
  // día no es el del sorteo) pero LA HORA vive en netlify.toml, en UTC. Son
  // dos fuentes, y esta sección existe para que no puedan divergir en silencio.
  console.log('\n[2] el cron del recordatorio');
  const toml = fs.readFileSync(path.join(RAIZ, 'netlify.toml'), 'utf8');
  // El `schedule` puede venir con comentarios en medio: se busca dentro de SU
  // sección, no en la línea de junto.
  const iSec = toml.indexOf('[functions."giveaway-recordatorio"]');
  const finSec = (() => { const j = toml.indexOf('\n[', iSec + 1); return j < 0 ? toml.length : j; })();
  const mSch = iSec < 0 ? null : /schedule\s*=\s*"([^"]+)"/.exec(toml.slice(iSec, finSec));
  af(!!mSch, 'no encontré el schedule de giveaway-recordatorio en netlify.toml');
  const sch = mSch ? mSch[1] : '';
  console.log('    schedule (UTC): ' + JSON.stringify(sch));
  const pm = /^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/.exec(sch);
  af(!!pm, 'el schedule no es un «minuto hora * * *» diario: ' + sch);

  const VENTANA_MIN = 40;   // el mismo número que usa la función
  const abre = Date.parse(G.SORTEO) - VENTANA_MIN * 60 * 1000;
  const cierra = Date.parse(G.SORTEO);
  if (pm) {
    // El cron corre TODOS los días a esa hora UTC. El que importa es el
    // disparo que cae dentro de la ventana del día del sorteo.
    const d = new Date(Date.parse(G.SORTEO));
    const disparo = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
      parseInt(pm[2], 10), parseInt(pm[1], 10), 0);
    const dentro = disparo >= abre && disparo <= cierra;
    const holgura = Math.round((disparo - abre) / 60000);
    console.log('    disparo del día del sorteo: ' + new Date(disparo).toISOString()
      + ' · ventana [' + new Date(abre).toISOString() + ' … ' + new Date(cierra).toISOString() + ']');
    console.log('    holgura contra el borde de apertura: ' + holgura + ' min');
    af(dentro, 'EL CRON NO CAE EN LA VENTANA: se dispararía y la función se rehusaría, '
       + 'y el recordatorio no saldría nunca. schedule y SORTEO se mueven JUNTOS.');
    // 🔒 Y NO EN LA ORILLA (orden de Memo): un disparo pegado al borde se cae
    // fuera con que Netlify se retrase un minuto.
    af(holgura >= 5 && (cierra - disparo) / 60000 >= 5,
       'el disparo queda en la ORILLA de la ventana (' + holgura + ' min de un lado): '
       + 'un retraso de Netlify lo tira fuera');
  }

  // ⚠️ EL CAMBIO DE DÍA. Las 9 PM de Reynosa son las 02:00 UTC del día
  // SIGUIENTE, así que el cron del «1 de octubre» dispara el 2 en UTC. La
  // comparación de la función es contra el día EN REYNOSA, y eso es lo que la
  // salva — pero hay que probarlo, no suponerlo.
  // ── LOS INSTANTES REALES EN QUE DISPARA EL SCHEDULE ─────────────────────
  // 🔒 Y SE LE PREGUNTA A LA FUNCIÓN, NO A UNA COPIA. La primera versión de
  // esta sección RE-IMPLEMENTABA aquí la comparación `hoyReynosa !== DIA` —
  // o sea, medía mi copia de la regla y no la regla. Si yo me equivocaba en
  // las dos, el verde no decía nada. Ahora se congela el reloj en cada
  // instante UTC y se INVOCA el handler real.
  //
  // ⚠️ Las 9 PM de Reynosa son las 02:00 UTC del día SIGUIENTE, así que el
  // disparo del «1 de octubre» lleva fecha UTC del 2. Eso es lo que se prueba.
  console.log('\n    los INSTANTES REALES del schedule (UTC), contra el handler:');
  const DIA = String(G.SORTEO).slice(0, 10);
  af(DIA === '2026-10-01', 'DIA_SORTEO sale ' + DIA + ' y debe ser 2026-10-01 (la fecha EN REYNOSA)');

  const INSTANTES = [
    ['2026-10-01T01:30:00Z', false, 'en Reynosa es el 30-sep, 8:30 PM'],
    ['2026-10-02T01:30:00Z', true,  'en Reynosa es el 1-oct, 8:30 PM'],
    ['2026-10-03T01:30:00Z', false, 'en Reynosa es el 2-oct, 8:30 PM'],
  ];
  const DateReal = Date;
  const fetchReal = global.fetch;
  for (const [iso, debeMandar, nota] of INSTANTES) {
    const fijo = DateReal.parse(iso);
    // Reloj congelado: `new Date()` sin argumentos y `Date.now()` devuelven el
    // instante de la prueba; todo lo demás se comporta igual.
    class DateFalso extends DateReal {
      constructor(...a) { if (a.length === 0) super(fijo); else super(...a); }
      static now() { return fijo; }
    }
    global.Date = DateFalso;
    // La red no se toca: si el handler pasara las dos guardas, leería Supabase.
    // Se le da una lista VACÍA para que llegue hasta el final sin mandar nada.
    let leyoBase = false;
    global.fetch = async () => { leyoBase = true; return { ok: true, status: 200, json: async () => [], text: async () => '[]' }; };
    delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/giveaway-recordatorio.js'))];
    const mod = require(path.join(RAIZ, 'netlify/functions/giveaway-recordatorio.js'));
    let cuerpo = {};
    try { cuerpo = JSON.parse((await mod.handler()).body || '{}'); } catch (e) { cuerpo = { error: e.message }; }
    global.Date = DateReal; global.fetch = fetchReal;
    const mando = !cuerpo.saltado;
    console.log(`      ${iso}  (${nota})  →  ${mando ? 'MANDA' : 'se rehúsa: ' + cuerpo.saltado}`);
    af(mando === debeMandar,
       `el disparo ${iso} ${mando ? 'MANDA' : 'se rehúsa (' + cuerpo.saltado + ')'} y debería `
       + (debeMandar ? 'MANDAR' : 'rehusarse') + ' — ' + nota);
    if (debeMandar) af(leyoBase, 'el disparo bueno no llegó siquiera a leer el padrón');
  }

  // ── [3] EL SLUG NUEVO, Y NATANAEL SIN MEZCLARSE ──────────────────────────
  console.log('\n[3] el slug');
  console.log('    ' + G.SLUG);
  af(G.SLUG === 'karolg-bbva-2026', 'el slug es ' + G.SLUG + ', se propuso karolg-bbva-2026');
  af(!/natanael/i.test(G.SLUG), 'el slug sigue nombrando a Natanael');

  // ── [4] EL PREMIO: Club Seat, y la fecha explícita ───────────────────────
  console.log('\n[4] el premio dual');
  console.log('    PLUS:  ' + G.PREMIOS.PLUS);
  console.log('    CHEAP: ' + G.PREMIOS.CHEAP);
  af(/Club Seat/.test(G.PREMIOS.PLUS) && /Club Seat/.test(G.PREMIOS.CHEAP),
     'el premio sigue diciendo la zona de Natanael: ' + JSON.stringify(G.PREMIOS));
  af(!/Tumbada/i.test(JSON.stringify(G.PREMIOS)), 'quedó «Zona Tumbada» de Natanael en el premio');
  // 🔒 LA FECHA, EXPLÍCITA. Karol G tiene TRES fechas (6, 7 y 8 de noviembre) y
  // el premio es para la del 7 — `karolg#1`. Sin decirlo, el ganador puede
  // creer que elige.
  af(/7 de noviembre/i.test(JSON.stringify(G.PREMIOS)),
     'el premio no dice la FECHA, y el evento tiene tres: ' + JSON.stringify(G.PREMIOS));
  // Y la regla de quién gana qué no cambia: la decide la ciudad.
  af(G.premioPorCiudad('Reynosa, Tamps.') === 'PLUS', 'Reynosa debe dar PLUS');
  af(G.premioPorCiudad('Río Bravo') === 'CHEAP', 'Río Bravo NO es Reynosa: debe dar CHEAP');
  af(G.premioPorCiudad('Monterrey') === 'CHEAP', 'Monterrey debe dar CHEAP');

  // ── [4b] INSTAGRAM Y FOTO: lo que el servidor acepta y lo que rehúsa ────
  console.log('\n[4b] el registro con Instagram y foto');
  const FOTO = require(path.join(RAIZ, 'netlify/functions/giveaway-foto.js'));
  const fetchReal2 = global.fetch;

  // Un JPEG de verdad, chiquito: los tres bytes de firma y relleno.
  const jpegOk = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(64, 7)]);
  const pngOk = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(64, 7)]);
  const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(64, 7)]);
  const noEsFoto = Buffer.from('MZ\u0090\u0000esto es un ejecutable, no una foto'.repeat(4));

  // 🔒 LA IMAGEN SE RECONOCE POR SUS BYTES, NO POR LA ETIQUETA. El
  // `data:image/jpeg` lo escribe quien sube: un ejecutable renombrado llega
  // con esa etiqueta igual de bien.
  console.log('    tipoPorBytes: jpeg=' + JSON.stringify(FOTO.tipoPorBytes(jpegOk))
    + ' png=' + JSON.stringify(FOTO.tipoPorBytes(pngOk))
    + ' heic=' + JSON.stringify(FOTO.tipoPorBytes(heic))
    + ' basura=' + JSON.stringify(FOTO.tipoPorBytes(noEsFoto)));
  af(FOTO.tipoPorBytes(jpegOk) && FOTO.tipoPorBytes(jpegOk).ext === 'jpg', 'no reconoce un JPEG por sus bytes');
  af(FOTO.tipoPorBytes(pngOk) && FOTO.tipoPorBytes(pngOk).ext === 'png', 'no reconoce un PNG por sus bytes');
  af(FOTO.tipoPorBytes(heic) && FOTO.tipoPorBytes(heic).heic === true, 'no distingue un HEIC de iPhone');
  af(FOTO.tipoPorBytes(noEsFoto) === null, 'aceptó como foto algo que no lo es');

  // Y por el camino REAL: se invoca el handler.
  async function subir(buf, mime) {
    let subido = null;
    global.fetch = async (url, opts) => {
      if (String(url).includes('/storage/v1/object/')) {
        subido = { url: String(url), bytes: opts.body, tipo: opts.headers['Content-Type'] };
        return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '' };
    };
    const r = await FOTO.handler({ httpMethod: 'POST',
      headers: { origin: 'https://conectareynosa.mx' },
      body: JSON.stringify({ foto: 'data:' + (mime || 'image/jpeg') + ';base64,' + buf.toString('base64') }) });
    global.fetch = fetchReal2;
    return { res: r, cuerpo: JSON.parse(r.body || '{}'), subido };
  }

  const okSub = await subir(jpegOk);
  console.log('    subida buena → ' + okSub.res.statusCode + ' path=' + okSub.cuerpo.foto_path);
  af(okSub.res.statusCode === 200 && okSub.cuerpo.ok, 'una foto buena no se subió: ' + JSON.stringify(okSub.cuerpo));
  // 🔒 EL NOMBRE LO PONE EL SERVIDOR. Nada del cliente entra en la ruta.
  af(/^karolg-bbva-2026\/[A-Za-z0-9-]+\.jpg$/.test(okSub.cuerpo.foto_path || ''),
     'el path no lo generó el servidor con su forma: ' + okSub.cuerpo.foto_path);

  // Un ejecutable con etiqueta de imagen: se rehúsa.
  const malo = await subir(noEsFoto, 'image/jpeg');
  console.log('    ejecutable etiquetado como jpeg → ' + malo.res.statusCode + ' ' + malo.cuerpo.error);
  af(malo.res.statusCode === 415, 'ACEPTÓ un archivo que no es imagen, solo porque la etiqueta decía image/jpeg');
  af(malo.subido === null, 'lo subió al bucket antes de rehusarlo');

  // HEIC: se rehúsa DICIENDO que es HEIC, no con un «no es imagen».
  const heicRes = await subir(heic, 'image/heic');
  console.log('    HEIC de iPhone → ' + heicRes.res.statusCode + ' ' + heicRes.cuerpo.error);
  af(heicRes.res.statusCode === 415, 'aceptó un HEIC: media web no puede ni mostrarlo');
  af(/HEIC/i.test(heicRes.cuerpo.error || ''), 'el mensaje del HEIC no dice qué pasó: ' + heicRes.cuerpo.error);

  // El tope, medido sobre los BYTES y no sobre el base64.
  const gorda = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(FOTO.MAX_BYTES + 1024, 7)]);
  const gordaRes = await subir(gorda);
  console.log('    foto de ' + Math.round(gorda.length / 1024) + ' KB → ' + gordaRes.res.statusCode);
  af(gordaRes.res.statusCode === 413, 'no frenó una foto por encima del tope');
  // Y una JUSTO por debajo sí pasa: el tope tiene que morder donde debe.
  const justa = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(FOTO.MAX_BYTES - 2048, 7)]);
  af((await subir(justa)).res.statusCode === 200, 'frenó una foto que cabe: el tope muerde de más');

  // ── [4c] 🔒 LO PRIVADO NO SALE POR NINGUNA PUERTA PÚBLICA ───────────────
  // Se mide sobre el JSON SERVIDO, no por grep del fuente: el comentario que
  // explica por qué un campo no está CONTIENE el nombre del campo.
  console.log('\n[4c] lo privado, en las respuestas públicas');
  const FILA = {
    id: 'r1', nombre: 'Ana Prueba', whatsapp: '8112345678', correo: 'a@b.com',
    ciudad: 'Reynosa', instagram: 'ana_secreta', foto_path: 'karolg-bbva-2026/abc.jpg',
    foto_estado: 'pendiente', creado_at: '2026-09-21T00:00:00Z',
  };
  async function llamar(archivo, ev) {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => [FILA], text: async () => JSON.stringify([FILA]),
      headers: { get: () => null } });
    delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', archivo))];
    const mod = require(path.join(RAIZ, 'netlify/functions', archivo));
    const r = await mod.handler(Object.assign({ httpMethod: 'GET', headers: { origin: 'https://conectareynosa.mx' } }, ev || {}));
    global.fetch = fetchReal2;
    return String(r.body || '');
  }
  for (const f of ['giveaway-estado.js']) {
    const cuerpo = await llamar(f);
    console.log('    ' + f + ' → ' + cuerpo.slice(0, 90));
    af(!/ana_secreta/.test(cuerpo), f + ' FILTRÓ el Instagram: ' + cuerpo.slice(0, 200));
    af(!/foto_path|abc\.jpg/.test(cuerpo), f + ' FILTRÓ la ruta de la foto: ' + cuerpo.slice(0, 200));
    af(!/8112345678/.test(cuerpo), f + ' filtró el WhatsApp');
  }

  // ── [5] LA PÁGINA, ABIERTA EN UN NAVEGADOR ──────────────────────────────
  console.log('\n[5] la página de registro');
  const { srv, puerto } = await servir();
  const nav = await chromium.launch();
  const page = await nav.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(`http://127.0.0.1:${puerto}/giveaway.html`, { waitUntil: 'load' });
  const txt = await page.evaluate(() => document.body.innerText);

  // 🔒 NI UN RASTRO DE NATANAEL. Se mide sobre el TEXTO PINTADO, no sobre el
  // fuente: un comentario que explique el cambio contiene la palabra vieja.
  af(!/Natanael/i.test(txt), 'quedó «Natanael» en la página: ' + (txt.match(/.{0,40}Natanael.{0,40}/) || [''])[0]);
  af(!/Tumbada/i.test(txt), 'quedó «Zona Tumbada» en la página');
  af(!/Walmart/i.test(txt), 'quedó «Estadio Walmart Park» en la página');
  af(/Karol G/i.test(txt), 'la página no nombra a Karol G');
  af(/Estadio BBVA/i.test(txt), 'la página no dice el venue');
  af(/Club Seat/i.test(txt), 'la página no dice el premio');
  af(/7 de noviembre/i.test(txt), 'la página no dice la fecha del premio, y el evento tiene tres');
  // La convención de la hora, en todos lados donde sale.
  af(/9:00 PM hora de Reynosa/i.test(txt) && /8:00 PM en Monterrey/i.test(txt),
     'la hora del sorteo no usa la convención «9:00 PM hora de Reynosa (8:00 PM en Monterrey)»');
  af(/1 de octubre/i.test(txt), 'la página no dice la fecha del sorteo');
  af(!/13 de septiembre/i.test(txt), 'quedó la fecha vieja del sorteo');
  // La zona la asigna Conecta (orden de Memo).
  af(/asigna Conecta seg[úu]n disponibilidad/i.test(txt),
     'las bases no dicen que la ZONA la asigna Conecta: Club Seat son DOS zonas en el catálogo');

  // ── [6] LOS TRES BOTONES DE REDES BLOQUEAN «PARTICIPAR» ─────────────────
  console.log('\n[6] el candado de las tres redes');
  try {
  const estado0 = await page.evaluate(() => {
    const b = document.getElementById('btn');
    const redes = [...document.querySelectorAll('[data-red]')].map((x) => x.getAttribute('data-red'));
    return { hayBtn: !!b, deshabilitado: b ? b.disabled : null, redes };
  });
  console.log('    botones de red: ' + JSON.stringify(estado0.redes) + ' · Participar deshabilitado: ' + estado0.deshabilitado);
  af(estado0.hayBtn, 'no encontré el botón `btn` (el de Participar)');
  af(estado0.redes.length === 3 && ['instagram', 'tiktok', 'facebook'].every((r) => estado0.redes.includes(r)),
     'faltan botones de red: ' + JSON.stringify(estado0.redes));
  af(estado0.deshabilitado === true, 'PARTICIPAR NACE HABILITADO: se puede registrar sin seguir a nadie');
  // Se pican DOS: sigue bloqueado. (Con uno solo el candado podría pasar por
  // casualidad; con dos se prueba que cuenta, no que exista.)
  const tras2 = await page.evaluate(() => {
    document.querySelector('[data-red="instagram"]').click();
    document.querySelector('[data-red="tiktok"]').click();
    return document.getElementById('btn').disabled;
  });
  af(tras2 === true, 'con DOS redes picadas ya se habilitó: el candado no cuenta las tres');
  const tras3 = await page.evaluate(() => {
    document.querySelector('[data-red="facebook"]').click();
    return { dis: document.getElementById('btn').disabled,
             palomitas: document.querySelectorAll('[data-red].ok').length };
  });
  console.log('    tras las tres: deshabilitado=' + tras3.dis + ' · palomitas=' + tras3.palomitas);
  af(tras3.dis === false, 'con las TRES picadas sigue bloqueado');
  af(tras3.palomitas === 3, 'las palomitas no se marcan: ' + tras3.palomitas + ' de 3');

  // 🔒 EL REGRESO DESDE LA APP DE INSTAGRAM. En celular, volver de la app
  // RECARGA la página: si los clics y lo escrito no sobreviven, la persona
  // pierde todo y no se vuelve a registrar. Se guarda en sessionStorage.
  console.log('\n    el regreso desde la app (recarga)');
  await page.evaluate(() => {
    document.getElementById('f-nombre').value = 'Prueba Regreso';
    document.getElementById('f-nombre').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('f-ciudad').value = 'Reynosa';
    document.getElementById('f-ciudad').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.reload({ waitUntil: 'load' });
  const trasRecarga = await page.evaluate(() => ({
    nombre: document.getElementById('f-nombre').value,
    ciudad: document.getElementById('f-ciudad').value,
    palomitas: document.querySelectorAll('[data-red].ok').length,
    dis: document.getElementById('btn').disabled,
  }));
  console.log('    tras recargar: nombre=' + JSON.stringify(trasRecarga.nombre)
    + ' palomitas=' + trasRecarga.palomitas + ' deshabilitado=' + trasRecarga.dis);
  af(trasRecarga.palomitas === 3, 'los clics de redes se perdieron al recargar: ' + trasRecarga.palomitas + ' de 3');
  af(trasRecarga.dis === false, 'tras volver de la app, Participar volvió a bloquearse');
  af(trasRecarga.nombre === 'Prueba Regreso' && trasRecarga.ciudad === 'Reynosa',
     'lo escrito se perdió al volver de la app: ' + JSON.stringify(trasRecarga));

  } catch (e) { af(false, 'la sección del candado de redes se CAYÓ: ' + e.message); }
  // ── [7] LA FOTO EN EL NAVEGADOR: comprime, endereza y sale JPEG ─────────
  // 🔒 LA ORIENTACIÓN ES EL CLÁSICO DE LAS FOTOS DE IPHONE: el giro va en el
  // EXIF, no en los píxeles, así que dibujar «tal cual» las saca ACOSTADAS.
  // Se prueba con un JPEG REAL que trae `Orientation = 6` (girar 90°): una
  // imagen ANCHA (20×10) con ese giro tiene que salir ALTA (10 de ancho, 20 de
  // alto). Si sale ancha, el EXIF se está ignorando.
  console.log('\n[7] la foto: compresión, orientación y formato');
  try {
    const salida = await page.evaluate(async () => {
      // Un JPEG mínimo de 20×10 con EXIF Orientation=6, armado a mano.
      function jpegConOrientacion(orient, w, h) {
        // Lienzo real → dataURL, y luego se le INYECTA el bloque EXIF: así los
        // píxeles son de verdad y el giro también.
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = '#c33'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#3c3'; g.fillRect(0, 0, Math.max(1, w >> 1), h);
        const b64 = c.toDataURL('image/jpeg', 0.9).split(',')[1];
        const bin = atob(b64); const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        // APP1/Exif con un solo IFD0: Orientation (0x0112), SHORT, valor.
        const exif = [];
        const push = (...x) => exif.push(...x);
        push(0xFF, 0xE1, 0x00, 0x20);                       // APP1, largo 32
        push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00);           // "Exif\0\0"
        push(0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08); // big-endian, IFD en 8
        push(0x00, 0x01);                                   // 1 entrada
        push(0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, (orient >> 8) & 0xFF, orient & 0xFF, 0x00, 0x00);
        push(0x00, 0x00, 0x00, 0x00);                       // siguiente IFD: ninguno
        const salida = new Uint8Array(2 + exif.length + (bytes.length - 2));
        salida.set([0xFF, 0xD8], 0);
        salida.set(exif, 2);
        salida.set(bytes.subarray(2), 2 + exif.length);
        return new File([salida], 'prueba.jpg', { type: 'image/jpeg' });
      }
      const file = jpegConOrientacion(6, 20, 10);           // ANCHA + girar 90°
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      const uri = c.toDataURL('image/jpeg', 0.8);
      return { w: bmp.width, h: bmp.height, mime: uri.slice(5, uri.indexOf(';')) };
    });
    console.log('    JPEG 20×10 con EXIF Orientation=6 → ' + salida.w + '×' + salida.h + ' · ' + salida.mime);
    af(salida.h > salida.w,
       'la foto salió ACOSTADA (' + salida.w + '×' + salida.h + '): el EXIF de orientación se está ignorando, '
       + 'que es justo lo que saca torcidas las fotos de iPhone');
    af(salida.mime === 'image/jpeg', 'la salida no es JPEG: ' + salida.mime);
  } catch (e) { af(false, 'la sección de orientación se CAYÓ: ' + e.message); }

  // Y el camino de la página: elegir una foto la comprime, la enseña y la sube.
  try {
    const r = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
      const g = c.getContext('2d');
      // Ruido, para que el JPEG no se comprima a nada y el caso sea realista.
      const im = g.createImageData(2400, 1600);
      for (let i = 0; i < im.data.length; i += 4) {
        im.data[i] = (i * 7) % 255; im.data[i + 1] = (i * 13) % 255; im.data[i + 2] = (i * 29) % 255; im.data[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95));
      const file = new File([blob], 'grande.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer(); dt.items.add(file);
      const inp = document.getElementById('f-foto');
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((res) => setTimeout(res, 1200));
      return {
        original: Math.round(blob.size / 1024),
        meta: (document.getElementById('foto-meta') || {}).textContent || '',
        previaVisible: !document.getElementById('foto-prev').hidden,
        src: ((document.getElementById('foto-img') || {}).src || '').slice(0, 24),
      };
    });
    console.log('    original ' + r.original + ' KB → ' + r.meta + ' · vista previa: ' + r.previaVisible);
    af(r.previaVisible, 'no se enseñó la vista previa de la foto');
    af(/^data:image\/jpeg/.test(r.src), 'la vista previa no es JPEG: ' + r.src);
    const mKB = /(\d+) KB/.exec(r.meta);
    af(!!mKB, 'no se dijo cuánto pesa la foto ya comprimida: ' + JSON.stringify(r.meta));
    if (mKB) {
      console.log('    comprimida a ' + mKB[1] + ' KB (meta 300, tope del servidor 1024)');
      af(Number(mKB[1]) <= 1024, 'la foto comprimida sigue por encima del tope del servidor: ' + mKB[1] + ' KB');
      af(Number(mKB[1]) < r.original, 'la compresión no bajó nada: ' + mKB[1] + ' KB de ' + r.original + ' KB');
    }
    const mLado = /(\d+)×(\d+)/.exec(r.meta);
    af(mLado && Math.max(Number(mLado[1]), Number(mLado[2])) <= 1080,
       'el lado mayor quedó por encima de 1080: ' + JSON.stringify(r.meta));
  } catch (e) { af(false, 'la sección de compresión se CAYÓ: ' + e.message); }

  af(errores.length === 0, 'la página tiró errores de JS: ' + JSON.stringify(errores.slice(0, 3)));
  await nav.close(); srv.close();

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); process.exit(1); });
