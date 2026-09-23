#!/usr/bin/env node
// =============================================================================
// VIGÍA VIVO · /rol y los precios · `precios-vigentes` en los DOS sitios
// =============================================================================
// Entra por donde entra /rol: POST al endpoint `precios-vigentes` DESPLEGADO.
// No requiere el lib, no simula la base y no arma estado a mano — los dos lados
// leen las filas reales de `precios_historial`.
//
//   BASE = producción                 (lo que el cliente ve HOY)
//   HEAD = el sitio candidato          (el deploy preview de la PR)
//
// ⚰️ ESTO ERA UN CAREO BASE↔HEAD DE ROL-HIST-PADRE-1, Y CADUCÓ ENTERO.
//
// Su forma vieja exigía que BASE estuviera ROTO: el bloque [B] pedía
// `sin_historial:true` en las llaves huérfanas y el [C] que BASE cotizara el
// precio de HOY, porque cuando se escribió la rampa al padre sólo vivía en el
// preview. **El día que #732 se mergeó, ese «antes» desapareció** y el vigía
// empezó a dar 348 rojos que no eran del código: 252 comparaciones diferían
// POR CONSTRUCCIÓN (quitaba `LLAVES_NUEVAS` de un solo lado) y el control
// positivo de [B] ya no podía pasar nunca más.
//
// 🔒 LA LEY QUE DEJÓ: un careo BASE↔HEAD donde BASE es «producción» tiene fecha
// de caducidad EL DÍA DE SU PROPIO MERGE. Con dos commits el par se congela;
// con un sitio vivo, el «antes» se va en cuanto la tuerca sale.
//
// Decisión de Memo (22-sep): revive como VIGILANTE VIVO, guardia permanente.
// No hay lado «roto»: los dos sitios tienen que contestar **IGUAL**, y las
// `LLAVES_NUEVAS` entran al CONTRATO de comparación en vez de quitarse.
//
// CUATRO BLOQUES:
//   [I] validación del instrumento — un caso que SE SABE que existe. Si esto no
//       contesta lo esperado, todo lo de abajo miente y el vigía se detiene.
//   [S] control positivo por SABOTAJE LOCAL — se muta una respuesta REAL y se
//       exige que el comparador lo CACE. Es el único control positivo honesto
//       aquí: el de antes era un pasado que ya no existe.
//   [V] IGUALDAD VIVA — las 344 llaves del universo tienen que contestar
//       byte a byte igual en los dos sitios, TODAS las claves incluidas.
//   [L] LA LÍNEA BASE — la FORMA de la respuesta (su juego de claves) y los
//       valores de dos testigos firmados. Sólo se mueve cuando un cambio de
//       precio o de forma se APRUEBA, y el vigía lo dice con esas palabras.
//
// El universo NO se inventa: `vigia-rol-hist-padre.universo.json` se generó
// desde la tabla real y fija QUÉ se pregunta. Las RESPUESTAS las recomputan los
// dos lados en cada corrida — el fixture es el catálogo, no la foto.
//
// Se corre:  HEAD_URL=<preview> npm run vigia:rol-vivo
// =============================================================================

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'https://conectareynosa.mx';
const HEAD = process.env.HEAD_URL;
if (!HEAD) { console.error('Falta HEAD_URL (el deploy preview de la PR).'); process.exit(2); }
if (HEAD === BASE) { console.error('BASE y HEAD son el mismo sitio: no hay careo.'); process.exit(2); }

const universo = JSON.parse(fs.readFileSync(path.join(__dirname, 'vigia-rol-hist-padre.universo.json'), 'utf8'));

// 🔒 EL CONTRATO DE LA FORMA. Estas cuatro llaves las estrenó ROL-HIST-PADRE-1
// y el vigía viejo las QUITABA de un lado para comparar; hoy están en los DOS
// sitios y entran al contrato: si una falta o sobra, la forma cambió y eso pide
// aprobación, no un parche.
const CONTRATO = ['ok', 'evento_id', 'ambito', 'zona', 'fecha', 'tz', 'heredado',
  'llave_usada', 'sin_historial', 'anterior_al_historial', 'al_abrir', 'cambios',
  'dia', 'filas_historial', 'filas_historial_padre', 'padre_error', 'catalogo_error'];

