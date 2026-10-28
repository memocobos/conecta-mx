#!/usr/bin/env node
// =============================================================================
// mide:chatarra-regla-1 — LA REGLA DE ZONA NOMBRA LA FECHA, NO LA ZONA
// =============================================================================
// 🔴 EL DEFECTO, medido en producción el 28-oct-2026:
//   `coronacapital#0` tenía 9 boletos vendidos-fuera bajo la llave
//   «General Viernes» mientras la ficha de esa fecha llama a su zona «General»
//   a secas. El sitio NO los restaba: creía 11 libres del viernes cuando
//   quedaban 2 — nueve lugares a la venta que no existen, a 23 días del evento.
//
// LA CAUSA: una pestaña COMPARTIDA entre fechas (la de Corona sirve a #0, #1,
// #2 y #5) se parte con `excel_pestanas.regla_zona`, y el Excel escribe esa
// regla en la columna Boleto. La chatarra llega nombrada «General Viernes», que
// NO es variante ortográfica de «General», así que `resolverZonaFicha` no la
// canoniza — y hace BIEN: en otros eventos «General» y «General A» son zonas
// distintas de verdad. Se quedaba con el nombre del Excel.
//
// 🔒 POR QUÉ NO SE ARREGLA EN LA BASE: `excel-aplicar` empareja por zona
// NORMALIZADA y escribe «la ortografía de la fila que ya existe». Renombrar el
// ajuste a mano sobrevive un día: el careo siguiente ve «General» con 9 y
// chatarra 0 → la pone en CERO y vuelve a crear la fantasma. Es exactamente lo
// que el comentario de DISPO-NORM-1 describe. El arreglo va en el careo.
//
// ⚠️ SIN ANCLA DE COMMIT, a propósito (la forma de `mide:req-b1`): carga del
// ÁRBOL DE TRABAJO, así que mide lo que acabas de escribir y no sufre la trampa
// del commit. A cambio NO puede traer control positivo por commit — el suyo es
// por CONSTRUCCIÓN: se reproduce el comportamiento viejo rebanando la misma
// decisión sin la regla, y se exige que falle.
// =============================================================================

const path = require('path');
const RAIZ = path.join(__dirname, '..');
const { normalizarZona } = require(path.join(RAIZ, 'netlify/functions/_lib/normalizar-zona'));
const { zonasCanonicasDe, zonasDeFecha, resolverZonaFicha } = require(path.join(RAIZ, 'netlify/functions/_lib/zona-ficha'));

let verde = 0; const rojos = [];
function af(cond, msg) {
  let ok = false;
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { rojos.push(`${msg}  [EXCEPCIÓN: ${e.message}]`); return; }
  if (ok) { verde++; console.log('  ✓ ' + msg); }
  else { rojos.push(msg); console.log('  ✗ ' + msg); }
}

// ── La decisión REAL, rebanada del dueño ────────────────────────────────────
// Se copia la forma de `correrCareo` para poder correrla sin red. El careo
// afirma aparte que el dueño sigue teniendo esta forma (bloque [D]).
function canonizar(chatarra, evCat, eventoId, reglas, conRegla) {
  const canonicas = zonasCanonicasDe(evCat);
  const deEstaFecha = zonasDeFecha(evCat, eventoId);
  const reglasNorm = new Set((reglas || []).filter(Boolean).map((r) => normalizarZona(r)));
  const avisos = [];
  const out = {};
  for (const zc in chatarra) {
    const v = resolverZonaFicha(canonicas, zc);
    let llave = (v.estado === 'canonizada') ? v.zona : zc;
    if (conRegla && v.estado === 'desconocida' && reglasNorm.has(normalizarZona(zc))) {
      if (deEstaFecha.length === 1) { llave = deEstaFecha[0]; avisos.push({ regla: zc, zona: llave, boletos: chatarra[zc] }); }
      else { avisos.push({ regla: zc, zona: null, boletos: chatarra[zc] }); }
    }
    out[llave] = (out[llave] || 0) + chatarra[zc];
  }
  return { chatarra: out, avisos };
}

