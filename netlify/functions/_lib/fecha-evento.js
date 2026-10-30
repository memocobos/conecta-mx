// =============================================================================
// _lib/fecha-evento.js — [FECHA-CORREO-1] la fecha LEGIBLE de UN evento_id,
// respetando el #N del multifecha. (30-oct-2026)
//
// Pedido de Memo que lo parió, citado: «al rechazar un evento, en el correo
// dice cuando y por ejemplo en eventos como fuerza regida que son 4 fechas le
// salen las 4 pero solo debería de salir la fecha del día que le estamos
// rechazando … para que no sea confuso». Medido: los SEIS correos de _lib
// (rechazo, cambio, paquete, ajuste, confirmación, invitación) pintaban `ev.f`
// — el texto GLOBAL del evento («11, 12, 15 y 16 ene 2027») — aunque la
// solicitud/el viajero traen el evento_id con su #N (fuerzaregida#1 = 12-ene).
//
// ESTE ES EL DUEÑO. Los correos le preguntan a él; nadie re-deriva la fecha
// por su cuenta. La regla:
//   · evento SIN multifecha (o eventoId sin #N) → `ev.f`, TAL CUAL.
//     🔒 Y esto no es pereza: es el candado de PN27 — palnorte tapa su fecha
//     con f_texto ('Por confirmar') mientras su `ds` guarda 2027-03-26 para el
//     sistema. Derivar del ds en un evento de una fecha FUGARÍA la fecha que
//     la ficha esconde a propósito. `ev.f` ya trae el override honrado.
//   · evento multifecha + #N → la fecha de ESA entrada, formateada del ds con
//     el estilo de la casa («12 ene 2027»). El ds lo da `dsDeEvento` de
//     _lib/plan-pagos, el dueño del «#N → ds» (jamás una segunda escalera).
//   · un pase de VARIOS días (corona «Vie + Sáb · 2 días») conserva su `lbl`:
//     el ds solo dice cuándo ARRANCA, y pelado se leería como un viaje de un
//     solo día — se pinta «Vie + Sáb · 2 días · desde el 20 nov 2026».
//   · #N que la ficha NO tiene → '' (SIN fecha). La ley de PLAN-PAGOS-1:
//     enseñar la fecha de otro día — o las de TODOS — es peor que no enseñar
//     ninguna. Jamás se cae a `ev.f` desde un #N que no resolvió.
//
// PURA y síncrona: recibe el ev ya leído del catálogo. El parseo del ds es
// TEXTUAL (YYYY-MM-DD → «12 ene 2027»), cero objetos Date — la ley de
// toISOString no puede morder lo que nunca toca un reloj ni un huso.
// =============================================================================
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// 'YYYY-MM-DD…' → «12 ene 2027». Lo que no tenga esa forma → ''.
function fmtDs(ds) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ds == null ? '' : ds).trim());
  if (!m) return '';
  const mes = MESES[Number(m[2]) - 1];
  if (!mes) return '';
  return Number(m[3]) + ' ' + mes + ' ' + m[1];
}

// (ev del catálogo, eventoId tal cual viene — 'fuerzaregida#1', 'emmanuel', …)
// → la fecha legible de ESE viaje, o '' cuando no se puede decir sin mentir.
function fechaDeEventoId(ev, eventoId) {
  if (!ev) return '';
  const f = String(ev.f || '').trim();
  const id = String(eventoId == null ? '' : eventoId);
  const m = /#(\d+)$/.exec(id);
  const esMulti = Array.isArray(ev.multifecha) || Array.isArray(ev.dsList);
  // Sin #N, o evento de UNA fecha (aunque el id traiga un #0 heredado):
  // el `f` del catálogo manda — es el único que honra f_texto (PN27).
  if (!m || !esMulti) return f;
  const i = Number(m[1]);
  // El «#N → ds» se le pregunta a SU dueño (plan-pagos). Dentro de un
  // multifecha sus ramas son exactamente dsList[i] || multifecha[i].ds || null.
  const { dsDeEvento } = require('./plan-pagos');
  const dsF = fmtDs(dsDeEvento(ev, id));
  const mf = Array.isArray(ev.multifecha) ? ev.multifecha[i] : null;
  const lbl = mf && mf.lbl ? String(mf.lbl).trim() : '';
  // Un pase multidía no se reduce a su día de arranque: la etiqueta ES la compra.
  if (lbl && /d[ií]as/i.test(lbl) && !/·\s*1\s*d[ií]a\b/i.test(lbl)) {
    return dsF ? lbl + ' · desde el ' + dsF : lbl;
  }
  if (dsF) return dsF;
  if (lbl) return lbl; // sin ds pero con etiqueta: mejor la etiqueta que nada
  return ''; // #N que la ficha no tiene: SIN fecha — jamás las fechas de todos
}

module.exports = { fechaDeEventoId, fmtDs };
