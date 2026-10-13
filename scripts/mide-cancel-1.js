#!/usr/bin/env node
/* =============================================================================
 * mide-cancel-1 — TITODOBLE Y NATANAEL CANCELADOS, FUERA DEL INDEX
 * (12-oct-2026, palabra de Memo: «cancélalos y quítalos del index»).
 *
 * Los dos salieron del EV POR EL DUEÑO (`quitarDelEV`, validación de ambos
 * parsers) y el código 'NATA' se podó de PROMOS. Las fichas quedaron
 * archivado=true + publicado=false en esferas_eventos (el veto ESF-ARCHIVO-1
 * que el publish filtra EN EL SERVIDOR: sin eso, el próximo publish los
 * re-insertaba) y la fila NATA de promos_codigos archivada — eso vive en la
 * base y lo registra el acta; aquí se mide el ARCHIVO SERVIBLE.
 *
 * ⚠️ SIN ANCLA a propósito (árbol de trabajo, como mide:cuadre-aplicar): sus
 * candados son por construcción — cardinalidad del catálogo vivo + presencia
 * de vecinos — no por commit. NO comparar contra HEAD: al commitear, HEAD y
 * árbol son el mismo y esa comparación caduca el día de su propio merge.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXC: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}

(async () => {
  console.log('══ mide:cancel-1 ══');
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

  // [A] EL EV, POR EL DUEÑO (fetchEventosRaw de catalogo-index con red falsa
  // que sirve el index del árbol — no un eval propio).
  const ci = path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js');
  delete require.cache[require.resolve(ci)];
  const fetchReal = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => html });
  let EV;
  try {
    const { fetchEventosRaw } = require(ci);
    EV = await fetchEventosRaw();
  } finally { global.fetch = fetchReal; }
  af(Array.isArray(EV) && EV.length >= 100, `[A1] el catálogo parsea por el dueño y sigue entero (${EV && EV.length} eventos — cardinalidad, no un verde en vacío)`);
  const ids = new Set((EV || []).map((e) => e && e.id));
  af(!ids.has('titodoble'), '[A2] titodoble FUERA del EV');
  af(!ids.has('natanael'), '[A3] natanael FUERA del EV');
  for (const vecino of ['karolg', 'arjona', 'alfredito', 'payasonicos']) {
    af(ids.has(vecino), `[A4] el vecino vivo '${vecino}' sigue en el EV (la poda no se llevó a nadie más)`);
  }

  // [B] PROMOS sin NATA — evaluado, no grepeado (un grep se caza con el
  // comentario que explica la poda). Se rebana `var PROMOS={...};` por
  // balance de llaves y se corre en un vm.
  const i0 = html.indexOf('var PROMOS={');
  af(i0 > 0, '[B1] var PROMOS existe en el index');
  let depth = 0, fin = -1;
  for (let i = html.indexOf('{', i0); i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { fin = i; break; } }
  }
  const promosSrc = html.slice(i0, fin + 1) + ';';
  let PROMOS = null;
  try { PROMOS = vm.runInNewContext(promosSrc + ' PROMOS', {}); } catch (e) { /* af abajo lo reporta */ }
  af(PROMOS && typeof PROMOS === 'object', '[B2] PROMOS evalúa (la poda no rompió el objeto)');
  af(PROMOS && !('NATA' in PROMOS), '[B3] NATA FUERA de PROMOS (el $500 de un evento cancelado no se ofrece)');
  const llaves = PROMOS ? Object.keys(PROMOS) : [];
  af(llaves.length >= 4 && ['SANZ', 'ENJAMBRE', 'BADGYAL', 'SCORPIONS'].every((k) => llaves.includes(k)), `[B4] las demás promos siguen (${llaves.length} llaves: ${llaves.join(', ')})`);
  // [B5] acotado a ESTA poda: ningún puntero a los dos cancelados. ⚠️ Hay DOS
  // huérfanas PREEXISTENTES y VENCIDAS (CIRCLE→aperfectcircle, venció abr-2026;
  // BEELE→beele, may-2026) — promos muertas de eventos que salieron del
  // catálogo hace meses, inertes porque una promo vencida no aplica. Se NOMBRAN
  // sin bendecirse: limpiarlas es chiquita propia, no de CANCEL-1.
  af(!llaves.some((k) => PROMOS[k] && ['titodoble', 'natanael'].includes(PROMOS[k].onlyEvent)), '[B5] 🔒 ninguna promo apunta a titodoble/natanael');
  const huerfanas = llaves.filter((k) => PROMOS[k] && PROMOS[k].onlyEvent && !ids.has(PROMOS[k].onlyEvent));
  af(huerfanas.length === 2 && huerfanas.includes('CIRCLE') && huerfanas.includes('BEELE'), `[B6] las huérfanas preexistentes son EXACTAMENTE las dos conocidas (${huerfanas.join(', ') || 'ninguna'}) — una tercera sería nueva y hay que mirarla`);

  // [C] El router de deep-links no truena con los slugs muertos: la guarda es
  // estructural (found queda null y no se abre nada) — se afirma que el pase 1
  // busca por id EXACTO contra EV, que es lo que vuelve seguro el slug muerto.
  af(/norm\(EV\[i\]\.id\)===key/.test(html), '[C1] el deep-link casa por id exacto contra el EV (slug muerto → portada, no error)');

  console.log(`\n${R === 0 ? '✅ VERDE' : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  if (V === 0) { console.log('NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('EL ARNÉS SE CAYÓ (eso no es un reporte):', e); process.exit(1); });
