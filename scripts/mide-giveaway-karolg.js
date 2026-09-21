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
  af(errores.length === 0, 'la página tiró errores de JS: ' + JSON.stringify(errores.slice(0, 3)));
  await nav.close(); srv.close();

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); process.exit(1); });
