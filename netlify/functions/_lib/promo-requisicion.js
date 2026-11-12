// =============================================================================
// _lib/promo-requisicion — REQ-CODIGO-1 (12-nov-2026). Palabra de Memo: «que el
// código llegue a la requisición con todo y código y lo calcule, porque luego
// no nos vamos a dar cuenta».
//
// Antes, el código de descuento SOLO vivía en el navegador: el cotizador bajaba
// el precio y la requisición nacía con el total SIN descuento (el servidor lo
// recalcula con resolverPrecioVenta y el código se perdía). Bulma/Milk tenían
// que acordarse de restarlo a mano al aprobar.
//
// Hoy el index manda `codigo` y este lib lo VALIDA contra el PROMOS del index
// SERVIDO (la misma copia que el cliente ve — la fila de Baba no es lo que el
// sitio honra) con las MISMAS reglas de validarPromo() del index, y aplica la
// MISMA aritmética de calcular():
//   · segundoPax  → total = precio de la persona 1 + precio fijo de la 2ª
//   · amount      → total − amount × personas
//   · pct/pctCheap→ total − round(total × pct / 100)
// El separo NO cambia (en el sitio tampoco).
//
// 🔒 Y los usos se cuentan AQUÍ, en el servidor — en el navegador solo vivían
//    en localStorage (cualquiera con el código lo usaba): `maxUsos` < 9999
//    cuenta requisiciones vivas (pendiente/aprobada) con ese código, y
//    `singleUse` impide que la MISMA persona (correo o celular) lo use dos
//    veces. Una rechazada no cuenta.
// Puro: recibe el PROMOS, el evento y el precio; la lectura del index y de
// los usos la hace quien llama.
// =============================================================================

function _hoyMx(ahora) {
  return new Date(ahora || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
}

// validar({ PROMOS, codigo, ev, paquete, zona, personas, ahora }) →
//   { ok:true, codigo, p } | { ok:false, error }
function validar({ PROMOS, codigo, ev, paquete, zona, personas, ahora }) {
  const c = String(codigo || '').toUpperCase().trim();
  if (!c) return { ok: false, error: 'sin código' };
  const p = PROMOS && PROMOS[c];
  const t = ahora ? new Date(ahora).getTime() : Date.now();
  if (!p) return { ok: false, error: `el código ${c} no es válido` };
  if (p.startTs && t < p.startTs) return { ok: false, error: `el código ${c} aún no está activo` };
  if (p.expiresTs) { if (t > p.expiresTs) return { ok: false, error: `el código ${c} ya expiró` }; }
  else if (p.expires && _hoyMx(t) > p.expires) return { ok: false, error: `el código ${c} ya expiró` };
  const slug = ev && ev.id;
  if (p.onlyEvent || p.onlyEvents) {
    const ids = p.onlyEvents || [p.onlyEvent];
    if (!slug || ids.indexOf(slug) < 0) return { ok: false, error: `el código ${c} no aplica para este evento` };
  } else if (!p.allEvents) {
    if (!ev || !ev.promo) return { ok: false, error: `el código ${c} no aplica para este evento` };
  }
  if (p.exactPersonas && personas !== p.exactPersonas) return { ok: false, error: `${c} aplica solo para ${p.exactPersonas} personas` };
  if (p.excludePkg && p.excludePkg.indexOf(paquete) >= 0) return { ok: false, error: `el código ${c} no aplica al paquete ${String(paquete).toUpperCase()}` };
  if (p.segundoPax && p.segundoPax[paquete] === undefined) return { ok: false, error: `el código ${c} no aplica al paquete ${String(paquete).toUpperCase()}` };
  if (p.onlyZones && p.onlyZones.length && (!zona || p.onlyZones.indexOf(zona) < 0)) return { ok: false, error: `el código ${c} es solo para la zona ${p.onlyZones.join(' / ')}` };
  if (p.excludeZones && zona && slug) {
    const x = p.excludeZones[slug];
    if (x && x.indexOf(zona) >= 0) return { ok: false, error: `el código ${c} no aplica en la zona ${zona}` };
  }
  return { ok: true, codigo: c, p };
}

// aplicar({ p, paquete, personas, total, precio_unit }) → { total, descuento }
// La aritmética de calcular() del index, renglón por renglón.
function aplicar({ p, paquete, personas, total, precio_unit }) {
  const n = Math.max(1, Number(personas) || 1);
  const lista = Math.round(Number(total) || 0);
  let nuevo = lista;
  if (p.segundoPax && p.segundoPax[paquete] !== undefined) {
    nuevo = Math.round(Number(precio_unit) || 0) + (Number(p.segundoPax[paquete]) || 0);
  } else if (p.amount) {
    nuevo = Math.max(0, lista - Number(p.amount) * n);
  } else if (p.pct || p.pctCheap) {
    const pct = (paquete === 'cheap' && p.pctCheap) ? p.pctCheap : p.pct;
    nuevo = lista - Math.round(lista * Number(pct) / 100);
  }
  nuevo = Math.max(0, Math.round(nuevo));
  return { total: nuevo, descuento: Math.max(0, lista - nuevo) };
}

// ¿Ya se agotó? usos = filas vivas con ese código; mias = las de esta persona.
function revisarUsos({ p, codigo, usos, mias }) {
  const max = Number(p.maxUsos);
  if (Number.isFinite(max) && max > 0 && max < 9999 && usos >= max) return { ok: false, error: `el código ${codigo} ya se usó todas las veces permitidas` };
  if (p.singleUse && mias > 0) return { ok: false, error: `ya usaste el código ${codigo} en otra reservación` };
  return { ok: true };
}

module.exports = { validar, aplicar, revisarUsos };
