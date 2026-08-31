// =============================================================================
// _lib/precios-vigentes — el precio que regía en una fecha (ROL-HIST-1)
// =============================================================================
// TODO lo que decide vive aquí, en funciones PURAS, para que un arnés pueda
// interrogarlas con las filas reales de `precios_historial`. El endpoint solo
// trae filas y pinta la respuesta; el gancho del publish solo compara y escribe.
//
// EL RELOJ ES EL DE REYNOSA — `America/Matamoros`, NO Monterrey ni Cancún.
// Reynosa SÍ cambia con EE.UU. (8-mar → 1-nov) y Monterrey dejó de hacerlo en
// 2022: son 133 días al año en que un separo capturado «el 27» caería en el día
// equivocado si se usara el huso de al lado. `toISOString()` no sirve para nada
// de esto: da la fecha de Greenwich, y aquí se trabaja de noche.
//
// UN DÍA PUEDE TENER VARIOS PRECIOS. Memo lo confirmó y el historial lo prueba:
// el 29-ago, `omar#1`/Platino B valió $4,900 a las 13:54 y $5,400 a las 14:12.
// Por eso la respuesta NO es «el precio del día»: es el precio AL ABRIR el día
// más CADA cambio de ese día con su hora. Elegir por quien captura sería
// inventar cuál de los dos le tocó a esa persona.
// =============================================================================

const TZ = 'America/Matamoros';

// Cuánto le lleva el huso al UTC EN ESE INSTANTE (cambia con el horario de
// verano, que es justo lo que Monterrey ya no hace y Reynosa sí).
function _offsetMs(instante, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const parte of f.formatToParts(instante)) p[parte.type] = parte.value;
  const comoSiFueraUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    p.hour === '24' ? 0 : Number(p.hour), Number(p.minute), Number(p.second));
  return comoSiFueraUTC - instante.getTime();
}

// La medianoche de ese día EN REYNOSA, como instante.
//
// Dos pasadas a propósito: el offset se mide sobre un instante TENTATIVO, y si
// ese tentativo cae del otro lado de un cambio de horario, el offset que
// devuelve no es el del instante real. La segunda pasada lo corrige. Es barato
// y quita una clase entera de error que solo aparece dos días al año.
function inicioDelDia(fechaYMD, tz) {
  const zona = tz || TZ;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaYMD || ''))) return null;
  const tentativo = new Date(String(fechaYMD) + 'T00:00:00Z');
  if (!isFinite(tentativo.getTime())) return null;
  let inst = new Date(tentativo.getTime() - _offsetMs(tentativo, zona));
  inst = new Date(tentativo.getTime() - _offsetMs(inst, zona));
  return inst;
}

// El día siguiente, en la MISMA cuenta: no se suman 24 horas —un día con cambio
// de horario dura 23 o 25— sino que se pide el inicio del día de calendario que
// sigue.
function finDelDia(fechaYMD, tz) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaYMD || ''))) return null;
  const d = new Date(String(fechaYMD) + 'T00:00:00Z');
  if (!isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return inicioDelDia(d.toISOString().slice(0, 10), tz);
}

function horaReynosa(instante, tz) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: tz || TZ, hour12: false, hour: '2-digit', minute: '2-digit',
  }).format(instante instanceof Date ? instante : new Date(instante));
}

// UN PRECIO 0 NO ES UN PRECIO: es la zona CERRADA en ese momento. Se devuelve
// marcado para que la pantalla lo diga, y JAMÁS se aplica como cotización — 83
// de las 591 filas sembradas son ceros, así que no es un caso de laboratorio.
function _fila(f, conHora, tz) {
  const precio = Number(f.precio);
  const o = {
    precio: precio,
    cerrada: precio === 0,
    aplicable: precio > 0,
    vigente_desde: f.vigente_desde,
    fuente: f.fuente || null,
  };
  if (conHora) o.hora = horaReynosa(new Date(f.vigente_desde), tz);
  return o;
}

// filas: las de `precios_historial` para UN evento_id + ambito + zona, en
// cualquier orden. fechaYMD: 'AAAA-MM-DD' tal como la tecleó quien captura.
//
// Devuelve:
//   sin_historial:true          → la tabla no sabe nada de esta zona. REGLA DE
//                                 LA CASA: ausencia = nunca cambió, así que el
//                                 llamador responde con el precio del catálogo.
//   anterior_al_historial:true  → la fecha es anterior a la primera fila. Se
//                                 devuelve LA PRIMERA, dicho con todas sus
//                                 letras: es lo más viejo que se sabe, no lo
//                                 que regía ese día.
//   al_abrir                    → el precio con el que amaneció ese día.
//   cambios[]                   → cada cambio DENTRO del día, con su hora.
function resolverVigentes(filas, fechaYMD, tz) {
  const zona = tz || TZ;
  const ini = inicioDelDia(fechaYMD, zona);
  const fin = finDelDia(fechaYMD, zona);
  // La fecha se valida ANTES de mirar las filas: sin fecha buena no hay
  // respuesta posible, y contestar `sin_historial` sería mentir con otra cara.
  if (!ini || !fin) return { error: 'fecha inválida: se espera AAAA-MM-DD' };

  const lista = (filas || []).filter((f) => f && f.vigente_desde != null && f.precio != null);
  if (!lista.length) return { sin_historial: true, anterior_al_historial: false, al_abrir: null, cambios: [] };

  const orden = lista.slice().sort((a, b) => new Date(a.vigente_desde) - new Date(b.vigente_desde));
  const t = (f) => new Date(f.vigente_desde).getTime();

  // ANTES del día: la última manda. `<` y no `<=` a propósito — una fila puesta
  // exactamente a la medianoche es un cambio DE ese día, no el precio con el
  // que amaneció.
  const antes = orden.filter((f) => t(f) < ini.getTime());
  const dentro = orden.filter((f) => t(f) >= ini.getTime() && t(f) < fin.getTime());
  const dia = { inicio: ini.toISOString(), fin: fin.toISOString(), tz: zona };

  if (!antes.length) {
    // La fecha es anterior a todo lo que sabemos. Se contesta con la primera
    // fila y se DICE, en vez de fingir que ese precio regía ese día.
    return {
      sin_historial: false, anterior_al_historial: true,
      al_abrir: _fila(orden[0], false, zona),
      cambios: dentro.map((f) => _fila(f, true, zona)),
      dia,
    };
  }
  return {
    sin_historial: false, anterior_al_historial: false,
    al_abrir: _fila(antes[antes.length - 1], false, zona),
    cambios: dentro.map((f) => _fila(f, true, zona)),
    dia,
  };
}

