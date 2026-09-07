#!/usr/bin/env node
// =============================================================================
// CAREO · ROL-HIST-PADRE-1 — la rampa al padre, contra los DOS sitios servidos
// =============================================================================
// Entra por donde entra /rol: POST al endpoint `precios-vigentes` DESPLEGADO.
// No requiere el lib, no simula la base y no arma estado a mano — los dos lados
// son commits desplegados y los dos leen las filas reales de `precios_historial`.
//
//   BASE = producción            (el commit anterior al merge)
//   HEAD = deploy preview de la PR
//
// El universo NO se inventa: `vigia-rol-hist-padre.universo.json` se generó
// desde la tabla real y fija QUÉ se pregunta. Las RESPUESTAS las recomputan los
// dos lados en cada corrida — el fixture es el catálogo, no la foto.
//
// TRES BLOQUES:
//   [I] validación del instrumento — un caso que SE SABE que existe. Si esto no
//       contesta lo esperado, todo lo de abajo miente y el arnés se detiene.
//   [A] control en el sentido «no pisar»: 252 llaves que SÍ saben hablar de su
//       fecha tienen que contestar IGUAL que en BASE, campo por campo.
//   [B] control en el sentido «ahora heredan»: 92 llaves huérfanas donde BASE
//       cae al catálogo y HEAD contesta con el historial del padre.
//   [C] el caso de Jane, el que se midió en el navegador: omar 28-ago.
//
// Las dos cuentas las IMPRIME el arnés. Ninguna se recuerda.
// =============================================================================

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'https://conectareynosa.mx';
const HEAD = process.env.HEAD_URL;
if (!HEAD) { console.error('Falta HEAD_URL (el deploy preview de la PR).'); process.exit(2); }
if (HEAD === BASE) { console.error('BASE y HEAD son el mismo sitio: no hay careo.'); process.exit(2); }

const universo = JSON.parse(fs.readFileSync(path.join(__dirname, 'vigia-rol-hist-padre.universo.json'), 'utf8'));