// ── El fixture: la ficha REAL de Corona, como la sirve el catálogo ──────────
// Seis fechas, TODAS con una sola zona llamada «General». Eso es lo que hace
// que la traducción sea segura: no hay a qué otra zona pudiera ir.
const CORONA = {
  id: 'coronacapital', zonas: [], cheapZonas: [],
  multifecha: [
    { lbl: 'Vie 20 nov · 1 día', zonas: [{ n: 'General', p: 3900 }], cheapZonas: [{ n: 'General', p: 0 }] },
    { lbl: 'Sáb 21 nov · 1 día', zonas: [{ n: 'General', p: 3900, ag: 1 }], cheapZonas: [{ n: 'General', p: 0 }] },
    { lbl: 'Dom 22 nov · 1 día', zonas: [{ n: 'General', p: 3900 }], cheapZonas: [{ n: 'General', p: 0 }] },
    { lbl: 'Vie + Sáb · 2 días', zonas: [{ n: 'General', p: 6300, ag: 1 }], cheapZonas: [{ n: 'General', p: 0 }] },
    { lbl: 'Sáb + Dom · 2 días', zonas: [{ n: 'General', p: 6300, ag: 1 }], cheapZonas: [{ n: 'General', p: 0 }] },
    { lbl: 'Vie a Dom · 3 días', zonas: [{ n: 'General', p: 8700, ag: 1 }], cheapZonas: [{ n: 'General', p: 0 }] },
  ],
};
// Un evento con VARIAS zonas en la fecha: ahí la regla NO puede traducirse.
const VARIAS = {
  id: 'festivalx', zonas: [], cheapZonas: [],
  multifecha: [{ lbl: 'Día 1', zonas: [{ n: 'General' }, { n: 'VIP' }, { n: 'Platino' }], cheapZonas: [] }],
};

console.log('\n════ [A] EL CASO REAL: coronacapital#0, 9 boletos en «General Viernes» ════');
{
  const chat = { 'General Viernes': 9 };
  const reglas = ['General Viernes', 'General Sabado', 'General Domingo', 'General'];

  const viejo = canonizar(chat, CORONA, 'coronacapital#0', reglas, false);
  af(viejo.chatarra['General Viernes'] === 9,
    'CONTROL POSITIVO · sin la regla, los 9 se quedan en la llave fantasma «General Viernes»');
  af(viejo.chatarra['General'] === undefined,
    'CONTROL POSITIVO · sin la regla, la zona REAL «General» se queda sin un solo boleto');

  const nuevo = canonizar(chat, CORONA, 'coronacapital#0', reglas, true);
  af(nuevo.chatarra['General'] === 9, 'con la regla, los 9 boletos caen en «General», que es la zona de la ficha');
  af(nuevo.chatarra['General Viernes'] === undefined, 'la llave fantasma «General Viernes» ya no existe');
  af(Object.keys(nuevo.chatarra).length === 1, 'queda UNA sola llave: no se duplicaron los boletos al traducir');
  af(nuevo.avisos.length === 1 && nuevo.avisos[0].regla === 'General Viernes'
     && nuevo.avisos[0].zona === 'General' && nuevo.avisos[0].boletos === 9,
    'el aviso DICE qué se tradujo, a dónde y cuántos boletos — la traducción no es muda');
}

console.log('\n════ [B] EL EFECTO EN LA VENTA (la razón de la tuerca) ════');
{
  // La cuenta real del sitio: comprado − vendidos_fuera − vendidos.
  const COMPRADO = 19, VENDIDOS = 8;
  const libres = (chat) => COMPRADO - (chat['General'] || 0) - VENDIDOS;
  const reglas = ['General Viernes'];
  af(libres(canonizar({ 'General Viernes': 9 }, CORONA, 'coronacapital#0', reglas, false).chatarra) === 11,
    'CONTROL POSITIVO · hoy el sitio cree que quedan 11 lugares del viernes');
  af(libres(canonizar({ 'General Viernes': 9 }, CORONA, 'coronacapital#0', reglas, true).chatarra) === 2,
    'con el arreglo dice 2, que es la verdad — se dejan de ofrecer 9 lugares que no existen');
}