// ── EL GANCHO DEL PUBLISH ────────────────────────────────────────────────────
// Compara lo que se acaba de compilar contra lo último que sabe el historial y
// devuelve LAS FILAS A INSERTAR. No escribe: escribir es del endpoint, y así
// esto se puede carear sin base de por medio.

// Las zonas de un objeto EV compilado, con la multifecha desdoblada POR ÍNDICE
// (`slug#0`, `slug#1`) — que es como llavea el historial y como llavea /rol.
function zonasDelObjeto(obj, slug) {
  const out = [];
  const meter = (eventoId, ambito, lista) => {
    (Array.isArray(lista) ? lista : []).forEach((z) => {
      if (!z || !z.n) return;
      out.push({ evento_id: eventoId, ambito: ambito, zona: String(z.n), precio: Number(z.p) || 0 });
    });
  };
  meter(slug, 'zonas', obj && obj.zonas);
  meter(slug, 'cheapZonas', obj && obj.cheapZonas);
  if (Array.isArray(obj && obj.multifecha)) {
    obj.multifecha.forEach((mf, i) => {
      if (!mf) return;
      meter(slug + '#' + i, 'zonas', mf.zonas);
      meter(slug + '#' + i, 'cheapZonas', mf.cheapZonas);
    });
  }
  return out;
}

// La llave se arma con un separador EXPLÍCITO. La primera versión usaba una
// comilla con un espacio dentro y el espacio acabó siendo un byte NUL —
// invisible en el editor, invisible en el diff, y el Map dejaba de casar con
// las llaves que arma quien lo llama. Un `join` con un carácter que se VE no
// se puede corromper así en silencio.
const _llave = (x) => [x.evento_id, x.ambito, x.zona].join('|');

// 🔒 LO QUE LA TABLA ACEPTA EN `fuente`. No es documentación: es el CHECK real
// de `precios_historial`, leído de la base el 31-ago-2026
//   CHECK (fuente = ANY (ARRAY['backfill-git','publish']))
// La primera versión de la línea base emitía 'publish-base' para distinguirla
// del cambio observado, y la base la habría RECHAZADO fila por fila — el
// historial se habría quedado sin líneas base, con el error dentro de la
// respuesta y a nadie mirándolo. Se emite 'publish' para las dos.
// ⚠️ Se pierde poder distinguir la línea base RECONSTRUIDA del cambio OBSERVADO.
// Recuperarlo cuesta un ALTER de una línea; mientras no exista, no se inventa un
// valor que la tabla no acepta.
const FUENTES_VALIDAS = ['backfill-git', 'publish'];

// nuevas   : zonasDelObjeto() del árbol que se acaba de compilar
// ultimas  : Map llave → { precio } — la ÚLTIMA fila del historial de esa zona
// previas  : Map llave → precio que tenía el ÁRBOL ANTES del publish, o
//            undefined si el evento no estaba en el index (es un alta)
// ahoraISO : el instante del publish
//
// LA LÍNEA BASE. Cuando una zona cambia y el historial no la conoce, no basta
// con anotar el precio nuevo: sin una fila que diga qué valía ANTES, cualquier
// fecha anterior al cambio se quedaría sin respuesta —o peor, contestaría el
// precio nuevo como si hubiera regido siempre—. Por eso el caso primera-vez
// inserta DOS filas: el precio viejo como línea base y el nuevo con la de ahora.
function filasDelPublish({ nuevas, ultimas, previas, ahoraISO, vigenteDesdeBase }) {
  const filas = [];
  const uM = ultimas || new Map();
  const pM = previas || new Map();
  (nuevas || []).forEach((z) => {
    const k = _llave(z);
    const ultima = uM.get(k);
    if (ultima != null) {
      if (Number(ultima.precio) !== z.precio) {
        filas.push({ evento_id: z.evento_id, ambito: z.ambito, zona: z.zona,
                     precio: z.precio, vigente_desde: ahoraISO, fuente: 'publish' });
      }
      return;
    }
    // Sin historial para esta zona: se mira el árbol de ANTES.
    const previo = pM.get(k);
    if (previo == null) return;                  // alta: no hay cambio que anotar
    if (Number(previo) === z.precio) return;     // no cambió: nada que decir
    filas.push({ evento_id: z.evento_id, ambito: z.ambito, zona: z.zona,
                 precio: Number(previo), vigente_desde: vigenteDesdeBase || ahoraISO, fuente: 'publish' });
    filas.push({ evento_id: z.evento_id, ambito: z.ambito, zona: z.zona,
                 precio: z.precio, vigente_desde: ahoraISO, fuente: 'publish' });
  });
  return filas;
}

module.exports = {
  TZ, inicioDelDia, finDelDia, horaReynosa,
  resolverVigentes, zonasDelObjeto, filasDelPublish, _llave, _offsetMs, FUENTES_VALIDAS,
};
