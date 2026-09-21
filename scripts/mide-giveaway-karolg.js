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
// El token del admin, para poder tocar las puertas privadas en la prueba.
// `tokenAdminValido` rehúsa TODO si la var está vacía — sin token configurado
// nada es válido, que es la postura correcta y por eso hay que ponerlo.
const TOKEN_PRUEBA = 'token-de-prueba-del-careo';
process.env.GIVEAWAY_ADMIN_TOKEN = TOKEN_PRUEBA;
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
  af(/^karolg-bbva-2026\/[a-f0-9]{12}\/[0-9a-f-]{16,}\.jpg$/.test(okSub.cuerpo.foto_path || ''),
     'el path no lo generó el servidor con su forma <slug>/<hash-de-ip>/<uuid>.jpg: ' + okSub.cuerpo.foto_path);
  // 🔒 LA IP NO SE ESCRIBE EN LA RUTA: se HASHEA. El bucket es privado, pero un
  // identificador de red en un nombre de archivo es un dato personal que no
  // hace falta guardar para poder contar.
  af(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(okSub.cuerpo.foto_path || ''),
     'la IP quedó escrita en la ruta: ' + okSub.cuerpo.foto_path);
  af(FOTO.prefijoDe('1.2.3.4') !== FOTO.prefijoDe('1.2.3.5'), 'dos IPs distintas dan el mismo prefijo: el freno contaría juntas a dos casas');
  af(FOTO.prefijoDe('1.2.3.4') === FOTO.prefijoDe('1.2.3.4'), 'la misma IP da prefijos distintos: el freno no contaría nada');
  // 🔒 EL PREFIJO LLEVA UN SECRETO DEL SERVIDOR. Un hash a secas de una IPv4
  // se revierte tabulando las 2³² direcciones —y la sal, si vive en el código,
  // es pública—. Se mide como HECHO: con OTRO secreto, la MISMA IP tiene que
  // dar OTRO prefijo. Si diera el mismo, el secreto no está en la cuenta.
  const secretoOriginal = process.env.GIVEAWAY_ADMIN_TOKEN;
  const conA = FOTO.prefijoDe('1.2.3.4');
  process.env.GIVEAWAY_ADMIN_TOKEN = secretoOriginal + '-otro';
  const conB = FOTO.prefijoDe('1.2.3.4');
  process.env.GIVEAWAY_ADMIN_TOKEN = secretoOriginal;
  console.log('    la misma IP con dos secretos: ' + conA + ' vs ' + conB);
  af(conA !== conB,
     'la MISMA IP da el mismo prefijo con otro secreto: el prefijo no lleva secreto, '
     + 'y un hash de IPv4 sin llave se revierte tabulando las 2³² direcciones');
  // Y sin secreto NO se cae a un hash simple: eso reintroduciría la debilidad
  // en silencio, viéndose igual de bien.
  process.env.GIVEAWAY_ADMIN_TOKEN = ''; process.env.JWT_SECRET = '';
  const sinSecreto = FOTO.prefijoDe('1.2.3.4');
  const subidaSin = await subir(jpegOk);
  process.env.GIVEAWAY_ADMIN_TOKEN = secretoOriginal;
  console.log('    sin secreto: prefijo=' + JSON.stringify(sinSecreto) + ' · subida → ' + subidaSin.res.statusCode);
  af(sinSecreto === null, 'sin secreto se cayó a un hash simple: la debilidad vuelve sin que nadie lo note');
  af(subidaSin.res.statusCode === 500 && subidaSin.cuerpo.codigo === 'SIN_SECRETO',
     'sin secreto la subida NO se rehúsa: ' + JSON.stringify(subidaSin.cuerpo));
  af(subidaSin.subido === null, 'sin secreto igual escribió en el bucket');

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

  // ── [4b2] LOS DOS ÚNICOS, CON SU PROPIO MENSAJE ─────────────────────────
  // Antes había un solo índice único y su texto decía «ese WhatsApp ya está
  // registrado». Con el de `foto_path` encima, ese mismo texto habría mandado a
  // la persona a revisar un WhatsApp que estaba bien.
  console.log('\n[4b2] los choques de índice único');
  async function registrar(detalleError) {
    global.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('/storage/v1/object/')) return { ok: true, status: 200, text: async () => '' };
      if ((opts && opts.method) === 'POST' && u.includes('/giveaway_registros')) {
        return { ok: false, status: 409, text: async () => detalleError, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
    };
    delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/giveaway-registro.js'))];
    const reg = require(path.join(RAIZ, 'netlify/functions/giveaway-registro.js'));
    const r = await reg.handler({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx' },
      body: JSON.stringify({ nombre: 'Ana Prueba', whatsapp: '8112345678', correo: 'a@b.com',
        ciudad: 'Reynosa', instagram: 'ana_ig', foto_path: 'karolg-bbva-2026/abcdef012345/uno.jpg', acepto: true }) });
    global.fetch = fetchReal2;
    return JSON.parse(r.body || '{}');
  }
  const choqueWa = await registrar('duplicate key value violates unique constraint "giveaway_registros_slug_whatsapp_key" (23505)');
  const choqueFoto = await registrar('duplicate key value violates unique constraint "giveaway_registros_foto_path_uniq" (23505)');
  console.log('    choque de WhatsApp → ' + choqueWa.error);
  console.log('    choque de foto     → ' + choqueFoto.error);
  af(/WhatsApp/i.test(choqueWa.error || ''), 'el choque de WhatsApp no lo dice: ' + choqueWa.error);
  af(/foto/i.test(choqueFoto.error || '') && !/WhatsApp/i.test(choqueFoto.error || ''),
     'el choque de FOTO manda a revisar el WhatsApp, que estaba bien: ' + choqueFoto.error);
  // Y la migración lleva el índice, con su `where` parcial.
  const sql = fs.readFileSync(path.join(RAIZ, 'migraciones/GIVEAWAY-KG-1-fotos.sql'), 'utf8');
  af(/create unique index[\s\S]*foto_path/.test(sql), 'la migración no crea el único de foto_path');
  af(/where foto_path is not null/.test(sql),
     'el único de foto_path no es PARCIAL: apilaría las ~600 filas viejas que lo tienen en NULL');

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
    const base = { httpMethod: 'GET', headers: { origin: 'https://conectareynosa.mx' } };
    const r = await mod.handler(Object.assign(base, ev || {}, ev && ev.headers ? { headers: ev.headers } : {}));
    global.fetch = fetchReal2;
    return String(r.body || '');
  }
  // Las TRES puertas que puede tocar cualquiera desde internet, y las dos
  // formas de la pública que devuelve nombres (los rodillos del sorteo).
  const PUERTAS = [
    ['giveaway-estado.js', {}],
    ['giveaway-estado.js', { queryStringParameters: { rodillos: '1' } }],
    ['giveaway-lista.js', {}],                                   // SIN token: debe rehusarse
    ['giveaway-sortear.js', { httpMethod: 'POST', body: JSON.stringify({ accion: 'padron' }) }],   // SIN token
  ];
  for (const [f, ev] of PUERTAS) {
    const cuerpo = await llamar(f, ev);
    const etiqueta = f + (ev.queryStringParameters ? ' (rodillos)' : ev.body ? ' (padron sin token)' : '');
    console.log('    ' + etiqueta.padEnd(38) + ' → ' + cuerpo.slice(0, 74));
    // 🔒 LOS TRES DATOS PRIVADOS, sobre el JSON SERVIDO. No por grep del
    // fuente: el comentario que explica por qué un campo no sale CONTIENE el
    // nombre del campo, y ya van cuatro veces que eso caza un arnés.
    af(!/ana_secreta/.test(cuerpo), etiqueta + ' FILTRÓ el Instagram: ' + cuerpo.slice(0, 200));
    af(!/foto_path|abc\.jpg|karolg-bbva-2026\//.test(cuerpo), etiqueta + ' FILTRÓ la ruta de la foto: ' + cuerpo.slice(0, 200));
    af(!/8112345678/.test(cuerpo), etiqueta + ' FILTRÓ el WhatsApp: ' + cuerpo.slice(0, 200));
    af(!/a@b\.com/.test(cuerpo), etiqueta + ' filtró el correo');
  }
  // Y el control positivo: por la puerta CON token, esos datos SÍ tienen que
  // salir. Si no salieran, los ceros de arriba no probarían nada — estarían
  // midiendo un endpoint que no devuelve nada de nada.
  const conToken = await llamar('giveaway-sortear.js',
    { httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', 'x-admin-token': TOKEN_PRUEBA },
      body: JSON.stringify({ accion: 'padron' }) });
  console.log('    con token (el admin)                  → ' + conToken.slice(0, 74));
  af(/ana_secreta/.test(conToken) && /8112345678/.test(conToken),
     'por la puerta CON token tampoco salen los datos: entonces las aserciones de arriba pasan en hueco');

  // ── [4d] 🔒 UNA FOTO INVALIDADA QUEDA FUERA DEL SORTEO ──────────────────
  // Y la exclusión va EN LA CONSULTA que alimenta el giro, no en un filtro del
  // navegador: es la misma razón por la que `eliminado_at=is.null` vive ahí
  // desde SORTEO-ADMIN-1. Un filtro de pantalla se salta con recargar.
  console.log('\n[4d] la exclusión del giro');
  {
    const PADRON = [
      { id: 'r-ok',   nombre: 'Aprobada Ana',  whatsapp: '8110000001', foto_estado: 'aprobada',   eliminado_at: null },
      { id: 'r-pend', nombre: 'Pendiente Beto', whatsapp: '8110000002', foto_estado: 'pendiente',  eliminado_at: null },
      { id: 'r-inv',  nombre: 'Invalidada Cris', whatsapp: '8110000003', foto_estado: 'invalidada', eliminado_at: null },
    ];
    let urlPadron = null;
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/giveaway_registros?')) {
        urlPadron = u;
        // La red falsa RESPETA el filtro: si la consulta no excluye, la fila
        // invalidada entra — que es justo lo que hay que poder ver.
        let filas = PADRON;
        const m = /foto_estado=neq\.([a-z]+)/.exec(u);
        if (m) filas = filas.filter((f) => f.foto_estado !== m[1]);
        if (/eliminado_at=is\.null/.test(u)) filas = filas.filter((f) => f.eliminado_at == null);
        return { ok: true, status: 200, json: async () => filas, text: async () => JSON.stringify(filas) };
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
    };
    delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/giveaway-sortear.js'))];
    const sortear = require(path.join(RAIZ, 'netlify/functions/giveaway-sortear.js'));
    const r = await sortear.handler({ httpMethod: 'POST',
      headers: { origin: 'https://conectareynosa.mx', 'x-admin-token': TOKEN_PRUEBA },
      body: JSON.stringify({ accion: 'girar' }) });
    global.fetch = fetchReal2;
    console.log('    la consulta del giro: ' + String(urlPadron || '').replace(/^.*giveaway_registros/, 'giveaway_registros').slice(0, 130));
    af(!!urlPadron, 'el giro no consultó el padrón: ' + r.statusCode + ' ' + String(r.body).slice(0, 120));
    // 🔒 Y SIN TOKEN NO SE GIRA. Se comprueba aquí porque la sección acaba de
    // usar el token bueno: si el portero no mordiera, todo lo de arriba se
    // estaría midiendo por una puerta abierta.
    global.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' });
    const sinTok = await sortear.handler({ httpMethod: 'POST',
      headers: { origin: 'https://conectareynosa.mx' }, body: JSON.stringify({ accion: 'girar' }) });
    global.fetch = fetchReal2;
    af(sinTok.statusCode === 401, 'se puede GIRAR sin token: ' + sinTok.statusCode);
    af(/foto_estado=neq\.invalidada/.test(urlPadron || ''),
       'LA CONSULTA DEL GIRO NO EXCLUYE LAS INVALIDADAS: una foto declinada seguiría pudiendo ganar. '
       + 'Consulta: ' + String(urlPadron).slice(-120));
    af(/eliminado_at=is\.null/.test(urlPadron || ''),
       'se perdió el `eliminado_at=is.null` de SORTEO-ADMIN-1 al meter el filtro nuevo');
    void r;
  }

  // ── [4e] LA REVISIÓN: reversible, y con su URL que caduca ───────────────
  console.log('\n[4e] la cuadrícula de revisión');
  {
    const patches = [];
    let firmaPedida = null;
    const red = async (url, opts) => {
      const u = String(url), met = (opts && opts.method) || 'GET';
      if (u.includes('/storage/v1/object/sign/')) {
        firmaPedida = JSON.parse(opts.body || '{}');
        return { ok: true, status: 200, json: async () => ({ signedURL: '/object/sign/x?token=t' }), text: async () => '' };
      }
      if (met === 'PATCH') { patches.push({ url: u, cuerpo: JSON.parse(opts.body || '{}') });
        return { ok: true, status: 200, json: async () => [{ id: 'r1' }], text: async () => '' }; }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
    };
    async function admin(cuerpo) {
      global.fetch = red;
      delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/giveaway-sortear.js'))];
      const m = require(path.join(RAIZ, 'netlify/functions/giveaway-sortear.js'));
      const r = await m.handler({ httpMethod: 'POST',
        headers: { origin: 'https://conectareynosa.mx', 'x-admin-token': TOKEN_PRUEBA },
        body: JSON.stringify(cuerpo) });
      global.fetch = fetchReal2;
      return JSON.parse(r.body || '{}');
    }

    // 🔒 REVERSIBLE: los tres estados son el mismo movimiento. Un dedazo en el
    // teléfono no puede sacar a nadie del concurso.
    for (const est of ['invalidada', 'aprobada', 'pendiente']) {
      const r = await admin({ accion: 'revisar_foto', id: 'r1', estado: est });
      af(r.ok === true && r.estado === est, 'no se pudo poner el estado ' + est + ': ' + JSON.stringify(r));
    }
    console.log('    los tres estados se pueden poner: ' + patches.map((p2) => p2.cuerpo.foto_estado).join(' → '));
    af(patches.length === 3, 'no se hicieron los tres PATCH: ' + patches.length);
    af(patches.every((p2) => Object.keys(p2.cuerpo).length === 1 && 'foto_estado' in p2.cuerpo),
       'un PATCH de revisión tocó algo más que el estado: ' + JSON.stringify(patches.map((p2) => Object.keys(p2.cuerpo))));
    af(patches.every((p2) => /slug=eq\./.test(p2.url)),
       'el PATCH de revisión no filtra por slug: podría tocar a alguien de OTRO giveaway');
    // Un estado inventado se rehúsa: el typo «invalidado» dejaría a alguien
    // DENTRO del sorteo creyendo que quedó fuera.
    const malEstado = await admin({ accion: 'revisar_foto', id: 'r1', estado: 'invalidado' });
    af(malEstado.ok === false, 'aceptó el estado «invalidado» (typo): el giro excluye por el valor EXACTO');

    // La URL de la foto caduca.
    const firma = await admin({ accion: 'foto_url', foto_path: 'karolg-bbva-2026/abcdef012345/uno.jpg' });
    console.log('    la firma pedida: ' + JSON.stringify(firmaPedida) + ' → ' + (firma.url || '').slice(0, 40));
    af(firma.ok === true && !!firma.url, 'no se pudo firmar la foto: ' + JSON.stringify(firma));
    af(firmaPedida && firmaPedida.expiresIn > 0 && firmaPedida.expiresIn <= 900,
       'la URL de la foto no caduca pronto (' + JSON.stringify(firmaPedida) + '): una que no caduca es una foto pública con pasos extra');
    // Y una ruta inventada no se firma.
    const mala = await admin({ accion: 'foto_url', foto_path: '../../otra-cosa.jpg' });
    af(mala.ok === false, 'firmó una ruta con «../»');
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

  // ── [8] LA CUADRÍCULA DE REVISIÓN, EN EL NAVEGADOR ──────────────────────
  // Se abre /sorteo, se le da el token y se pintan fotos de mentira por la red:
  // el DOM que sale es el que Memo va a tocar con el pulgar.
  console.log('\n[8] la cuadrícula de revisión');
  try {
    const page2 = await nav.newPage();
    const errores2 = [];
    page2.on('pageerror', (e) => errores2.push(e.message));
    const PADRON = [
      { id: 'p1', nombre: 'Ana Pendiente', ciudad: 'Reynosa', whatsapp: '8111111111', instagram: 'ana_ig', foto_path: 'karolg-bbva-2026/aaaaaaaaaaaa/1.jpg', foto_estado: 'pendiente', eliminado_at: null },
      { id: 'p2', nombre: 'Beto Aprobado', ciudad: 'Monterrey', whatsapp: '8122222222', instagram: 'beto_ig', foto_path: 'karolg-bbva-2026/bbbbbbbbbbbb/2.jpg', foto_estado: 'aprobada', eliminado_at: null },
      { id: 'p3', nombre: 'Cris Invalidada', ciudad: 'Río Bravo', whatsapp: '8133333333', instagram: 'cris_ig', foto_path: 'karolg-bbva-2026/cccccccccccc/3.jpg', foto_estado: 'invalidada', eliminado_at: null },
      { id: 'p4', nombre: 'Dora Eliminada', ciudad: 'Reynosa', whatsapp: '8144444444', instagram: 'dora_ig', foto_path: 'karolg-bbva-2026/dddddddddddd/4.jpg', foto_estado: 'pendiente', eliminado_at: '2026-09-20T00:00:00Z' },
    ];
    const mandados = [];
    await page2.route('**/.netlify/functions/giveaway-sortear', async (route) => {
      const b = JSON.parse(route.request().postData() || '{}');
      mandados.push(b);
      let j = { ok: true };
      if (b.accion === 'padron') j = { ok: true, participantes: PADRON };
      else if (b.accion === 'foto_url') j = { ok: true, url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' };
      else if (b.accion === 'revisar_foto') j = { ok: true, tocadas: 1, estado: b.estado };
      else if (b.accion === 'pendientes_foto') j = { ok: true, pendientes: 2 };
      else if (b.accion === 'fotos_huerfanas') j = { ok: true, huerfanas: 3, horas: 6, en_bucket: 9, usadas: 6 };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
    });
    await page2.route('**/.netlify/functions/giveaway-estado*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, total: 4, sorteos: [], registro_cerrado: true }) }));
    await page2.goto(`http://127.0.0.1:${puerto}/sorteo.html`, { waitUntil: 'load' });

    const abierto = await page2.evaluate(async () => {
      // El token se mete como lo mete un humano: por el formulario.
      // El token se mete COMO LO MENTE UN HUMANO: se escribe y se da Enter.
      // (No hay botón: la puerta es un input suelto. Buscar uno inventado
      // dejaba el TOKEN en null y el botón de girar se rehusaba en silencio —
      // el aviso de pendientes nunca salía y el caso pasaba en hueco.)
      const t = document.getElementById('tok');
      if (!t) return { falta: 'tok' };
      t.value = 'token-de-prueba-del-careo';
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      const vf = document.getElementById('ver-fotos');
      if (!vf) return { falta: 'ver-fotos' };
      if (document.getElementById('puerta').style.display !== 'none') return { falta: 'la puerta no se abrió con el token' };
      vf.click();
      await new Promise((r) => setTimeout(r, 400));
      return {
        tarjetas: document.querySelectorAll('#fotos-grid .fcard').length,
        resumen: (document.getElementById('fotos-resumen') || {}).textContent || '',
        badge: (document.getElementById('fotos-badge') || {}).textContent || '',
        filtros: [...document.querySelectorAll('#fotos-filtros .ffil')].map((b) => b.textContent.trim()),
      };
    });
    console.log('    ' + JSON.stringify(abierto));
    af(!abierto.falta, 'no apareció el botón de revisar fotos: ' + abierto.falta);
    // Filtro por defecto: PENDIENTES. Es lo que hay que mirar, y abrir en
    // «todas» esconde el trabajo entre las ya resueltas.
    af(abierto.tarjetas === 1, 'el filtro no abre en pendientes: salieron ' + abierto.tarjetas + ' tarjeta(s)');
    // 🔒 LA ELIMINADA NO SE REVISA: ya está fuera por otra puerta, y enseñarla
    // invita a «arreglarla» con un botón que no es el suyo.
    af(/2 pendientes/.test(abierto.resumen) === false && /1 pendientes|1 pendiente/.test(abierto.resumen),
       'la persona ELIMINADA se coló al conteo: ' + abierto.resumen);
    af(abierto.badge === '1', 'el contador de pendientes dice ' + JSON.stringify(abierto.badge));
    af(abierto.filtros.length === 4, 'faltan filtros: ' + JSON.stringify(abierto.filtros));

    // Lo que la tarjeta enseña, y el link al perfil.
    const tarjeta = await page2.evaluate(() => {
      const c = document.querySelector('#fotos-grid .fcard');
      return { txt: c.innerText, ig: (c.querySelector('a') || {}).href || '', img: !!(c.querySelector('img') || {}).src };
    });
    af(/Ana Pendiente/.test(tarjeta.txt) && /Reynosa/.test(tarjeta.txt) && /8111111111/.test(tarjeta.txt),
       'la tarjeta no trae nombre, ciudad o WhatsApp: ' + JSON.stringify(tarjeta.txt));
    af(/instagram\.com\/ana_ig/.test(tarjeta.ig), 'el Instagram no enlaza al perfil: ' + tarjeta.ig);
    af(tarjeta.img, 'la foto no se pidió con su URL firmada');
    af(mandados.some((m) => m.accion === 'foto_url'), 'no se pidió ninguna URL firmada');

    // 🔒 REVERSIBLE DESDE LA PANTALLA.
    const trasInvalidar = await page2.evaluate(async () => {
      document.querySelector('#fotos-grid .fcard .facc.no').click();
      await new Promise((r) => setTimeout(r, 250));
      const b = document.querySelector('[data-fil="invalidada"]'); b.click();
      await new Promise((r) => setTimeout(r, 150));
      const c = document.querySelector('#fotos-grid .fcard');
      return { hay: !!c, deshacer: !!(c && [...c.querySelectorAll('.facc')].some((x) => x.dataset.est === 'pendiente')) };
    });
    console.log('    tras invalidar: aparece en el filtro de invalidadas=' + trasInvalidar.hay
      + ' · con botón de deshacer=' + trasInvalidar.deshacer);
    af(trasInvalidar.hay, 'la invalidada no aparece en su filtro');
    af(trasInvalidar.deshacer, 'NO HAY CÓMO DESHACER una invalidación: un dedazo sacaría a alguien del concurso');

    // El aviso antes de girar: avisa y pide confirmar, NO bloquea.
    // ⚠️ El `confirm` sale DESPUÉS de que `evaluate` regresa: el aviso cuelga de
    // un `.then()`, no del clic. Esperarlo con un `sleep` dentro del evaluate
    // lo perdía —salía vacío y el caso pasaba en hueco—. Se espera el EVENTO.
    let preguntado = null;
    const esperaDialogo = new Promise((res) => {
      page2.once('dialog', async (d) => { preguntado = d.message(); await d.dismiss(); res(); });
      setTimeout(res, 3000);
    });
    await page2.evaluate(() => document.getElementById('girar').click());
    await esperaDialogo;
    console.log('    al girar preguntó: ' + JSON.stringify(String(preguntado || '').slice(0, 60)));
    af(/2 foto/.test(String(preguntado || '')), 'no avisó cuántas fotos quedan sin revisar: ' + preguntado);
    af(/todos modos|de todas/i.test(String(preguntado || '')), 'el aviso no ofrece girar igual: bloquear no era la orden');
    // Y al decir que NO, no giró.
    af(!mandados.some((m) => m.accion === 'girar'), 'giró aunque se dijo que no en el aviso');

    af(errores2.length === 0, '/sorteo tiró errores de JS: ' + JSON.stringify(errores2.slice(0, 3)));
    await page2.close();
  } catch (e) { af(false, 'la sección de la cuadrícula se CAYÓ: ' + e.message); }

  af(errores.length === 0, 'la página tiró errores de JS: ' + JSON.stringify(errores.slice(0, 3)));
  await nav.close(); srv.close();

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); process.exit(1); });
