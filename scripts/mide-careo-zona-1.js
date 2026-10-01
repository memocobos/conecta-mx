#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-careo-zona-1.js — CAREO-ZONA-1 · zonas, filas partidas y rojas
//
// Encargo de Memo (30-sep-2026), `CAREO-ZONA-1-BRIEF.md`. Los fixtures son LOS
// CASOS DEL 30-SEP que el brief nombra, y su «después» se leyó de la base — las
// 28 correcciones se aplicaron A MANO ese día, así que el estado guardado es el
// RESULTADO ESPERADO:
//   · Ximena Ocañas (alvarodiaz#0)   zona_boleto NULL          ← todo «-»
//   · Abril Ruiz (frontera#1)        Preferente Platino, 2     ← cambio limpio
//   · Diana Loredo (natanael)        DOS filas, dinero en una  ← CHEAP partido
//   · Diana Marlene / Nohemi (karolg#1) boletos 0, zona NULL, abonado $5,500
//   · Karla Yamileth (juniorh)       3er Nivel Central, 2      ← misma zona, dos formas
//
// 🔒 LOS DOS LADOS SON COMMITS y se ENTRA POR EL HANDLER REAL
// (`admin-excel-aplicar`), simulando un salto más adentro: el Apps Script y
// PostgREST. Un mock por ruta salta al portero.
//
// 🔒 LA FASE DE VISTA PREVIA NO ESCRIBE NADA, y se mide contando métodos que no
// sean GET contra PostgREST — con su control positivo.
//
// Se corre:  npm run mide:careo-zona-1
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
  fallos.slice(0, 18).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || 'ae1ea3a';
const HEAD_SHA = process.env.HEAD_SHA || '12fef09';   // el commit del MERGE

// ── LA PESTAÑA · encabezado REAL, enteros ───────────────────────────────
// Copiado de la medición de CUADRE-1a (ocho pestañas reales por
// `_lib/cosecha-excel` contra el Apps Script de producción). Recortarlo a «las
// columnas que me importan» es fabricar una pestaña que no existe.
const CAB = ['No.','Nombre','Paquete','Boleto','Separo','1','2','3','4','5','6','7','8','9','10',
  'Preventa','Costo','Habitación','Pago Hab','Avión - Bus','Codigo','Total','Abonado','Resta','TALLA',
  'CORREO','CELULAR','EMERGENCIA','HABITACION COMPARTIDA CON','','','','','Luneta','$0','','Stay',''];
