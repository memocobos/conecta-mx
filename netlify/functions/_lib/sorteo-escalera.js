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
  const f = azar || alAzar;
  const revuelto = revolver(lista, f);
  const orden = revuelto.slice(0, esc[0]).map((r) => ({
    id: r.id, nombre: r.nombre, folio: r.folio,
  }));
  return { v: 1, escalones: esc, orden, primero: primeroEnMorir(orden, esc, f) };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 QUIÉN SE APAGA PRIMERO EN EL FINAL — UN BIT DE AZAR PROPIO, GUARDADO
//
// De los 3 finalistas se apaga UNO y quedan 2 con la cuenta. Elegir a ése
// «por folio más alto» —como se hacía— parecía imparcial (los dos pierden
// igual) y era una FUGA peor que la que venía a tapar: el que muere primero
// resulta ser una FUNCIÓN DE LA POSICIÓN DEL GANADOR, porque el mosaico va
// ordenado por folio. Medido sobre 2 000 corridas:
//
//     posición 0 → muere primero   0 de 2 000   ( 0.0 %)
//     posición 1 →               705 de 2 000   (35.3 %)
//     posición 2 →              1295 de 2 000   (64.8 %)
//
// O sea: la tarjeta de la IZQUIERDA nunca se apaga en ese momento —lo que se
// ve igual en cada ensayo—, y peor: si se apaga la del MEDIO, el ganador es
// la de la derecha con CERTEZA, cinco segundos antes de la revelación.
//
// Se arregla con un bit de azar que no depende del ganador: cuál de los DOS
// perdedores cae primero, sorteado con el mismo `crypto` y GUARDADO en la
// escalera. Guardado —y no calculado al vuelo en cada respuesta— porque dos
// personas mirando en dos teléfonos tienen que ver apagarse la MISMA tarjeta.
//
// Así P(cada posición muera primero) = 2/3 · 1/2 = 1/3, y ver quién cae deja
// a los otros dos en 50/50: es la MÍNIMA información que se puede dar, porque
// apagar a alguien es decir que ése perdió.
function primeroEnMorir(orden, esc, azar) {
  const f = azar || alAzar;
  if (!Array.isArray(orden) || !Array.isArray(esc) || esc.length < 2) return null;
  const finalistas = orden.slice(0, esc[esc.length - 2]);
  const ganadorId = String((orden[0] || {}).id);
  const perdedores = finalistas.filter((r) => String(r.id) !== ganadorId);
  if (!perdedores.length) return null;
  return String(perdedores[f(perdedores.length)].id);
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

// ── EL FOLIO: la posición en el orden de registro ──────────────────────────
// 🔒 UNA SOLA DEFINICIÓN. Vivía suelto dentro de giveaway-estado.js y ahora lo
// necesitan DOS lugares: la escalera (para guardarlo) y la respuesta pública
// (para ordenar por él). Contados distinto, el número del mosaico y el del
// tercer rodillo dirían cosas diferentes en cámara.
//
// ⚠️ CUENTA A LOS ELIMINADOS. El folio es «el N-ésimo en inscribirse», y eso no
// cambia porque después se le dé de baja: recalcularlo sin ellos le movería el
// folio a todos los que entraron después. `registrosPorCreado` viene ordenado
// por `creado_at.asc` y SIN filtros.
function folios(registrosPorCreado) {
  const m = {};
  (Array.isArray(registrosPorCreado) ? registrosPorCreado : [])
    .forEach((r, i) => { if (r && r.id) m[String(r.id)] = i + 1; });
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTIR EL NOMBRE — mudado desde giveaway-estado.js
//
// Allá era local y ningún arnés podía tocarlo, así que las cuatro formas duras
// que el padrón REAL delató vivían documentadas en un comentario y no medidas.
// Aquí se exporta y se carea. En México los apellidos son DOS y van al final,
// con dos excepciones que salieron del padrón, no de ejemplos inventados:
//
//   · dos palabras: "Juan Pérez"                          → "Juan" / "Pérez"
//   · partículas:   "Juan Del Ángel Pérez"                → "Juan" / "Del Ángel Pérez"
//                   "Jorge Monserrath Lopez de Leon"      → "…Monserrath" / "Lopez de Leon"
//                   "María de los Angeles Izaguirre Cruz" → "María de los Angeles" / "Izaguirre Cruz"
//
// (a) si los dos últimos EMPIEZAN con partícula, en realidad son UN apellido
// (b) si lo que queda justo antes es partícula, es parte del apellido
//
// ⚠️ sorteo.html tiene su propio `partir()` para los RODILLOS, ya careado contra
// éste. Mudar esta copia NO crea un gemelo nuevo: quita uno que no se podía
// medir.
const PARTICULAS = /^(de|del|la|las|los|y|da|di)$/i;
function partirNombre(completo) {
  const p = String(completo || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return null;
  if (p.length === 1) return { nombre: p[0], apellido: '' };
  if (p.length === 2) return { nombre: p[0], apellido: p[1] };
  let corte = p.length - 2;
  if (corte > 1 && PARTICULAS.test(p[corte])) corte--;
  while (corte > 1 && PARTICULAS.test(p[corte - 1])) corte--;
  return { nombre: p.slice(0, corte).join(' '), apellido: p.slice(corte).join(' ') };
}

// «Ana M.» — lo que ve el público de un finalista. El nombre COMPLETO es solo
// del ganador, y sale por otro campo (`ultimo.nombre`), con su propio gateo.
function nombreCorto(completo) {
  const p = partirNombre(completo);
  if (!p) return '';
  if (!p.apellido) return p.nombre;
  return p.nombre + ' ' + p.apellido.charAt(0).toUpperCase() + '.';
}

// «AM» — para la tarjeta de quien NO tiene foto aprobada. Nunca una tarjeta
// muda: sin foto hay iniciales.
function iniciales(completo) {
  const p = partirNombre(completo);
  if (!p) return '';
  return (p.nombre.charAt(0) + (p.apellido.charAt(0) || '')).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// LA PROYECCIÓN PÚBLICA — el gateo por tiempo y el orden neutro
//
// 🔴 DOS COSAS QUE ESTA FUNCIÓN EXISTE PARA EVITAR:
//
// 1. EL SPOILER. Antes de esto la respuesta traía `ganador_nombre` desde el
//    segundo cero y el show dura 2:12: cualquiera con la consola abierta sabía
//    el ganador dos minutos antes que la cámara. Aquí cada ronda sale SOLO
//    cuando le toca, con un margen corto de adelanto.
//
// 2. EL ORDEN. `rondas.orden` está en orden de REVOLTURA, o sea que su primer
//    elemento ES el ganador. Publicar ese orden sería publicar la respuesta.
//    Cada ronda se re-ordena por FOLIO, que es la posición en el orden de
//    registro y no tiene nada que ver con la revoltura.
//
// El reloj entra como PARÁMETRO (`transcurridoMs`) para que se pueda congelar
// en un careo: un arnés que lee Date.now() mide otra corrida.
//
// `fotoDeId(id) -> url | null` lo inyecta el llamador, que es quien sabe qué
// fotos están APROBADAS y quien puede firmar. Aquí no hay IO.
function proyectarRondas(o) {
  const rondas = (o && o.rondas) || null;
  const esc = (rondas && Array.isArray(rondas.escalones)) ? rondas.escalones : [];
  const orden = (rondas && Array.isArray(rondas.orden)) ? rondas.orden : [];
  const mm = (o && Array.isArray(o.momentos)) ? o.momentos : [];
  const margen = Number((o && o.margenMs) || 0);
  const t = Number((o && o.transcurridoMs) || 0);
  const fotoDeId = (o && o.fotoDeId) || function () { return null; };
  // La ciudad la inyecta el llamador, igual que la foto: aquí no hay IO. Es
  // dato PÚBLICO por decisión de Memo (de ella depende el premio), y va en la
  // ficha para que el mosaico diga «Karla M. · Guadalajara».
  const ciudadDeId = (o && o.ciudadDeId) || function () { return null; };

  const libera = (k) => Math.max(0, (mm[k] || 0) - margen);

  const out = [];
  let siguiente = null;
  for (let k = 0; k < esc.length; k++) {
    if (t < libera(k)) {
      if (siguiente === null) siguiente = libera(k) - t;
      continue;
    }
    const miembros = orden.slice(0, esc[k])
      // 🔒 AQUÍ MUERE EL ORDEN DE LA REVOLTURA. El `slice()` de arriba ya
      // devolvió copia, así que el `sort` no puede mutar la columna guardada.
      .sort((a, b) => (Number(a.folio) || 0) - (Number(b.folio) || 0))
      .map((r) => ({
        folio: Number(r.folio) || null,
        corto: nombreCorto(r.nombre),
        ini: iniciales(r.nombre),
        // Se re-declara en CADA ronda —con null explícito— para que un
        // «invalidar» posterior llegue a quien ya está mirando.
        foto: fotoDeId(r.id) || null,
        ciudad: ciudadDeId(r.id) || null,
      }));
    out.push({ i: k, tam: esc[k], miembros });
  }

  // Se calcula del RELOJ, no de `out.length`: así no depende de un invariante
  // del ciclo de arriba.
  const ganador_liberado = esc.length > 0 && t >= libera(esc.length - 1);

  // ═══ 🔴 «LOS DOS» — EL GATEO PROPIO DEL FINAL ═══════════════════════════
  //
  // Sin tragamonedas final, el clímax es la eliminación: de los 3 se apaga
  // UNO y quedan 2 temblando con la cuenta. Para apagar a uno, la página
  // necesita saber CUÁL — o sea quiénes son los dos que siguen — y ese dato NO
  // puede viajar antes de su momento, porque saber quiénes son los dos es
  // saber quién NO ganó.
  //
  // ⚠️ NO es un escalón de la escalera. `escalones` sigue siendo
  // [24,12,6,3,1] y el POZO DEL RE-GIRO sigue saliendo del 3 (orden de Memo):
  // esto es revelación VISUAL de la misma escalera, y por eso viaja aparte.
  //
  // 🔒 QUIÉN MUERE PRIMERO SE DECIDE POR FOLIO, no por la revoltura. Tomar
  // `orden[2]` habría sido lo natural de escribir y habría publicado un bit
  // del orden de la revoltura: quien juntara varios giros aprendería que el
  // primero en morir siempre es el índice 2. Por folio no se filtra nada —el
  // folio ya es público— y el resultado es igual de imparcial, porque los dos
  // son perdedores de todos modos.
  let dos = null;
  // `>= 2` y no `>= 3`: con la escalera corta [3,1] la longitud es DOS y
  // aun así hay tres finalistas y un ganador — el final es idéntico. Con
  // `>= 3` el sorteo de 3-5 personas se quedaba sin su clímax.
  if (esc.length >= 2 && Number.isFinite(o.momentoDosMs)) {
    const liberaDos = Math.max(0, o.momentoDosMs - margen);
    if (t >= liberaDos) {
      const tres = orden.slice(0, esc[esc.length - 2]);       // los 3 finalistas
      const ganadorId = String((orden[0] || {}).id);
      const perdedores = tres.filter((r) => String(r.id) !== ganadorId);
      // 🔒 DEL BIT GUARDADO, no del folio. Ver `primeroEnMorir`: por folio la
      // posición del que caía era una función del ganador (la izquierda NUNCA
      // caía, y la del medio lo delataba). `primero` es un sorteo aparte.
      //
      // ⚠️ El respaldo por folio se queda SOLO para las escaleras guardadas
      // antes de que `primero` existiera —las del ensayo— para que un show a
      // medias no se quede sin su clímax. No es el camino.
      const muere = perdedores.find((r) => String(r.id) === String(rondas.primero))
        || perdedores.slice().sort((a, b) => (Number(b.folio) || 0) - (Number(a.folio) || 0))[0];
      if (muere) {
        dos = tres.filter((r) => String(r.id) !== String(muere.id))
          .sort((a, b) => (Number(a.folio) || 0) - (Number(b.folio) || 0))
          .map((r) => Number(r.folio) || null);
      }
    } else if (siguiente === null || (liberaDos - t) < siguiente) {
      // El latido dirigido también tiene que despertar para ESTE momento.
      siguiente = liberaDos - t;
    }
  }

  return { rondas: out, rondas_totales: esc.length,
           siguiente_ronda_en_ms: siguiente, ganador_liberado, dos };
}

// ═══════════════════════════════════════════════════════════════════════════
// EL `resultado` QUE VE EL PÚBLICO — tres valores, no cuatro
//
// 🔴 `no_contesto` y `no_cumple` son hechos DISTINTOS y la base los distingue
// (uno no dio señales; el otro SÍ contestó pero no cumple las bases). En
// pantalla los dos dicen lo mismo —«Se vuelve a girar»— por orden de Memo.
//
// Pero la puerta pública NO puede afirmar `no_contesto` sobre alguien que sí
// contestó: sería la etiqueta equivocada sobre un hecho real, en público, con
// nombre — el defecto de `metodo_separo`. Por eso se derivan a un tercer valor
// neutro, y el motivo verdadero viaja SOLO por `estado_admin`, que exige token.
//
// Y con el ganador sin revelar TODO dice `pendiente`: si Memo pica un botón a
// media animación, la puerta pública no puede anunciar que ya se resolvió —la
// página se saltaría el show y quien mira vería el final antes del final.
function resultadoPublico(resultado, ganadorLiberado) {
  if (!ganadorLiberado) return 'pendiente';
  if (resultado === 'acepto') return 'acepto';
  if (resultado === 'pendiente') return 'pendiente';
  return 'se_regira';            // no_contesto | no_cumple
}

module.exports = {
  alAzar, revolver, construirEscalera, primeroEnMorir, pozoDeReGiro, folios,
  PARTICULAS, partirNombre, nombreCorto, iniciales,
  proyectarRondas, resultadoPublico,
};
