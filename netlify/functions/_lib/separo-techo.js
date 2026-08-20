// =============================================================================
// _lib/separo-techo.js — [COT-FIX-1] Un separo NUNCA puede superar el total
//
// El 20-ago-2026 una cotización de yandel imprimió un "resto a cubrir" de
// −$5,200 y un calendario con CINCO pagos de −$1,040, con el botón de RESERVAR
// vivo. La causa fue un dato: `sep_cheap:5300` capturado en Esferas, cuando la
// zona CHEAP más barata de ese evento cuesta $2,700. Dos viajeros: total 5,400,
// separo 10,600.
//
// Este módulo es el candado de ENTRADA: rechaza el dato al capturarlo, para que
// no llegue nunca al catálogo. Los candados de SALIDA (calcular() del index y
// _vtaCalc de kamehouse) siguen ahí como segunda línea — un dato imposible
// tiene que tronar visible aunque se cuele por otro camino.
//
// ── POR QUÉ SOLO `sep_cheap` ────────────────────────────────────────────────
// El techo "separo ≤ zona más barata" es EXACTO para CHEAP, y solo para CHEAP:
// el paquete CHEAP es "Solo boleto", así que su total ES el precio de la zona.
//
// En PLUS/RIDE/STAY el total suma hotel y transporte, así que un separo por
// encima de la zona más barata puede ser perfectamente válido. Poner aquí el
// mismo techo daría FALSOS POSITIVOS y bloquearía capturas correctas. Esos
// paquetes quedan cubiertos por el candado de cotización, que compara contra el
// total ya calculado — el único momento en que ese total se conoce.
//
// ── POR QUÉ LAS ZONAS EN 0 NO CUENTAN ───────────────────────────────────────
// Una zona con `pc: 0` no es una zona gratis: es una que NO SE VENDE (agotada o
// próximamente, sin precio todavía). Si entrara al mínimo, el techo sería 0 y
// rechazaría cualquier separo — o peor, con `>=` dejaría pasar solo el 0.
// El mínimo se toma sobre lo VENDIBLE.
// =============================================================================

// Precio de la zona CHEAP vendible más barata. `null` si el evento no vende
// ninguna zona cheap — y entonces no hay techo que aplicar (el compilador
// tampoco emite `sepCheap` en ese caso).
function minCheapVendible(zonas) {
  const ps = (Array.isArray(zonas) ? zonas : [])
    .filter((z) => z && !z.ag && Number(z.pc) > 0)
    .map((z) => Number(z.pc));
  return ps.length ? Math.min(...ps) : null;
}

// Devuelve null si todo bien, o { error, detalle } si el separo cheap es
// imposible. El caller responde 422: no es un problema de formato (eso sería
// 400) ni de permiso (403) — es un dato bien formado que describe algo que no
// puede existir.
function revisarSepCheap(sepCheap, zonas) {
  if (sepCheap == null || sepCheap === '') return null;      // sin capturar: no hay nada que revisar
  const n = Number(sepCheap);
  if (!Number.isFinite(n)) return null;                      // basura: la sanea el endpoint, no esto
  const min = minCheapVendible(zonas);
  if (min == null) return null;                              // sin zonas cheap vendibles, sin techo
  if (n <= min) return null;
  return {
    error: 'El separo CHEAP supera el precio de la zona más barata',
    detalle: `separo CHEAP $${n} > zona vendible más barata $${min}. `
           + 'Un separo mayor que el total deja al cliente con un saldo NEGATIVO '
           + 'y un calendario de pagos en rojo. Corrige el separo o el precio de la zona.',
    sep_cheap: n,
    min_zona_cheap: min,
  };
}

module.exports = { revisarSepCheap, minCheapVendible };