console.log('\n════ [C] LOS CANDADOS: cuándo NO se traduce ════');
{
  const reglas = ['General Viernes', 'General'];
  // 1 · La ficha manda sobre la regla.
  const r1 = canonizar({ 'GENERAL': 4 }, CORONA, 'coronacapital#0', reglas, true);
  af(r1.chatarra['General'] === 4 && r1.avisos.length === 0,
    'una llave que YA casa con la ficha se canoniza por la ficha, sin tocar la regla (la ficha es primero)');

  // 2 · Varias zonas en la fecha → ambiguo → NO se inventa.
  const r2 = canonizar({ 'Dia 1': 5 }, VARIAS, 'festivalx#0', ['Dia 1'], true);
  af(r2.chatarra['Dia 1'] === 5 && r2.chatarra['General'] === undefined,
    'con 3 zonas en la fecha la llave NO se traduce: adivinar metería boletos en la zona equivocada');
  af(r2.avisos.length === 1 && r2.avisos[0].zona === null && r2.avisos[0].boletos === 5,
    'y el caso ambiguo se NOMBRA con sus boletos en vez de callarse');

  // 3 · Una llave que no es regla ni zona sigue viajando tal cual.
  const r3 = canonizar({ '-': 3 }, CORONA, 'coronacapital#0', reglas, true);
  af(r3.chatarra['-'] === 3 && r3.avisos.length === 0,
    'la chatarra sin zona («-») viaja intacta: no es una regla y no se toca');

  // 4 · Fecha que la ficha no tiene.
  const r4 = canonizar({ 'General Viernes': 9 }, CORONA, 'coronacapital#9', reglas, true);
  af(r4.chatarra['General Viernes'] === 9,
    'un #9 que la ficha no tiene NO traduce nada: un hueco no se tapa con la primera zona a mano');

  // 5 · Sin reglas (pestaña no compartida) nada cambia.
  const r5 = canonizar({ 'General Viernes': 9 }, CORONA, 'coronacapital#0', [], true);
  af(r5.chatarra['General Viernes'] === 9 && r5.avisos.length === 0,
    'sin regla_zona la llave se queda como está: esto solo aplica a pestañas compartidas');
}

console.log('\n════ [D] zonasDeFecha: el ayudante nuevo ════');
{
  af(JSON.stringify(zonasDeFecha(CORONA, 'coronacapital#0')) === '["General"]',
    'la fecha #0 tiene exactamente una zona: «General»');
  af(zonasDeFecha(CORONA, 'coronacapital#9').length === 0,
    'una fecha que no existe devuelve vacío, NO las globales (el hueco se ve)');
  af(zonasDeFecha(VARIAS, 'festivalx#0').length === 3,
    'una fecha con 3 zonas devuelve las 3');
  af(zonasDeFecha(null, 'x#0').length === 0, 'sin ficha devuelve vacío sin tronar');
  // 🔒 La herencia de las globales: la cicatriz de ROL-HIST-PADRE.
  const hereda = { id: 'h', zonas: [{ n: 'Pista' }], cheapZonas: [], multifecha: [{ zonas: [], cheapZonas: [] }] };
  af(JSON.stringify(zonasDeFecha(hereda, 'h#0')) === '["Pista"]',
    'una fecha SIN zonas propias hereda las globales del evento (así vendía Omar Courtz)');
  // Y no se confunde con el universo entero.
  const dos = { id: 'd', zonas: [], cheapZonas: [], multifecha: [{ zonas: [{ n: 'A' }] }, { zonas: [{ n: 'B' }] }] };
  af(JSON.stringify(zonasDeFecha(dos, 'd#0')) === '["A"]' && zonasCanonicasDe(dos).length === 2,
    'zonasDeFecha da SOLO las de esa fecha (1) mientras zonasCanonicasDe da el universo (2) — no son la misma pregunta');
}

console.log('\n════ [E] EL DUEÑO sigue teniendo esta forma (que el careo no mida un doble) ════');
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(RAIZ, 'netlify/functions/_lib/excel-careo-correr.js'), 'utf8');
  const limpio = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  af(limpio.includes('zonasDeFecha(evCat, eventoId)'),
    'correrCareo le pregunta las zonas a LA FECHA, no al evento entero');
  af(limpio.includes('reglasNorm.has(normalizarZona(zc))'),
    'correrCareo compara la llave contra las reglas normalizadas');
  af(limpio.includes('deEstaFecha.length === 1'),
    'el candado de unicidad vive en el dueño, no solo en este careo');
  af(limpio.includes("v.estado === 'desconocida'"),
    'la regla solo entra DESPUÉS de que la ficha dijo que no la conoce');
  af(limpio.includes('chatarra_regla'),
    'el aviso viaja en la respuesta del careo');
  af(/zonasCanonicasDe,\s*zonasDeFecha,\s*resolverZonaFicha/.test(limpio),
    'el import trae el ayudante nuevo del dueño de las zonas');
}

console.log('\n' + '═'.repeat(70));
if (rojos.length) {
  console.log(`🔴 ROJO · ${verde} en verde · ${rojos.length} en rojo`);
  rojos.forEach((r) => console.log('   ✗ ' + r));
  process.exit(1);
}
if (!verde) { console.log('⚠️  NADA MEDIDO · esto NO es un verde'); process.exit(1); }
console.log(`✅ VERDE · ${verde} en verde`);