// Las llaves que HEAD añade y BASE no puede tener. Se quitan ANTES de comparar:
// exigir que estén en BASE sería exigir que BASE ya tuviera la tuerca.
const LLAVES_NUEVAS = ['heredado', 'llave_usada', 'filas_historial_padre', 'padre_error'];

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
const estable = (o) => JSON.stringify(o, Object.keys(o).sort());
function sinLlavesNuevas(o) {
  const c = Object.assign({}, o);
  LLAVES_NUEVAS.forEach((k) => delete c[k]);
  return c;
}
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

  // ── [A] LA RAMPA NO PISA A QUIEN SÍ SABE HABLAR ────────────────────────────
  console.log('\n[A] llaves CON historial propio · contestan igual que en BASE');
  let a_iguales = 0, a_distintas = 0, a_heredadas = 0;
  for (const p of universo.A) {
    const [b, h] = await Promise.all([preguntar(BASE, p), preguntar(HEAD, p)]);
    const etq = p.evento_id + '/' + p.ambito + '/' + p.zona + '/' + p.fecha;
    // Premisa del caso: si BASE no pudo hablar de esa fecha, este probe no
    // pertenece al bloque A y afirmarlo aquí sería medir el caso equivocado.
    if (!afirmar(b.cuerpo.ok === true && !b.cuerpo.sin_historial && !b.cuerpo.anterior_al_historial,
      'A·premisa no se alcanza', etq)) continue;
    if (estable(sinLlavesNuevas(h.cuerpo)) === estable(b.cuerpo)) a_iguales++;
    else { a_distintas++; afirmar(false, 'A·HEAD cambió una respuesta que BASE sabía dar', etq); }
    if (h.cuerpo.heredado === true) { a_heredadas++; afirmar(false, 'A·heredó una llave que sabe hablar', etq); }
  }
  afirmar(universo.A.length > 0, 'A·cardinalidad: el universo no puede estar vacío');
  afirmar(a_iguales === universo.A.length, 'A·todas byte-iguales', a_iguales + '/' + universo.A.length);
  console.log('    ' + a_iguales + ' de ' + universo.A.length + ' idénticas a BASE · ' +
              a_distintas + ' distintas · ' + a_heredadas + ' heredadas (debe ser 0)');

  // ── [B] LAS HUÉRFANAS AHORA HEREDAN ────────────────────────────────────────
  // CONTROL POSITIVO: no basta con que HEAD herede — se exige que BASE SÍ falle.
  // Una aserción «HEAD lo arregla» sin la que prueba que BASE estaba roto pasa
  // en el vacío.
  console.log('\n[B] llaves HUÉRFANAS · BASE cae al catálogo, HEAD hereda del padre');
  let b_base_catalogo = 0, b_head_hereda = 0, b_mejora_precio = 0;
  for (const p of universo.B) {
    const [b, h] = await Promise.all([preguntar(BASE, p), preguntar(HEAD, p)]);
    const etq = p.evento_id + '/' + p.ambito + '/' + p.zona + '/' + p.fecha;
    if (b.cuerpo.sin_historial === true) b_base_catalogo++;
    else afirmar(false, 'B·control positivo: BASE NO estaba roto aquí', etq);
    if (h.cuerpo.heredado === true) b_head_hereda++;
    else afirmar(false, 'B·HEAD no heredó', etq);
    afirmar(h.cuerpo.sin_historial === false, 'B·HEAD sigue diciendo sin_historial', etq);
    const fb = b.cuerpo.al_abrir && b.cuerpo.al_abrir.fuente;
    const fh = h.cuerpo.al_abrir && h.cuerpo.al_abrir.fuente;
    afirmar(fh !== 'catalogo', 'B·HEAD sigue contestando desde el catálogo', etq);
    if (fb === 'catalogo' && fh !== 'catalogo') b_mejora_precio++;
  }
  afirmar(universo.B.length > 0, 'B·cardinalidad: el universo no puede estar vacío');
  afirmar(b_base_catalogo === universo.B.length, 'B·BASE roto en todas', b_base_catalogo + '/' + universo.B.length);
  afirmar(b_head_hereda === universo.B.length, 'B·HEAD hereda en todas', b_head_hereda + '/' + universo.B.length);
  console.log('    BASE cayó al catálogo en ' + b_base_catalogo + ' de ' + universo.B.length);
  console.log('    HEAD heredó del padre en ' + b_head_hereda + ' de ' + universo.B.length +
              ' · dejó de contestar «precio de hoy» en ' + b_mejora_precio);

  // ── [C] EL CASO DE JANE ────────────────────────────────────────────────────
  console.log('\n[C] el caso medido en el navegador · omar 6-Nov CHEAP, separo 28-ago');
  const pit = { evento_id: 'omar#0', ambito: 'cheapZonas', zona: 'Beyond Pit', fecha: '2026-08-28' };
  const [cb, ch] = await Promise.all([preguntar(BASE, pit), preguntar(HEAD, pit)]);
  afirmar(cb.cuerpo.sin_historial === true && cb.cuerpo.al_abrir.precio === 3800 && cb.cuerpo.al_abrir.fuente === 'catalogo',
    'C·control positivo: BASE contestaba el precio de HOY',
    'sin_historial=' + cb.cuerpo.sin_historial + ' precio=' + (cb.cuerpo.al_abrir && cb.cuerpo.al_abrir.precio));
  const hh = (ch.cuerpo.cambios || []).map((c) => c.precio + '@' + c.hora).join(' · ');
  afirmar(ch.cuerpo.heredado === true && opciones(ch.cuerpo) === 3 &&
          ch.cuerpo.al_abrir.precio === 3400 && hh === '3800@12:50 · 4350@16:07',
    'C·HEAD da los tres precios con sus horas de Reynosa',
    'opciones=' + opciones(ch.cuerpo) + ' al_abrir=' + (ch.cuerpo.al_abrir && ch.cuerpo.al_abrir.precio) + ' cambios=' + hh);
  console.log('    BASE: ' + opciones(cb.cuerpo) + ' precio(s) · ' + cb.cuerpo.al_abrir.precio + ' (fuente ' + cb.cuerpo.al_abrir.fuente + ')');
  console.log('    HEAD: ' + opciones(ch.cuerpo) + ' precios · al abrir ' + ch.cuerpo.al_abrir.precio + ' · ' + hh);

  // La segunda cara: un precio que NO existía ese día.
  const plb = { evento_id: 'omar#0', ambito: 'cheapZonas', zona: 'Platino B', fecha: '2026-08-28' };
  const [db, dh] = await Promise.all([preguntar(BASE, plb), preguntar(HEAD, plb)]);
  afirmar(db.cuerpo.anterior_al_historial === true && db.cuerpo.al_abrir.precio === 3700,
    'C·control positivo: BASE cotizaba $3,700 (fila nacida el 29-ago)',
    'precio=' + (db.cuerpo.al_abrir && db.cuerpo.al_abrir.precio));
  afirmar(dh.cuerpo.heredado === true && dh.cuerpo.al_abrir.precio === 0 &&
          dh.cuerpo.al_abrir.cerrada === true && dh.cuerpo.al_abrir.aplicable === false,
    'C·HEAD dice ZONA CERRADA y no cotiza',
    'precio=' + (dh.cuerpo.al_abrir && dh.cuerpo.al_abrir.precio) + ' aplicable=' + (dh.cuerpo.al_abrir && dh.cuerpo.al_abrir.aplicable));
  console.log('    Platino B · BASE: $' + db.cuerpo.al_abrir.precio + ' («lo más viejo que sabemos»)');
  console.log('    Platino B · HEAD: ' + (dh.cuerpo.al_abrir.cerrada ? 'CERRADA (precio 0), no se cotiza' : '$' + dh.cuerpo.al_abrir.precio));

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  if (mal) { console.log('\nFallos:'); fallos.slice(0, 40).forEach((f) => console.log('  · ' + f)); }
  process.exit(mal ? 1 : 0);
})();
