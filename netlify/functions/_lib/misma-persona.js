// =============================================================================
// _lib/misma-persona.js — [CAREO-DUP-FECHA-1] (29-oct-2026)
//
// «¿Estos dos nombres son probablemente la MISMA persona?» — UN dueño.
//
// 🔒 ESTO ES UNA MUDANZA, NO UNA REESCRITURA. El cuerpo viene TAL CUAL de
// `admin-coordi-asignaciones.js`, donde nació local dentro de la acción de
// cortesías (CREA-3, 13-oct: «muchas ya estaban en el Excel, ¿cómo sé que no se
// duplica?»). Al ganar un SEGUNDO lector —el careo del Excel— se muda, que es
// la forma de `_lib/imagen-magia` y `_lib/audio-magia`. Dejarla local y escribir
// una gemela en `_lib/` habrían sido dos listas que todavía no divergen, y el
// día que divergieran una de las dos dejaría nacer un duplicado de dinero.
//
// 🔒 Y LA MUDANZA NO LE CAMBIA LA RESPUESTA A SU DUEÑO ORIGINAL (la ley de
// NUBE-3): `admin-coordi-asignaciones` PIDE esta función en vez de declararla,
// con el mismo cuerpo; el careo de CAREO-DUP-FECHA-1 lo afirma comparando la
// salida de las dos contra el mismo padrón, caso por caso.
//
// LA REGLA, dicha: coinciden si comparten el PRIMER token y además alguna otra
// palabra. Tokens = el nombre sin acentos, en minúsculas, partido por espacios,
// quedándose solo con las palabras de 3 letras o más (así «de», «la» y «del» no
// hacen match por su cuenta). Un nombre de UN solo token casa con el primero a
// secas, a propósito: «Marietta» contra «Marietta Barrera» es la misma.
//
// ⚠️ AVISA, JAMÁS DECIDE. Es deliberadamente generosa —prefiere sospechar de
// más— porque sus dos lectores la usan para FRENAR y NOMBRAR, nunca para
// fundir dos filas solas. Un candado que adivina «es la misma» y escribe sería
// peor que ninguno (palabra escrita en CREA-3 y vigente aquí).
// =============================================================================

// Los tokens del nombre. El `>= 3` es lo que mantiene fuera las partículas.
function tokens(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length >= 3);
}

// ¿`a` y `b` son probablemente la misma persona?
function parecido(a, b) {
  const ta = tokens(a), tb = new Set(tokens(b));
  if (!ta.length || !tb.has(ta[0])) return false;
  return ta.length === 1 || ta.slice(1).some((t) => tb.has(t));
}

// =============================================================================
// «¿Esta llave de evento pertenece a este evento base?»
//
// 🔒 UN PREFIJO NO ES UN ANCLA — la ley de CANCEL-UI-1, que la pagó sembrando
// `brunomars2` junto a `bruno`. Un `like slug*` solo ESTRECHA; la autoridad es
// esto: la llave es el slug EXACTO, o el slug seguido de `#`. Nació local en
// `esferas-cancelar.js` y se muda por la misma razón que `parecido`.
// =============================================================================
function esDelEvento(eventoId, slug) {
  const v = String(eventoId || '');
  return v === slug || v.startsWith(slug + '#');
}

// El slug base de una llave con fecha: `coronacapital#3` → `coronacapital`.
function slugBase(eventoId) {
  return String(eventoId || '').split('#')[0];
}

module.exports = { tokens, parecido, esDelEvento, slugBase };