function filaExcel(valores) {
  const f = new Array(CAB.length).fill('');
  for (const [col, v] of Object.entries(valores)) {
    const i = CAB.indexOf(col);
    if (i < 0) throw new Error('el fixture nombra una columna que la cabecera no tiene: ' + col);
    f[i] = v;
  }
  return f;
}
// Los fondos: una matriz por fila. Blanco salvo lo que se pinte.
const BLANCO = '#ffffff';
function fondos(n, pintadas) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const hex = pintadas[i];
    out.push(new Array(CAB.length).fill(hex || BLANCO));
  }
  return out;
}
// 11 filas de preludio (el encabezado va en la 10, 0-based) y luego la gente.
const PRELUDIO = Array.from({ length: 10 }, () => new Array(CAB.length).fill(''));
const FILAS_GENTE = [
  // Ximena: sus DOS filas en «-» → no ocupa boleto de ninguna zona.
  filaExcel({ Nombre: 'Ximena Ocañas Bautista', Paquete: 'PLUS', Boleto: '-', Total: '$4,600' }),
  filaExcel({ Nombre: 'Ximena Ocañas Bautista', Paquete: 'PLUS', Boleto: '-' }),
  // Abril: cambio limpio de zona + conteo, en la misma pasada.
  filaExcel({ Nombre: 'Abril Ruiz Rosas', Paquete: 'CHEAP', Boleto: 'Preferente Platino', Total: '$2,200' }),
  filaExcel({ Nombre: 'Abril Ruiz Rosas', Paquete: 'CHEAP', Boleto: 'Preferente Platino' }),
  // Monserrat: MEZCLA — 1 Platino + 1 «-» son UN boleto, no dos.
  filaExcel({ Nombre: 'Monserrat Jiménez Vilchis', Paquete: 'PLUS', Boleto: 'Platino', Total: '$5,000' }),
  filaExcel({ Nombre: 'Monserrat Jiménez Vilchis', Paquete: 'PLUS', Boleto: '-' }),
  // Diana Loredo: CHEAP repartido en DOS zonas → se parte.
  filaExcel({ Nombre: 'Diana Loredo Mondragon', Paquete: 'CHEAP', Boleto: 'Tercer Nivel Primera Base', Total: '$4,200' }),
  filaExcel({ Nombre: 'Diana Loredo Mondragon', Paquete: 'CHEAP', Boleto: 'Tercer Nivel Primera Base' }),
  filaExcel({ Nombre: 'Diana Loredo Mondragon', Paquete: 'CHEAP', Boleto: 'Segundo Nivel Primera Base' }),
  // Diana Marlene: fila ROJA → baja, con el dinero intacto.
  filaExcel({ Nombre: 'Diana Marlene Hurtado López', Paquete: 'PLUS', Boleto: 'VIP A', Total: '$9,200' }),
  // Karla: la MISMA zona escrita de dos formas → solo conteo.
  filaExcel({ Nombre: 'Karla Yamileth Perez Espinoza', Paquete: 'CHEAP', Boleto: '3ER NIVEL CENTRAL', Total: '$4,200' }),
  filaExcel({ Nombre: 'Karla Yamileth Perez Espinoza', Paquete: 'CHEAP', Boleto: '3er Nivel Central' }),
  // Un PLUS repartido: sigue siendo AVISO, no se parte.
  filaExcel({ Nombre: 'Plus Repartido Ramirez', Paquete: 'PLUS', Boleto: 'VIP A', Total: '$9,000' }),
  filaExcel({ Nombre: 'Plus Repartido Ramirez', Paquete: 'PLUS', Boleto: 'Platino' }),
  // Una zona que la ficha NO tiene: no se aplica y se nombra.
  filaExcel({ Nombre: 'Zona Inventada Perez', Paquete: 'CHEAP', Boleto: 'Palco Fantasma', Total: '$1,000' }),
  // Un RESALTADO de UNA celda: NO es una cancelación (control del umbral).
  filaExcel({ Nombre: 'Resaltada Una Celda', Paquete: 'CHEAP', Boleto: 'Platino', Total: '$3,000' }),
];
const PESTANA = [...PRELUDIO, CAB, ...FILAS_GENTE];
// Los fondos de la pestaña: el preludio y el encabezado en blanco, y en la
// gente solo Diana Marlene pintada ENTERA y «Resaltada» con UNA celda.
const IDX_MARLENE = PRELUDIO.length + 1 + 9;
const IDX_RESALTADA = PRELUDIO.length + 1 + 15;
function fondosPestana() {
  const out = fondos(PESTANA.length, {});
  for (let c = 0; c < CAB.length; c++) out[IDX_MARLENE][c] = '#ea9999';   // fila entera
  out[IDX_RESALTADA][3] = '#ff0000';                                      // UNA celda
  return out;
}
// Cuántas celdas rojas por fila, como las contaría el .gs.
function rojasDe(fondosMat) {
  const esRojo = (hex) => {
    let h = String(hex || '').trim().toLowerCase();
    if (h.charAt(0) !== '#') return false;
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    if (h.length !== 7) return false;
    const r = parseInt(h.substr(1, 2), 16) / 255, g = parseInt(h.substr(3, 2), 16) / 255, b = parseInt(h.substr(5, 2), 16) / 255;
    if ([r, g, b].some((x) => Number.isNaN(x))) return false;
    return r >= 0.45 && g <= 0.70 && b <= 0.70 && (r - g) >= 0.20 && (r - b) >= 0.20;
  };
  return fondosMat.map((f) => f.filter(esRojo).length);
}

// ── EL LADO DEL SISTEMA · el «antes» del 30-sep ─────────────────────────
// 🔒 El «después» se leyó de la base (ya aplicado a mano); el «antes» es el que
// el brief describe. Se dice de dónde sale cada mitad en vez de mezclarlas.
const V = (id, nombre, zona, boletos, paquete, extra) => Object.assign({
  id, nombre, evento_id: 'natanael', zona_boleto: zona, boletos, tipo_paquete: paquete,
  tipo_viajero: 'cliente', abonado_previo: 0, total_contrato: null, notas: 'Migrado Excel 28-ago (Jane)',
}, extra || {});
const VIAJEROS = [
  V('v-xim', 'Ximena Ocañas Bautista', 'Perfil A', 1, 'PLUS'),
  V('v-abr', 'Abril Ruiz Rosas', 'Luneta Platino', 1, 'cheap'),
  V('v-mon', 'Monserrat Jiménez Vilchis', 'Platino', 2, 'PLUS'),
  V('v-dlo', 'Diana Loredo Mondragon', 'Tercer Nivel Primera Base', 2, 'CHEAP', { abonado_previo: 4200, total_contrato: 4200 }),
  V('v-dma', 'Diana Marlene Hurtado López', 'VIP A', 1, 'PLUS', { abonado_previo: 5500, total_contrato: 9200 }),
  V('v-kar', 'Karla Yamileth Perez Espinoza', '3er Nivel Central', 1, 'CHEAP'),
  V('v-plr', 'Plus Repartido Ramirez', 'VIP A', 1, 'PLUS'),
  V('v-inv', 'Zona Inventada Perez', 'Luneta A', 1, 'CHEAP'),
  V('v-res', 'Resaltada Una Celda', 'Platino', 1, 'CHEAP'),
];
// Las zonas de la ficha. 🔒 «Palco Fantasma» NO está: es el caso de la zona que
// la puerta tiene que rechazar.
const ZONAS_FICHA = ['Perfil A', 'Luneta Platino', 'Preferente Platino', 'Platino',
  'Tercer Nivel Primera Base', 'Segundo Nivel Primera Base', 'VIP A', '3er Nivel Central', 'Luneta A'];
