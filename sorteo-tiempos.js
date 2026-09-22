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

    // [SORTEO-RONDAS-1 · 21-sep-2026] Firmado por Memo, TERCERA vuelta: show
    // completo en ~1:30. Primero fueron 2:12 («se sentía eterno»), luego 40 s,
    // y luego los 24 dejaron de aparecer de golpe: ahora los SACA LA
    // TRAGAMONEDAS uno por uno, y eso son 36 s que antes eran 4.
    //
    // 🔴 LOS TIEMPOS DE LA PANTALLA SALEN TODOS DE AQUÍ. Antes el giro final
    // duraba 11 000 ms TECLEADOS en `perfil()`, el 3·2·1 iba a 900 ms por paso
    // y el confeti a 4 200: coincidían con estas constantes POR CASUALIDAD, y
    // `duracionTotal` decía la verdad de milagro. Mover un número aquí mueve
    // lo que se ve Y lo que el servidor libera.
    CUENTA_321_MS:       3000,   // el 3·2·1 → 1 000 ms por número
    SACA_UNO_MS:         1500,   // 🔴 lo que tarda la tragamonedas en sacar A UNO
    RONDA_REDOBLE_MS:    4600,   // el suspenso de cada eliminación
    RONDA_APAGADO_MS:    2200,   // se apaga la mitad, escalonado
    RONDA_REACOMODO_MS:  1200,   // los que siguen se reacomodan y crecen
    // ═══ EL FINAL, SIN TRAGAMONEDAS ══════════════════════════════════════
    // [21-sep, cuarta vuelta] Orden de Memo: con los 3 finalistas YA NO SE
    // GIRA. La eliminación es el clímax, y la pantalla no puede quedarse
    // quieta ni un segundo.
    FINAL_TRES_MS:       8000,   // los 3 en grande temblando · al final muere UNO
    FINAL_DOS_MS:        5000,   // las 2 temblando fuerte, con cuenta 5·4·3·2·1
    REVELACION_MS:       6000,   // destello + confeti, los dos escalados de aquí

    // 🔒 SOBREVIVE PARA EL CAMINO VIEJO. Los dos giros de Natanael no tienen
    // escalera: su show es el de siempre —la tragamonedas girando hacia el
    // ganador— y `perfil()` escala de aquí. Quitarlo rompería esas dos filas.
    GIRO_FINAL_MS:      15000,

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

  // ── Lo que tarda la tragamonedas en sacar al primer escalón ──────────────
  // 🔴 YA NO ES UNA CONSTANTE: depende de CUÁNTOS saca. Con `PRESENTAR_MS`
  // fijo, sacar 24 uno por uno y sacar 3 uno por uno habrían durado lo mismo,
  // y el gateo del servidor habría liberado la ronda 2 a media presentación.
  function presentarMs(escalones) {
    var e = Array.isArray(escalones) ? escalones : [];
    if (e.length < 2) return 0;          // con un solo escalón no hay mosaico
    return e[0] * T.SACA_UNO_MS;
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
    var base = T.CUENTA_321_MS + presentarMs(e);
    var out = [0];                                             // el primero se presenta
    for (var k = 1; k < n - 1; k++) out.push(base + (k - 1) * T.RONDA_MS);
    // 🔴 EL ÚLTIMO MOMENTO ES LA REVELACIÓN, no el arranque de un giro.
    // Antes el último escalón marcaba cuándo EMPEZABA la tragamonedas y la
    // cara aparecía 15 s después; sin giro final, ese momento ES cuando se ve.
    // Por eso el ganador ahora viaja 2 s antes de verse en vez de 17.
    out.push(momentoDosMs(e) + T.FINAL_DOS_MS);
    return out;
  }

  function liberaciones(escalones) {
    return momentos(escalones).map(function (m) {
      return Math.max(0, m - T.MARGEN_ADELANTO_MS);
    });
  }

  // 🔴 SALE DE `revelacionVisibleMs`, no de `momentos[último] + GIRO_FINAL`.
  // Al quitar el giro final se me quedó sumándolo y el total daba 97 s en vez
  // de 82: `duracionTotal` gobierna el umbral de «dentro del show» —el que
  // decide sincronizar o repetir—, así que habría mentido por quince segundos.
  // Derivándolo de la revelación, los dos caminos (con y sin escalera) salen
  // bien sin un caso especial.
  function duracionTotal(escalones) {
    if (!momentos(escalones).length) return 0;
    return revelacionVisibleMs(escalones) + T.REVELACION_MS;
  }

  // ── Cuándo quedan los FINALISTAS en pie, en ms desde `creado_at` ─────────
  // Es el fin de la última ronda de eliminación: de ahí arranca el final.
  function momentoFinalistasMs(escalones) {
    var e = Array.isArray(escalones) ? escalones : [];
    var n = e.length;
    if (n < 2) return T.CUENTA_321_MS;
    return T.CUENTA_321_MS + presentarMs(e) + (n - 2) * T.RONDA_MS;
  }

  // ── Cuándo se apaga UNO de los 3 y quedan DOS ────────────────────────────
  // 🔴 ESTE MOMENTO GOBIERNA UN GATEO PROPIO. Para apagar a uno de los tres, la
  // página necesita saber CUÁL — o sea, quiénes son los DOS que siguen. Ese
  // dato NO puede viajar antes, porque saber quiénes son los dos es saber
  // quién NO ganó, y a cinco segundos del final eso es medio spoiler.
  //
  // ⚠️ No se agrega un escalón de 2 a `escalones`: el POZO DEL RE-GIRO sigue
  // siendo el de 3, por orden de Memo. Esto es revelación VISUAL de la misma
  // escalera, y viaja como un campo aparte (`dos`) con su propio momento.
  function momentoDosMs(escalones) {
    var e = Array.isArray(escalones) ? escalones : [];
    if (e.length < 2) return T.CUENTA_321_MS;
    return momentoFinalistasMs(e) + T.FINAL_TRES_MS;
  }

  // ── Cuándo TERMINA la presentación, en ms desde `creado_at` ──────────────
  // 🔴 NO es `momentos[1]`. Con la escalera corta [3,1] el escalón 1 ES el
  // último, así que su momento ya lleva sumado el SUSPENSO: usar `momentos[1]`
  // arrancaba el reloj «GANADOR EN» seis segundos tarde. Medido por el careo.
  function finPresentacionMs(escalones) {
    var e = Array.isArray(escalones) ? escalones : [];
    if (e.length < 2) return T.CUENTA_321_MS;   // giro directo: nada que presentar
    return T.CUENTA_321_MS + presentarMs(e);
  }

  // ── Cuándo se ENCIENDE la placa del ganador, en ms desde `creado_at` ─────
  // No es `momentos[último]` —ése es cuando ARRANCA el último giro—: la
  // revelación es cuando la tragamonedas frena y la cara aparece.
  function revelacionVisibleMs(escalones) {
    var e = Array.isArray(escalones) ? escalones : [];
    var m = momentos(e);
    if (!m.length) return 0;
    // Con escalera, el último momento YA ES la revelación (no hay giro final).
    // Sin escalera —los dos giros de Natanael— la cara aparece cuando la
    // tragamonedas frena, así que ahí sí se suma el giro.
    if (e.length < 2) return m[m.length - 1] + T.GIRO_FINAL_MS;
    return m[m.length - 1];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 🔴 CUÁNDO **ARRANCA** CADA FASE — QUE NO ES CUÁNDO SE LIBERA SU DATO
  //
  // `momentos()` es el calendario de LIBERACIÓN: cuándo puede salir el dato de
  // cada escalón. Para las rondas de eliminación coincide con el arranque de su
  // animación, pero para la ÚLTIMA no: su momento es LA REVELACIÓN, y la
  // secuencia final (los 3 temblando → muere uno → la cuenta) tiene que
  // ARRANCAR trece segundos antes, en cuanto quedan los finalistas.
  //
  // Los tenía confundidos y el defecto fue exactamente éste: la pantalla
  // esperaba hasta el segundo 76 para empezar un final que debía TERMINAR ahí,
  // así que las tres fases se atropellaban en un instante. Medido: a t=75.8 s
  // las tarjetas estaban puestas y `tiemblan` valía 0.
  //
  // No son dos calendarios: es el MISMO, con la última entrada leída para lo
  // que es. El dato del ganador sigue saliendo en `momentos[último]`.
  function arranques(escalones) {
    var e = Array.isArray(escalones) ? escalones : [];
    var m = momentos(e);
    if (e.length < 2) return m.slice();
    var out = m.slice();
    out[e.length - 1] = momentoFinalistasMs(e);
    return out;
  }

  // ── El reloj «GANADOR EN», de punta a punta ──────────────────────────────
  // Arranca cuando los 24 YA ESTÁN (o sea `momentos[1]`, el fin de la
  // presentación) y cuenta hasta que la placa se enciende. Derivado: mover
  // cualquier fase lo mueve, y no hay un «0:45» tecleado que se quede viejo.
  function cuentaGanadorMs(escalones) {
    var e = Array.isArray(escalones) ? escalones : [];
    if (e.length < 2) return 0;          // giro directo: no hay qué contar
    return revelacionVisibleMs(e) - finPresentacionMs(e);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EL TEXTO DE «CÓMO FUNCIONA» — UNA SOLA DEFINICIÓN PARA DOS PÁGINAS
  //
  // 🔒 Lo piden `/sorteo` Y `/giveaway`. Copiado en los dos HTML sería la
  // misma trampa de siempre: el día que la mecánica cambie, uno de los dos se
  // queda viejo y nadie se entera — es lo que pasó con `flash_promo`, con el
  // chip de PROMO-DERIVA-1 y con las cuatro constantes de fecha de este mismo
  // módulo.
  //
  // ⚠️ Devuelve HTML con `<b>`, y es seguro a propósito: lo ÚNICO variable son
  // ENTEROS (el total y los escalones), forzados con Math.floor(Number(...)).
  // Ni un dato de una persona pasa por aquí.
  function textoComoFunciona(total) {
    var n = Math.max(0, Math.floor(Number(total) || 0));
    var e = escalonesPara(n);
    if (e.length < 2) return [];         // con menos de 3 no hay rondas que explicar
    var finalistas = e[e.length - 2];
    return [
      'De los <b>' + n + '</b> registrados, la máquina saca <b>' + e[0] + '</b> al azar,'
        + ' uno por uno.',
      'Cada ronda se apaga la mitad: <b>' + e.join(' → ') + '</b>.',
      'Los <b>' + finalistas + '</b> finalistas pasan a la tragamonedas, que gira una última vez.',
      '<b>Todo al azar, todos con la misma probabilidad.</b> Lo decide el servidor'
        + ' antes de empezar.',
    ];
  }

  var API = {
    T: T, escalonesPara: escalonesPara, momentos: momentos,
    liberaciones: liberaciones, duracionTotal: duracionTotal,
    presentarMs: presentarMs, revelacionVisibleMs: revelacionVisibleMs,
    cuentaGanadorMs: cuentaGanadorMs, finPresentacionMs: finPresentacionMs,
    momentoFinalistasMs: momentoFinalistasMs, momentoDosMs: momentoDosMs,
    arranques: arranques,
    textoComoFunciona: textoComoFunciona,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else if (typeof window !== 'undefined') window.SORTEO_TIEMPOS = API;
})();
