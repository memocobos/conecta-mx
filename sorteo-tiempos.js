// sorteo-tiempos.js — LOS TIEMPOS DEL SHOW, en UN solo lugar.
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔒 ESTE ARCHIVO LO LEEN DOS RUNTIMES: el servidor (para decidir QUÉ ronda ya
// se puede publicar) y el navegador (para decidir QUÉ ronda toca animar).
//
// Si vivieran copiados, un cambio en uno dejaría al otro publicando de más o
// animando de menos — y en ESTE MÓDULO eso ya pasó: las cuatro constantes de
// fecha de giveaway.html y sorteo.html se quedaron en el 13-sep de Natanael
// mientras el lib decía 1-oct, así que en el preview `ahora >= CIERRE` era
// cierto y el formulario salía OCULTO el día que abría. Los comentarios decían
// «el arnés los carea contra el lib» y ningún arnés los careaba.
//
// Vive en la RAÍZ porque la raíz es el publish dir de Netlify (no hay clave
// `publish` en netlify.toml) y el navegador lo pide como /sorteo-tiempos.js,
// igual que /meta-events.js. El servidor lo requiere con ruta relativa Y con
// `included_files` en netlify.toml, porque ninguna function de este repo
// requería nada de fuera de su carpeta y ese empaquetado no estaba medido.
//
// ⚠️ SI ALGUIEN CAMBIA UN NÚMERO DE AQUÍ no hay forma de mover uno solo: el
// careo compara el objeto del NAVEGADOR (leído de la página servida) contra el
// de NODE (`require`), campo por campo.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var T = {
    // Sube cuando cambie la FORMA del objeto, no cuando cambie un número.
    V: 1,

    // [SORTEO-RONDAS-1 · 21-sep-2026] Firmado por Memo: el show completo en
    // ~40 s. Los primeros números daban 2:12 y «se sentía eterno».
    //
    // 🔴 LOS TRES DE ABAJO GOBIERNAN DE VERDAD, no solo la cuenta. Antes el
    // giro final duraba 11 000 ms TECLEADOS en `perfil()` de sorteo.html, el
    // 3·2·1 iba a 900 ms por paso y el confeti a 4 200: `duracionTotal` decía
    // una cosa y la pantalla hacía otra. Ahora la pantalla los DERIVA de aquí,
    // así que mover uno mueve lo que se ve — y lo que el servidor libera.
    CUENTA_321_MS:       3000,   // el 3·2·1 → 1 000 ms por número
    PRESENTAR_MS:        4000,   // caen las tarjetas del primer escalón
    RONDA_REDOBLE_MS:    2600,   // el suspenso de cada eliminación
    RONDA_APAGADO_MS:    1400,   // se apaga la mitad, escalonado
    RONDA_REACOMODO_MS:  1000,   // los que siguen se reacomodan y crecen
    SUSPENSO_MS:         4000,   // los finalistas en grande, antes del último giro
    GIRO_FINAL_MS:      10000,   // el perfil del tercer rodillo lo escala de aquí
    REVELACION_MS:       4000,   // destello + confeti, los dos escalados de aquí

    // Cuánto ANTES de que le toque se publica una ronda, para que la página no
    // se quede esperando el latido. Corto a propósito: es el único adelanto que
    // un espectador con la consola abierta puede aprovechar.
    MARGEN_ADELANTO_MS:  2000,
    LATIDO_MS:           4000,   // el latido de siempre, como piso
  };
  T.RONDA_MS = T.RONDA_REDOBLE_MS + T.RONDA_APAGADO_MS + T.RONDA_REACOMODO_MS;

  // ── La escalera que le toca a N participantes ─────────────────────────────
  // Con menos de 24 se arranca en el escalón que alcance; con menos de 3, giro
  // directo, que es el show que ya existía.
  function escalonesPara(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    if (n < 1)  return [];
    if (n < 3)  return [1];
    if (n < 6)  return [3, 1];
    if (n < 12) return [6, 3, 1];
    if (n < 24) return [12, 6, 3, 1];
    return [24, 12, 6, 3, 1];
  }

  // ── Cuándo se revela cada escalón, en ms desde `creado_at` ────────────────
  // Tres casos EXPLÍCITOS, y el primero es el que se me había quedado sin
  // definir en el plan: con UN escalón, ese escalón ES el ganador, así que no
  // puede salir en el instante cero — no hay mosaico que presentar, y
  // liberarlo en 0 sería justo el spoiler que todo esto viene a cerrar.
  function momentos(escalones) {
    var e = Array.isArray(escalones) ? escalones : [];
    var n = e.length;
    if (!n) return [];
    if (n === 1) return [T.CUENTA_321_MS];
    var base = T.CUENTA_321_MS + T.PRESENTAR_MS;
    var out = [0];                                             // el primero se presenta
    for (var k = 1; k < n - 1; k++) out.push(base + (k - 1) * T.RONDA_MS);
    out.push(base + (n - 2) * T.RONDA_MS + T.SUSPENSO_MS);     // el último suma suspenso
    return out;
  }

  function liberaciones(escalones) {
    return momentos(escalones).map(function (m) {
      return Math.max(0, m - T.MARGEN_ADELANTO_MS);
    });
  }

  function duracionTotal(escalones) {
    var m = momentos(escalones);
    if (!m.length) return 0;
    return m[m.length - 1] + T.GIRO_FINAL_MS + T.REVELACION_MS;
  }

  var API = {
    T: T, escalonesPara: escalonesPara, momentos: momentos,
    liberaciones: liberaciones, duracionTotal: duracionTotal,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else if (typeof window !== 'undefined') window.SORTEO_TIEMPOS = API;
})();