const INDEX_EV = 'var EV=[' + JSON.stringify({
  id: 'natanael', a: 'Natanael Cano', f: '27 Nov', ds: '2026-11-27', v: 'Arena Monterrey, MTY', st: '',
  zonas: ZONAS_FICHA.map((n) => ({ n, p: 3000 })), inc: ['Boleto'], sep: 500,
}) + '];';

function armarRed(dir, { sinColores = false, saboteado = false, sinCatalogo = false } = {}) {
  const escrituras = [];
  const SB = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
  const filasRojas = rojasDe(fondosPestana());
  const BASE_DB = {
    excel_pestanas: [{ evento_id: 'natanael', pestana: 'Natanael Cano - 27 de Noviembre', regla_zona: null, activa: true, notas: null }],
    viajeros_evento: VIAJEROS,
    stock_ajustes: [],
    abonos_viajero: [],
    numerologia_eventos: [],
  };
  return { escrituras, filasRojas, fetchFalso: async (url, opts) => {
    const met = (opts && opts.method) || 'GET';
    if (/\/index\.html$/.test(String(url))) {
      if (sinCatalogo) throw new Error('la red falsa no sirve el catálogo en este escenario');
      return { ok: true, status: 200, text: async () => INDEX_EV, json: async () => ({}) };
    }
    if (String(url).startsWith('https://script.test')) {
      const cuerpo = JSON.parse(opts.body);
      if (!cuerpo.pestana) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, pestanas: ['Natanael Cano - 27 de Noviembre'] }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({
        ok: true, pestana: cuerpo.pestana, filas: PESTANA,
        rojas: sinColores ? undefined : filasRojas,
        colores_leidos: !sinColores,
        pestanas: ['Natanael Cano - 27 de Noviembre'],
      }) };
    }
    if (String(url).startsWith(SB)) {
      const u = new URL(url);
      const tabla = u.pathname.replace('/rest/v1/', '');
      if (met !== 'GET') {
        escrituras.push({ tabla, met, cuerpo: (() => { try { return JSON.parse(opts.body); } catch (_) { return null; } })() });
        return { ok: true, status: 201, json: async () => [], text: async () => '' };
      }
      if (saboteado && tabla === 'viajeros_evento') escrituras.push({ tabla, met: 'PATCH', cuerpo: null });
      let filas = BASE_DB[tabla] || [];
      for (const [campo, expr] of u.searchParams.entries()) {
        if (['select', 'limit', 'order', 'or'].includes(campo)) continue;
        let m;
        if ((m = /^eq\.(.*)$/.exec(expr))) { filas = filas.filter((f) => String(f[campo]) === m[1]); continue; }
        if ((m = /^is\.(.*)$/.exec(expr))) { const v = m[1] === 'true' ? true : m[1] === 'false' ? false : null; filas = filas.filter((f) => f[campo] === v); continue; }
        if ((m = /^in\.\((.*)\)$/.exec(expr))) {
          const vals = m[1].split(',').map((v) => decodeURIComponent(v).replace(/^"|"$/g, ''));
          filas = filas.filter((f) => vals.includes(String(f[campo]))); continue;
        }
        throw new Error('la red falsa no entiende el filtro: ' + campo + '=' + expr);
      }
      return { ok: true, status: 200, json: async () => filas, text: async () => '' };
    }
    throw new Error('la red falsa no conoce ese destino: ' + url);
  } };
}
async function correr(dir, opciones, cuerpo) {
  const red = armarRed(dir, opciones);
  process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec';
  process.env.EXCEL_SCRIPT_TOKEN = 't';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  process.env.URL = 'https://conectareynosa.mx';
  delete process.env.DEPLOY_PRIME_URL;
  global.fetch = red.fetchFalso;
  const va = require.resolve(path.join(dir, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async (ev, roles) => ({ valid: true, roles, user: { id: 'u1', correo: 'jane@x', nombre: 'Jane' } }),
  } };
  // 🔒 `catalogo-index` CACHEA el EV 10 min: sin este borrado, el primer
  // escenario que sirva el catálogo se lo REGALA a los que miden el fail-soft.
  for (const f of ['admin-excel-aplicar.js', '_lib/excel-careo.js', '_lib/cosecha-excel.js',
                   '_lib/excel-careo-correr.js', '_lib/excel-aplicar.js', '_lib/catalogo-index.js',
                   '_lib/precio-zona.js', '_lib/zona-ficha.js', '_lib/normalizar-zona.js']) {
    try { delete require.cache[require.resolve(path.join(dir, 'netlify/functions', f))]; } catch (_) {}
  }
  const mod = require(path.join(dir, 'netlify/functions/admin-excel-aplicar.js'));
  const res = await mod.handler({
    httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
    body: JSON.stringify(Object.assign({ evento_id: 'natanael' }, cuerpo || {})),
  });
  return { res, d: JSON.parse(res.body || '{}'), escrituras: red.escrituras, filasRojas: red.filasRojas };
}
const de = (plan, monton, nombre) => ((plan && plan[monton]) || []).find((x) => String(x.nombre).includes(nombre));

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'cz-base'), h = sacar(HEAD_SHA, 'cz-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }

  // ── [I] EL INSTRUMENTO ────────────────────────────────────────────────
  console.log('[I] el instrumento');
  const rH = await correr(h.dir, {});
  af(rH.res.statusCode === 200 && rH.d.ok === true, 'la vista previa no contestó 200/ok: ' + rH.res.body.slice(0, 240));
  af(rH.d.confirmado === false, 'la vista previa se dio por confirmada sola');
  const P = rH.d.plan || {};
  console.log('    montones → zonas ' + (P.zonas || []).length + ' · partidas ' + (P.partidas || []).length
    + ' · bajas ' + (P.bajas || []).length + ' · boletos ' + (P.boletos || []).length
    + ' · avisos_zonas ' + (P.avisos_zonas || []).length + ' · avisos_boletos ' + (P.avisos_boletos || []).length);
  // 🔒 El umbral del color se valida con un par CONOCIDO antes de creerle nada.
  console.log('    celdas rojas por fila (las que el .gs contaría): '
    + JSON.stringify(rH.filasRojas.filter((n) => n > 0)) + '  — la fila entera y el resaltado suelto');
  af(rH.filasRojas[IDX_MARLENE] === CAB.length,
     'el contador de rojas no ve la fila pintada ENTERA: ' + rH.filasRojas[IDX_MARLENE]);
  af(rH.filasRojas[IDX_RESALTADA] === 1,
     'el contador de rojas no ve el resaltado de UNA celda: ' + rH.filasRojas[IDX_RESALTADA]);

  // ── [X] XIMENA · todas sus filas en «-» ───────────────────────────────
  console.log('\n[X] Ximena: sus dos filas en «-»');
  const xim = de(P, 'zonas', 'Ximena');
  console.log('    ' + JSON.stringify(xim && { de: xim.de, a: xim.a, puerta: xim.estado_puerta, boletos: xim.boletos_a }));
  af(xim, 'Ximena no salió en el montón de zonas: su fila ocupa un Perfil que no tiene');
  af(xim && xim.a === null,
     '🔴 a Ximena no se le propone SIN ZONA: una fila con Boleto «-» no cuenta como boleto, y mientras '
     + 'ocupe «Perfil A» el index dice AGOTADO con un lugar libre. Salió ' + JSON.stringify(xim && xim.a));
  af(xim && xim.boletos_a === undefined,
     'se le propone un conteo de boletos: una fila «-» no es un número que escribir, y el estado aplicado '
     + 'el 30-sep dejó `boletos` como estaba. Inventar un 0 sería una decisión que nadie tomó');
  af(!de(P, 'boletos', 'Ximena'), 'Ximena salió TAMBIÉN en el montón de boletos: sería escribirle dos veces');

  // ── [A] ABRIL · el cambio limpio, con su conteo en la misma pasada ────
  console.log('\n[A] Abril: Luneta Platino → Preferente Platino');
  const abr = de(P, 'zonas', 'Abril');
  console.log('    ' + JSON.stringify(abr && { de: abr.de, a: abr.a, puerta: abr.estado_puerta, boletos: abr.boletos_de + '→' + abr.boletos_a }));
  af(abr && abr.de === 'Luneta Platino' && abr.a === 'Preferente Platino',
     'el cambio de zona de Abril no se propone: ' + JSON.stringify(abr));
  af(abr && abr.boletos_de === 1 && abr.boletos_a === 2,
     '🔴 el conteo NO viaja con el cambio de zona: eran dos avisos que se bloqueaban entre sí, y ese '
     + 'empate dejó 28 personas con boletos de menos el 30-sep. Salió ' + JSON.stringify(abr));
  af(abr && abr.estado_puerta === 'exacta', 'la puerta no la reconoció como exacta: ' + JSON.stringify(abr && abr.estado_puerta));

  // ── [M] MONSERRAT · la mezcla: 1 Platino + 1 «-» son UN boleto ────────
  console.log('\n[M] Monserrat: 1 Platino + 1 «-»');
  const mon = de(P, 'boletos', 'Monserrat');
  console.log('    ' + JSON.stringify(mon && { de: mon.de, a: mon.a, zona: mon.zona, guiones: mon.guiones }));
  af(mon && mon.a === 1,
     '🔴 el «-» se contó como boleto: 1 Platino + 1 «-» es UN boleto, no dos. Salió ' + JSON.stringify(mon && mon.a));
  af(mon && mon.guiones === 1, 'la fila «-» no se REPORTA: tiene que poder leerse sin abrir el Excel');
  af(!de(P, 'zonas', 'Monserrat'), 'se le propone cambiar la zona y su Platino ya coincide');

  // ── [D] DIANA LOREDO · el CHEAP repartido se PARTE ────────────────────
  console.log('\n[D] Diana Loredo: CHEAP en dos zonas');
  const dlo = de(P, 'partidas', 'Diana Loredo');
  console.log('    ' + JSON.stringify(dlo && { principal: dlo.principal, nuevas: dlo.nuevas }));
  af(dlo, '🔴 el CHEAP repartido no se parte: sigue siendo un aviso y el sistema no puede tener boletos en dos zonas');
  af(dlo && dlo.principal.zona === 'Tercer Nivel Primera Base' && dlo.principal.boletos === 2,
     'la PRINCIPAL no es la de más boletos: el dinero se queda ahí, así que elegirla mal mueve el dinero. '
     + JSON.stringify(dlo && dlo.principal));
  af(dlo && dlo.nuevas.length === 1 && dlo.nuevas[0].zona === 'Segundo Nivel Primera Base' && dlo.nuevas[0].boletos === 1,
     'la fila nueva no es la de Segundo Nivel con 1 boleto: ' + JSON.stringify(dlo && dlo.nuevas));
  // 🔒 Y el PLUS repartido NO se parte: lleva hotel y transporte dentro.
  const plr = de(P, 'avisos_boletos', 'Plus Repartido');
  af(!de(P, 'partidas', 'Plus Repartido') && plr,
     '🔴 un PLUS repartido se partió: lleva hotel y transporte dentro, así que es aviso para ojo humano. '
     + JSON.stringify(de(P, 'partidas', 'Plus Repartido')));
  af(plr && /NO es CHEAP/.test(plr.motivo), 'el aviso del PLUS no dice por qué no se parte: ' + JSON.stringify(plr && plr.motivo));

  // ── [R] LA FILA ROJA · la baja, con el dinero intacto ─────────────────
  console.log('\n[R] Diana Marlene: fila ROJA');
  const dma = de(P, 'bajas', 'Diana Marlene');
  console.log('    ' + JSON.stringify(dma && { de_zona: dma.de_zona, de_boletos: dma.de_boletos, abonado: dma.abonado }));
  af(dma, '🔴 la fila roja no se propone como baja: «todo lo marcado en rojo son cancelaciones» es regla firmada');
  af(dma && dma.abonado === 5500,
     'la baja no conserva el abonado: el dinero cobrado queda registrado — precedente medido, Diana Marlene '
     + 'y Nohemi conservan sus $5,500. Salió ' + JSON.stringify(dma && dma.abonado));
  af(!de(P, 'zonas', 'Diana Marlene') && !de(P, 'boletos', 'Diana Marlene') && !de(P, 'partidas', 'Diana Marlene'),
     'a una persona CANCELADA se le propone además cambiarle la zona o el conteo: la baja va primero y sola');
  // 🔒 EL CONTROL DEL UMBRAL: un resaltado de UNA celda NO es una cancelación.
  af(!de(P, 'bajas', 'Resaltada'),
     '🔴 un resaltado de UNA celda se volvió una BAJA: una o dos celdas pintadas son una nota, y una baja '
     + 'borra el lugar de una persona. El umbral es de ' + 3 + ' celdas y espera medición contra la pestaña real');
  // (El histograma del color se mide en [H], contra el careo: el detalle de la
  // pestaña no viaja dentro del plan.)

  // ── [K] KARLA · la misma zona escrita de dos formas ───────────────────
  console.log('\n[K] Karla: «3ER NIVEL CENTRAL» vs «3er Nivel Central»');
  const kar = de(P, 'boletos', 'Karla');
  console.log('    boletos ' + JSON.stringify(kar && { de: kar.de, a: kar.a })
    + ' · zonas ' + JSON.stringify(!!de(P, 'zonas', 'Karla')) + ' · partidas ' + JSON.stringify(!!de(P, 'partidas', 'Karla')));
  af(kar && kar.a === 2, 'el conteo de Karla no es 2: ' + JSON.stringify(kar));
  af(!de(P, 'partidas', 'Karla'),
     '🔴 Karla se PARTIÓ por una mayúscula: «3ER NIVEL CENTRAL» y «3er Nivel Central» son LA MISMA zona, '
     + 'así que no es un reparto — es solo el conteo. Una fila nueva por una mayúscula es dinero mal puesto');
  af(!de(P, 'zonas', 'Karla'), 'se le propone un cambio de zona y es la misma zona: ' + JSON.stringify(de(P, 'zonas', 'Karla')));

  // ── [P] LA PUERTA · la zona que la ficha NO tiene ─────────────────────
  console.log('\n[P] la puerta: una zona que la ficha no conoce');
  const inv = de(P, 'avisos_zonas', 'Zona Inventada');
  console.log('    ' + JSON.stringify(inv && { motivo: inv.motivo.slice(0, 70), estado: inv.estado_puerta }));
  af(inv, '🔴 «Palco Fantasma» no salió en los avisos: el careo no puede escribir una zona que la ficha no '
     + 'conoce, y callarlo es peor que no aplicarlo');
  af(!de(P, 'zonas', 'Zona Inventada'),
     '🔴 se propuso ESCRIBIR una zona que la ficha no tiene: DISPO-NORM-1 sigue siendo la ley');
  af(inv && /la ficha no tiene esa zona/.test(inv.motivo),
     'el aviso no dice el motivo real: ' + JSON.stringify(inv && inv.motivo));

  // ── [L] LA VISTA PREVIA NO ESCRIBE NADA ───────────────────────────────
  console.log('\n[L] cero escrituras en la vista previa');
  console.log('    escrituras: ' + JSON.stringify(rH.escrituras.map((e) => e.met + ' ' + e.tabla)));
  af(rH.escrituras.length === 0, '🔴 la VISTA PREVIA escribió: ' + JSON.stringify(rH.escrituras));
  const rSab = await correr(h.dir, { saboteado: true });
  af(rSab.escrituras.length > 0,
     'el contador de escrituras NO puede ponerse rojo, así que su cero de arriba no significa nada');

  // ── [C] AL CONFIRMAR · se escribe lo planeado, y nada más ─────────────
  console.log('\n[C] al confirmar');
  const rC = await correr(h.dir, {}, { confirmar: true });
  const esc = rC.escrituras;
  const porTabla = {};
  for (const e of esc) porTabla[e.met + ' ' + e.tabla] = (porTabla[e.met + ' ' + e.tabla] || 0) + 1;
  console.log('    ' + JSON.stringify(porTabla));
  af(rC.d.confirmado === true && rC.res.statusCode === 200, 'el confirmar no contestó ok: ' + rC.res.body.slice(0, 200));
  // La baja: boletos 0 y zona NULL, y el abonado NO se nombra.
  const patchs = esc.filter((e) => e.met === 'PATCH' && e.tabla === 'viajeros_evento').map((e) => e.cuerpo);
  const baja = patchs.find((c) => c && c.boletos === 0 && c.zona_boleto === null);
  console.log('    PATCH de la baja: ' + JSON.stringify(baja && Object.keys(baja)));
  af(baja, 'la baja no se escribió: ' + JSON.stringify(patchs));
  af(baja && !('abonado_previo' in baja) && !('total_contrato' in baja),
     '🔴 la baja TOCA el dinero: el abonado no se nombra, así que no se pisa — una baja no es una '
     + 'devolución. Escribió ' + JSON.stringify(Object.keys(baja || {})));
  af(baja && /CANCELADA \(fila roja del Excel\)/.test(String(baja.notas || '')),
     'la nota de la baja no dice que viene de una fila roja: ' + JSON.stringify(baja && baja.notas));
  // La zona de Ximena: NULL y sin tocar boletos.
  const ximP = patchs.find((c) => c && c.zona_boleto === null && !('boletos' in c));
  af(ximP, 'el PATCH de Ximena (zona NULL sin tocar boletos) no se escribió: ' + JSON.stringify(patchs));
  // La partida: PATCH a la principal y POST de la nueva, EN ESE ORDEN.
  const iPatchPrincipal = esc.findIndex((e) => e.met === 'PATCH' && e.cuerpo
    && e.cuerpo.zona_boleto === 'Tercer Nivel Primera Base' && e.cuerpo.boletos === 2);
  const iPostNueva = esc.findIndex((e) => e.met === 'POST' && e.tabla === 'viajeros_evento');
  console.log('    orden de la partida → PATCH principal @' + iPatchPrincipal + ' · POST nueva @' + iPostNueva);
  af(iPatchPrincipal >= 0 && iPostNueva >= 0,
     'la partida no se escribió completa: PATCH @' + iPatchPrincipal + ' POST @' + iPostNueva);
  af(iPatchPrincipal < iPostNueva,
     '🔴 LA FILA NUEVA SE INSERTÓ ANTES DE CORREGIR LA PRINCIPAL: un fallo a media partida dejaría los '
     + 'boletos DUPLICADOS —la vieja con su conteo entero más la nueva— y el stock cerraría zonas con lugar');
  const nueva = esc.find((e) => e.met === 'POST' && e.tabla === 'viajeros_evento');
  const cuerpoNueva = Array.isArray(nueva && nueva.cuerpo) ? nueva.cuerpo[0] : (nueva && nueva.cuerpo);
  console.log('    la fila nueva: ' + JSON.stringify(cuerpoNueva && {
    zona: cuerpoNueva.zona_boleto, boletos: cuerpoNueva.boletos,
    total: cuerpoNueva.total_contrato, abonado: cuerpoNueva.abonado_previo }));
  af(cuerpoNueva && cuerpoNueva.total_contrato === 0 && cuerpoNueva.abonado_previo === 0,
     '🔴 la fila nueva NACE CON DINERO: el dinero se queda entero en la principal, y repartirlo sería '
     + 'inventar cuánto pagó por cada boleto. Salió ' + JSON.stringify(cuerpoNueva));
  af(cuerpoNueva && /Fila partida/.test(String(cuerpoNueva.notas || ''))
     && /Tercer Nivel Primera Base/.test(String(cuerpoNueva.notas || '')),
     'la nota de la fila nueva no apunta a la principal: ' + JSON.stringify(cuerpoNueva && cuerpoNueva.notas));

  // ── [S] SIN COLORES · nadie es rojo, y se DICE ────────────────────────
  console.log('\n[S] sin colores leídos');
  const rSin = await correr(h.dir, { sinColores: true });
  console.log('    bajas: ' + ((rSin.d.plan || {}).bajas || []).length
    + ' · resumen.bajas: ' + ((rSin.d.resumen || {}).bajas));
  af(((rSin.d.plan || {}).bajas || []).length === 0,
     '🔴 sin poder leer los colores alguien salió como BAJA: «no sé» no puede volverse «canceló»');

  // ── [T] SIN CATÁLOGO · no se canoniza nada, y se DICE ─────────────────
  console.log('\n[T] sin catálogo');
  const rNc = await correr(h.dir, { sinCatalogo: true });
  const Pnc = rNc.d.plan || {};
  console.log('    zonas ' + (Pnc.zonas || []).length + ' · partidas ' + (Pnc.partidas || []).length
    + ' · sin_catalogo: ' + Pnc.zonas_sin_catalogo);
  af(Pnc.zonas_sin_catalogo === true,
     '🔴 el plan NO dice que el catálogo no se pudo leer: los montones de zona salen vacíos y ese vacío se '
     + 'lee como «no había nada que cambiar». Fingir que se validó es el hoyo de DISPO-NORM-1');
  af((Pnc.partidas || []).length === 0,
     'sin catálogo se partió una fila: escribir una zona sin validarla crea la que el sitio no conoce');
  // ⚠️ LO ÚNICO QUE SOBREVIVE SIN CATÁLOGO ES LIMPIAR LA ZONA, y es correcto:
  // poner `zona_boleto` en NULL no escribe ninguna zona, así que no hay nada que
  // validar — el caso Ximena sigue pudiéndose arreglar aunque el CDN tosa. Se
  // AFIRMA en vez de dejarlo ambiguo: un «1» en ese conteo tiene que poder
  // explicarse.
  af((Pnc.zonas || []).length === 1 && Pnc.zonas[0].a === null,
     'sin catálogo sobrevivió una propuesta de zona que NO es la de limpiar: '
     + JSON.stringify((Pnc.zonas || []).map((x) => ({ n: x.nombre, a: x.a }))));
  af((rNc.d.resumen || {}).zonas_sin_catalogo === true, 'el resumen de la pantalla no lo dice');

  // ── [B] CONTROL POSITIVO · BASE no sabe nada de esto ─────────────────
  console.log('\n[B] control positivo · BASE');
  const rB = await correr(b.dir, {});
  const PB = rB.d.plan || {};
  console.log('    BASE → zonas ' + ((PB.zonas || []).length) + ' · partidas ' + ((PB.partidas || []).length)
    + ' · bajas ' + ((PB.bajas || []).length) + ' · avisos_boletos ' + ((PB.avisos_boletos || []).length));
  af(rB.res.statusCode === 200, 'BASE no contestó 200: ' + rB.res.body.slice(0, 200));
  af(PB.zonas === undefined && PB.partidas === undefined && PB.bajas === undefined,
     'BASE ya traía los montones nuevos: entonces esta tuerca no los agrega y el verde de arriba no dice '
     + 'nada. Salió ' + JSON.stringify({ z: PB.zonas, p: PB.partidas, b: PB.bajas }));
  // 🔴 Y el EMPATE que la tuerca rompe: en BASE Abril y Diana Loredo son AVISOS.
  const avB = (PB.avisos_boletos || []).map((x) => x.nombre).join(' | ');
  console.log('    BASE avisos_boletos: ' + avB);
  af((PB.avisos_boletos || []).some((x) => /Abril/.test(x.nombre)),
     'CONTROL POSITIVO: en BASE Abril tenía que ser un AVISO que no se aplica (su zona no coincidía, así '
     + 'que su conteo tampoco se escribía). Si no, el empate no existía. Salió ' + avB);
  af((PB.avisos_boletos || []).some((x) => /Diana Loredo/.test(x.nombre)),
     'CONTROL POSITIVO: en BASE Diana Loredo tenía que ser un AVISO (CHEAP repartido sin poder partirse)');
  // Y en BASE el «-» se contaba como boleto: Ximena pedía 2.
  const ximB = (PB.boletos || []).find((x) => /Ximena/.test(x.nombre))
            || (PB.avisos_boletos || []).find((x) => /Ximena/.test(x.nombre));
  console.log('    BASE Ximena: ' + JSON.stringify(ximB && { de: ximB.de, a: ximB.a, motivo: (ximB.motivo || '').slice(0, 48) }));
  af(ximB, 'CONTROL POSITIVO: en BASE Ximena tenía que aparecer con el «-» contado como boleto');

  // ── [H] EL HISTOGRAMA DEL COLOR, que es lo que permite medir el umbral ─
  // 🔒 El umbral de fila ESPERA MEDICIÓN contra la pestaña real, así que el
  // careo devuelve el histograma por pestaña: se corrige con datos, no con una
  // opinión. Aquí se exige que VIAJE y que diga la verdad de este fixture.
  console.log('\n[H] el histograma de celdas rojas');
  const correrCareo = require(path.join(h.dir, 'netlify/functions/_lib/excel-careo-correr.js'));
  const red2 = armarRed(h.dir, {});
  global.fetch = red2.fetchFalso;
  for (const f of ['_lib/excel-careo-correr.js', '_lib/cosecha-excel.js', '_lib/excel-careo.js',
                   '_lib/catalogo-index.js', '_lib/zona-ficha.js']) {
    try { delete require.cache[require.resolve(path.join(h.dir, 'netlify/functions', f))]; } catch (_) {}
  }
  const cc = require(path.join(h.dir, 'netlify/functions/_lib/excel-careo-correr.js'));
  const careo = await (cc.correrCareo || cc)('natanael');
  const det2 = ((careo && careo.pestanas) || [])[0] || {};
  console.log('    ' + JSON.stringify({ colores_leidos: det2.colores_leidos, filas_rojas: det2.filas_rojas,
    umbral: det2.umbral_rojas, histograma: det2.histograma_rojas }));
  af(det2.colores_leidos === true, 'el detalle de la pestaña no dice que los colores se leyeron');
  af(det2.filas_rojas === 1, 'el conteo de filas rojas no es 1 (solo Diana Marlene): ' + det2.filas_rojas);
  af(det2.umbral_rojas === 3, 'el umbral no viaja con el detalle: sin él nadie sabe contra qué se midió');
  af(det2.histograma_rojas && det2.histograma_rojas['1'] === 1 && det2.histograma_rojas[String(CAB.length)] === 1,
     '🔴 el HISTOGRAMA no viaja o no dice la verdad: es lo único con lo que el umbral se puede corregir con '
     + 'datos en vez de con una opinión. Salió ' + JSON.stringify(det2.histograma_rojas));

  completo = true;
  process.exitCode = mal ? 1 : 0;
})();
