// =============================================================================
// _lib/normalizar-zona — EL DUEÑO de «¿son la misma zona?» (ZONA-NORM-1)
// =============================================================================
// Medido por Jane el 25-sep-2026: SIETE eventos tenían la misma zona escrita
// distinto entre lo capturado y la ficha —«Retractil» vs «Retráctil», «VIP» vs
// «Vip», «Balcon» vs «Balcón», «GENERAL» vs «General»—. El stock casa por
// cadena EXACTA, así que esas filas restaban de una llave que NO EXISTE: el
// aviso del publish consulta la ortografía de la ficha y no encuentra nada.
//
// 🔒 LA FUENTE DEL DRIFT NO SE VA A ARREGLAR SOLA: es la pestaña del Excel, y
// ahí se seguirá escribiendo sin acento. Jane alineó los datos de hoy; esto
// cierra el hoyo de mañana. Remedido el 25-sep, DESPUÉS de su alineación:
// siguen vivos 5 grupos en 4 eventos (alfredito «Retráctil Vip»/«Retráctil
// VIP» · frontera#1 «Retractil Oro»/«Retráctil Oro» · hilary «Seccion C»/
// «Sección C» y «Seccion D»/«Sección D» · ultramexico «General»/«GENERAL»).
// O sea que no es solo el futuro: es hoy.
//
// 🔒 SOLO EL CASAMIENTO. Lo GUARDADO y lo PINTADO no se tocan: la ficha sigue
// siendo la ortografía canónica y los avisos siguen diciendo el nombre tal cual
// lo escribió Memo. Esto es la llave con la que se comparan, no el dato.
//
// 🔒 ES LA MISMA FORMA QUE `normalizarNombre` del careo del Excel, y por eso
// esa función pasa a PEDÍRSELA en vez de repetirla: dos normalizadores «iguales»
// son dos listas que todavía no divergen, y el día que uno aprenda a quitar
// puntos y el otro no, una zona casaría en el careo y no en el stock.
//
// ⚠️ EL PRECIO, MEDIDO ANTES DE COBRARLO: si una ficha tuviera DOS zonas
// distintas que normalizadas coincidan («Vip» y «VIP» como zonas separadas),
// esto las FUNDIRÍA. Barrido del catálogo servido el 25-sep-2026: **265 listas
// de zonas, 2 302 zonas, CERO colisiones**. Y el careo deja un VIGILANTE VIVO
// sobre el árbol de trabajo, porque eso es un hecho del catálogo de hoy y no
// del par de commits: el día que nazca un par así, se pone rojo.
//
//   normalizarZona('  Retráctil   ORO ') === 'retractil oro'
// =============================================================================

function normalizarZona(s) {
  return String(s == null ? '' : s)
    // Los acentos por su RANGO, no escritos literales: un literal queda a
    // merced del editor y del encoding del archivo.
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

module.exports = { normalizarZona };
