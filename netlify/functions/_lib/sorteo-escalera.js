// _lib/sorteo-escalera.js — la escalera del sorteo. LÓGICA PURA, sin IO.
//
// ═══════════════════════════════════════════════════════════════════════════
// UNA SOLA REVOLTURA, Y LAS RONDAS SON PREFIJOS.
//
// El servidor revuelve el padrón elegible UNA vez y las rondas son prefijos de
// esa lista: [0..23], [0..11], [0..5], [0..2], [0]. De ahí salen GRATIS tres
// propiedades que de otro modo habría que comprobar a mano:
//   · cada ronda es subconjunto de la anterior (es un prefijo de la misma lista)
//   · P(ganar) = 1/N para todos (revuelto[0] es uniforme)
//   · el ganador está en TODAS las rondas
//
// 🔴 Y POR ESO EL ORDEN ES LA RESPUESTA. `orden` se guarda en orden de
// revoltura porque es lo que hace que las rondas sean prefijos — pero NINGUNA
// respuesta pública lo expone: `proyectarRondas` re-ordena por folio. Publicar
// ese arreglo tal cual sería publicar al ganador desde el segundo cero.
//
// Este archivo no requiere nada más que `crypto` a propósito: los escalones se
// le PASAN. Así la única puerta que requiere `sorteo-tiempos.js` son las dos
// functions, que es donde el 500 con nombre tiene sentido.
// ═══════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

// Azar de crypto, no Math.random(): en un sorteo con premio el generador tiene
// que ser el bueno aunque nadie lo vaya a auditar.
//
// Se MUDÓ aquí desde giveaway-sortear.js, donde era una función local que
// ningún arnés podía tocar. Misma implementación, letra por letra.
function alAzar(n) {
  if (n <= 0) return -1;
  const limite = Math.floor(0xFFFFFFFF / n) * n;   // sin sesgo por módulo
  let x;
  do { x = crypto.randomBytes(4).readUInt32BE(0); } while (x >= limite);
  return x % n;
}

// Fisher–Yates hacia atrás. Devuelve COPIA: el padrón que llega se sigue
// leyendo después para contar, y mutarlo dejaría al llamador con otra lista.
function revolver(arr, azar) {
  const f = azar || alAzar;
  const a = (Array.isArray(arr) ? arr : []).slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = f(i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// `elegibles`: [{ id, nombre, folio }] — ya filtrado por quien llama (slug, sin
// eliminados, sin foto invalidada). `escalones` viene de `escalonesPara(n)`.
//
// ⚠️ `nombre` se guarda como FOTO DEL MOMENTO del giro: si alguien toca el
// padrón después, el show no cambia de nombres a media transmisión.
// ⚠️ Y NADA MÁS que id, nombre y folio: lo que no se guarda no se puede
// filtrar, y esta columna la va a leer una proyección pública.
function construirEscalera(elegibles, escalones, azar) {
  const lista = Array.isArray(elegibles) ? elegibles : [];
  const esc = Array.isArray(escalones) ? escalones : [];
  if (!lista.length || !esc.length) return null;
  const revuelto = revolver(lista, azar);
  const orden = revuelto.slice(0, esc[0]).map((r) => ({
    id: r.id, nombre: r.nombre, folio: r.folio,
  }));
  return { v: 1, escalones: esc, orden };
}

// ── EL POZO DE UN RE-GIRO ──────────────────────────────────────────────────
// Se camina la escalera de MENOR a MAYOR y se toma el PRIMER escalón que
// todavía tenga a alguien sin quemar:
//
//   falla el ganador  → los otros 2 de la ronda de 3          escalon 3
//   fallan esos 2     → los 3 que quedaban de la de 6         escalon 6
//   fallan esos       → los 6 que quedaban de la de 12        escalon 12
//   fallan esos       → los 12 que quedaban de la de 24       escalon 24
//   fallan esos       → el RESTO del padrón vivo              escalon 0
//                       (que es lo que hacía la versión anterior de `girar`)
//   no queda nadie    → escalon null, y el llamador contesta 409
//
// 🔒 NO SE SALTA UN ESCALÓN CON GENTE. Subir de más metería al pozo a alguien
// que la mecánica ya había eliminado EN PANTALLA, y eso es cambiar el sorteo a
// media transmisión.
//
// ⚠️ `quemados` trae DOS clases de id, y las dos tienen que estar: quien ya
// salió y no se resolvió a favor, Y quien dejó de ser elegible (eliminado o
// foto invalidada DESPUÉS del giro). Sin lo segundo, el pozo podría devolver a
// alguien que ya no concursa y saldría en cámara.
function pozoDeReGiro(rondas, quemados, elegiblesVivos) {
  const esc = (rondas && Array.isArray(rondas.escalones)) ? rondas.escalones : [];
  const orden = (rondas && Array.isArray(rondas.orden)) ? rondas.orden : [];
  const q = quemados || new Set();

  // De menor a mayor, y sin el 1: el escalón del ganador no es un pozo.
  const subida = esc.slice().reverse().filter((k) => k > 1);
  for (const k of subida) {
    const pozo = orden.slice(0, k).filter((r) => r && !q.has(r.id));
    if (pozo.length) return { pozo, escalon: k };
  }

  const resto = (Array.isArray(elegiblesVivos) ? elegiblesVivos : []).filter((r) => r && !q.has(r.id));
  if (resto.length) return { pozo: resto, escalon: 0 };
  return { pozo: [], escalon: null };
}

module.exports = { alAzar, revolver, construirEscalera, pozoDeReGiro };