let ok = 0, mal = 0;
const fallos = [];
function afirmar(cond, etiqueta, detalle) {
  if (cond) { ok++; return true; }
  mal++; fallos.push(etiqueta + (detalle ? ' · ' + detalle : ''));
  return false;
}

async function preguntar(sitio, p) {
  const r = await fetch(sitio + '/.netlify/functions/precios-vigentes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evento_id: p.evento_id, ambito: p.ambito, zona: p.zona, fecha: p.fecha }),
  });
  return { status: r.status, cuerpo: await r.json() };
}

// Comparación estable: mismas llaves, mismo orden, mismo contenido.
// 🔒 NO SE QUITA NINGUNA CLAVE. El vigía viejo quitaba `LLAVES_NUEVAS` de HEAD
// y no de BASE, y ése era el origen de los 252 «distintas»: la comparación
// mentía por construcción. Aquí se comparan ENTERAS.
const estable = (o) => JSON.stringify(o, Object.keys(o).sort());
const llaves = (o) => Object.keys(o || {}).sort();
const opciones = (j) => (j.al_abrir ? 1 : 0) + (j.cambios || []).length;

(async () => {
  console.log('CAREO ROL-HIST-PADRE-1');
  console.log('  BASE:', BASE);
  console.log('  HEAD:', HEAD);
  console.log('');

  // ── [I] VALIDACIÓN DEL INSTRUMENTO ─────────────────────────────────────────
  // Antes de creerle una AUSENCIA a este arnés, se le hace contestar algo que se
  // sabe que existe: la llave PADRE de omar el 28-ago tiene tres precios, y los
  // tenía ya en BASE. Si esto falla, el instrumento no está midiendo el sitio.
  console.log('[I] validación del instrumento');
  const testigo = { evento_id: 'omar', ambito: 'cheapZonas', zona: 'Beyond Pit', fecha: '2026-08-28' };
  for (const [nombre, sitio] of [['BASE', BASE], ['HEAD', HEAD]]) {
    const r = await preguntar(sitio, testigo);
    const j = r.cuerpo;
    const horas = (j.cambios || []).map((c) => c.hora).join(' · ');
    afirmar(j.ok === true && opciones(j) === 3 && j.al_abrir.precio === 3400 && horas === '12:50 · 16:07',
      'I·' + nombre + ' el testigo conocido contesta 3 precios',
      'opciones=' + opciones(j) + ' al_abrir=' + (j.al_abrir && j.al_abrir.precio) + ' horas=' + horas);
    console.log('    ' + nombre + ': ' + opciones(j) + ' precios · al_abrir ' + (j.al_abrir && j.al_abrir.precio) + ' · ' + horas);
  }
  if (mal) { console.log('\n  ⛔ el instrumento no pasa su propia prueba. Se detiene.'); process.exit(1); }

  // ── [S] CONTROL POSITIVO POR SABOTAJE LOCAL ────────────────────────────────
  // 🔒 ANTES DE CREERLE UNA IGUALDAD, EL COMPARADOR TIENE QUE PODER VER UNA
  // DIFERENCIA. El control positivo viejo era «BASE está roto», y eso dejó de
  // existir el día del merge; éste no puede caducar porque no depende de
  // ningún pasado: se toma una respuesta REAL, se le muta un campo aquí mismo,
  // y se exige que el comparador lo cace. Si no lo caza, los 344 verdes de
  // abajo no dicen nada.
  console.log('\n[S] control positivo · el comparador ve un sabotaje local');
  {
    const real = (await preguntar(HEAD, universo.A[0])).cuerpo;
    afirmar(estable(real) === estable(real), 'S·una respuesta es igual a sí misma');
    const sab1 = JSON.parse(JSON.stringify(real));
    if (sab1.al_abrir) sab1.al_abrir.precio = (sab1.al_abrir.precio || 0) + 1;
    afirmar(estable(sab1) !== estable(real), 'S·caza un PRECIO cambiado en un peso');
    const sab2 = JSON.parse(JSON.stringify(real));
    delete sab2.heredado;
    afirmar(estable(sab2) !== estable(real),
      'S·caza una CLAVE que falta (era lo que el vigía viejo se quitaba solo)');
    const sab3 = JSON.parse(JSON.stringify(real));
    sab3.cambios = (sab3.cambios || []).concat([{ precio: 1, cerrada: false, aplicable: true, hora: '00:00' }]);
    afirmar(estable(sab3) !== estable(real), 'S·caza un cambio de precio AÑADIDO');
    const sab4 = JSON.parse(JSON.stringify(real));
    sab4.tz = 'America/Cancun';
    afirmar(estable(sab4) !== estable(real), 'S·caza el HUSO cambiado');
    console.log('    cuatro sabotajes, cuatro cazados');
  }

  // ── [V] IGUALDAD VIVA · LOS DOS SITIOS CONTESTAN LO MISMO ──────────────────
  //
  // 🔒 UN SOLO UNIVERSO. Antes eran dos bloques —[A] «las que saben hablar» y
  // [B] «las huérfanas»— porque cada uno esperaba algo DISTINTO de cada lado.
  // Sin lado roto esa división no significa nada: las 344 llaves tienen que
  // contestar IGUAL, y punto. El bloque [B] se retira con su razón escrita en
  // la cabecera; su universo sigue aquí, dentro de este.
  console.log('\n[V] igualdad viva · las dos sitios contestan byte a byte igual');
  const TODAS = universo.A.concat(universo.B);
  let iguales = 0, distintas = 0;
  const ejemplos = [];
  for (const p of TODAS) {
    const [b, h] = await Promise.all([preguntar(BASE, p), preguntar(HEAD, p)]);
    const etq = p.evento_id + '/' + p.ambito + '/' + p.zona + '/' + p.fecha;
    // Premisa: los dos lados tienen que HABER CONTESTADO. Un 500 en los dos da
    // cuerpos «iguales» y eso no es una igualdad, es un apagón.
    if (!afirmar(b.status === 200 && h.status === 200 && b.cuerpo.ok === true && h.cuerpo.ok === true,
      'V·premisa: alguno de los dos no contestó', etq + ' base=' + b.status + ' head=' + h.status)) continue;
    if (estable(h.cuerpo) === estable(b.cuerpo)) iguales++;
    else {
      distintas++;
      // Se dice EN QUÉ difieren, no solo que difieren: sin eso, quien lea el
      // rojo no sabe si fue un precio, una clave o el huso.
      const dif = [...new Set(llaves(b.cuerpo).concat(llaves(h.cuerpo)))]
        .filter((k) => JSON.stringify(b.cuerpo[k]) !== JSON.stringify(h.cuerpo[k]));
      if (ejemplos.length < 6) ejemplos.push(etq + ' → ' + dif.join(','));
      afirmar(false, 'V·los dos sitios NO contestan igual', etq + ' · difieren en: ' + dif.join(','));
    }
    // 🔒 Y LA FORMA, llave por llave: una clave nueva o ausente cambia el
    // contrato aunque los valores cuadren.
    const faltanB = CONTRATO.filter((k) => !(k in b.cuerpo));
    const sobranH = llaves(h.cuerpo).filter((k) => CONTRATO.indexOf(k) === -1);
    afirmar(faltanB.length === 0,
      'V·producción no trae claves del contrato', etq + ' faltan: ' + faltanB.join(','));
    afirmar(sobranH.length === 0,
      'V·el candidato trae claves FUERA del contrato — la forma cambió y eso se APRUEBA, no se parchea',
      etq + ' sobran: ' + sobranH.join(','));
  }
  afirmar(TODAS.length > 0, 'V·cardinalidad: el universo no puede estar vacío');
  afirmar(iguales === TODAS.length, 'V·todas iguales', iguales + '/' + TODAS.length);
  console.log('    ' + iguales + ' de ' + TODAS.length + ' idénticas · ' + distintas + ' distintas');
  if (ejemplos.length) ejemplos.forEach((e) => console.log('      ✗ ' + e));

  // ── [L] LA LÍNEA BASE · DOS TESTIGOS FIRMADOS ──────────────────────────────
  //
  // ⚰️ AQUÍ VIVÍA EL BLOQUE [C], y la mitad que se retira es la que exigía que
  // BASE estuviera ROTO: «BASE contestaba el precio de HOY» y «BASE cotizaba
  // $3,700». Las dos eran ciertas antes de que #732 se mergeara y hoy son
  // FALSAS POR CONSTRUCCIÓN, porque producción ya trae la rampa. Retirarlas en
  // silencio habría dejado a alguien «arreglándolas» hasta deshacer la tuerca.
  //
  // Lo que sobrevive es la otra mitad, que sigue siendo verdad y ahora es la
  // LÍNEA BASE: los dos testigos que Jane midió en el navegador. Se exigen en
  // LOS DOS SITIOS —ya son iguales por [V], así que esto fija los VALORES, no
  // la igualdad— y 🔒 SOLO SE MUEVEN CUANDO UN CAMBIO DE PRECIO SE APRUEBA. Si
  // esto se pone rojo, la pregunta no es «cómo lo callo» sino «¿quién aprobó
  // que ese precio cambiara?».
  console.log('\n[L] línea base · los dos testigos de Jane, en los dos sitios');
  const TESTIGOS = [
    {
      etq: 'omar#0 · Beyond Pit · 28-ago · tres precios con sus horas de Reynosa',
      p: { evento_id: 'omar#0', ambito: 'cheapZonas', zona: 'Beyond Pit', fecha: '2026-08-28' },
      esperado: (j) => j.heredado === true && opciones(j) === 3
        && j.al_abrir && j.al_abrir.precio === 3400
        && (j.cambios || []).map((c) => c.precio + '@' + c.hora).join(' · ') === '3800@12:50 · 4350@16:07',
      leer: (j) => 'heredado=' + j.heredado + ' opciones=' + opciones(j)
        + ' al_abrir=' + (j.al_abrir && j.al_abrir.precio)
        + ' cambios=' + (j.cambios || []).map((c) => c.precio + '@' + c.hora).join(' · '),
    },
    {
      etq: 'omar#0 · Platino B · 28-ago · ZONA CERRADA, no se cotiza',
      p: { evento_id: 'omar#0', ambito: 'cheapZonas', zona: 'Platino B', fecha: '2026-08-28' },
      esperado: (j) => j.heredado === true && j.al_abrir && j.al_abrir.precio === 0
        && j.al_abrir.cerrada === true && j.al_abrir.aplicable === false,
      leer: (j) => 'heredado=' + j.heredado + ' precio=' + (j.al_abrir && j.al_abrir.precio)
        + ' cerrada=' + (j.al_abrir && j.al_abrir.cerrada)
        + ' aplicable=' + (j.al_abrir && j.al_abrir.aplicable),
    },
  ];
  for (const t of TESTIGOS) {
    for (const [nombre, sitio] of [['producción', BASE], ['candidato', HEAD]]) {
      const j = (await preguntar(sitio, t.p)).cuerpo;
      afirmar(t.esperado(j),
        'L·' + nombre + ' se salió de la línea base — ¿quién aprobó ese cambio de precio?',
        t.etq + ' → ' + t.leer(j));
    }
    const j = (await preguntar(HEAD, t.p)).cuerpo;
    console.log('    ' + (t.esperado(j) ? '✓' : '✗') + ' ' + t.etq);
    console.log('        ' + t.leer(j));
  }

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  if (mal) { console.log('\nFallos:'); fallos.slice(0, 40).forEach((f) => console.log('  · ' + f)); }
  process.exit(mal ? 1 : 0);
})();
