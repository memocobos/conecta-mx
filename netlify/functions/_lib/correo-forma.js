// =============================================================================
// _lib/correo-forma — ¿ese correo tiene forma de correo? (MIG-1d-i)
// =============================================================================
// Se extrajo de `admin-invitar-walkin`, donde vivía como dos helpers locales.
// MIG-1d va a invitar por lotes: si el lote valida distinto que el botón de uno
// en uno, son DOS reglas — y "dos listas iguales" no existe, solo "dos listas
// que todavía no divergen".
//
// NO valida que el correo EXISTA (eso solo lo dice el rebote). Ataja lo que se
// puede atajar antes de gastar un envío.
// =============================================================================

// Formato básico: algo@algo.tld con TLD de 2+ letras, sin espacios.
// [CORREO-PUNTOS-1, 3-nov-2026] …y SIN PUNTOS RAROS: dos puntos seguidos, o un
// punto al empezar/terminar el usuario o el dominio, no existen en un correo
// real (RFC 5321) — Resend lo rechaza y la persona se queda sin confirmación
// SIN que nadie se entere. Caso real: «miaa..galvarado002@gmail.com» (Mia,
// NSQK R-X4NMC) se aprobó y no le llegó nada.
function correoFormatoValido(correo) {
  const c = String(correo == null ? '' : correo).trim();
  if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(c)) return false;
  return !puntosRaros(c);
}

// ¿Trae puntos que ningún buzón acepta? (dos seguidos, o punto en la orilla
// del usuario o del dominio).
function puntosRaros(correo) {
  const c = String(correo == null ? '' : correo).trim();
  const at = c.lastIndexOf('@');
  if (at < 0) return false;
  const u = c.slice(0, at), d = c.slice(at + 1);
  return /\.\./.test(c) || u.startsWith('.') || u.endsWith('.') || d.startsWith('.') || d.endsWith('.');
}

// EL PORQUÉ, EN PALABRAS: '' si el correo es usable; si no, qué tiene. Es lo
// que el formulario del sitio, el servidor y la bandeja le DICEN a la persona —
// «no se ve bien» a secas manda a adivinar.
function problemaCorreo(correo) {
  const c = String(correo == null ? '' : correo).trim();
  if (!c) return 'falta el correo';
  if (/\s/.test(c)) return 'tiene espacios';
  if ((c.match(/@/g) || []).length !== 1) return 'le falta la @ (o trae más de una)';
  if (/\.\./.test(c)) return 'tiene dos puntos seguidos (..)';
  if (puntosRaros(c)) return 'tiene un punto pegado a la @ o en una orilla';
  if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(c)) return 'no termina como correo (ej. @gmail.com)';
  if (tldClaramenteMalo(c)) return 'termina en «.' + c.slice(c.lastIndexOf('.') + 1) + '» — ¿quisiste decir «.com»?';
  return '';
}

// TLD claramente mal escrito (típico de ".com" mal tecleado). Atrapa el caso que
// pasó: "gmail.con" tiene formato válido pero el correo no existe.
const _TLD_MALOS = ['con', 'cm', 'comm', 'ocm'];
function tldClaramenteMalo(correo) {
  const c = String(correo == null ? '' : correo).trim().toLowerCase();
  const dot = c.lastIndexOf('.');
  if (dot < 0) return false;
  return _TLD_MALOS.includes(c.slice(dot + 1));
}

// LA LLAVE DEL DEDUP. Minúsculas y sin espacios — y no es una elección de estilo:
// el trigger `clientes_before_insert` de la base del Portal hace
// `new.correo := lower(new.correo)`, y `clientes.correo` es UNIQUE. Normalizar
// distinto aquí insertaría un duplicado que la base rechazaría fila por fila.
function llaveCorreo(correo) {
  return String(correo == null ? '' : correo).trim().toLowerCase();
}

const esCorreoUsable = (c) => !!llaveCorreo(c) && correoFormatoValido(c) && !tldClaramenteMalo(c);

// LAS TALLAS QUE LA BASE ACEPTA. No es documentación: es el CHECK real de
// `clientes`, leído de la base el 7-sep-2026
//   CHECK (talla_playera = ANY (ARRAY['XS','S','M','L','XL','XXL']))
// `viajeros_evento.talla_playera` es texto LIBRE. Una talla que no esté en la
// lista haría que la base rechace ESA FILA sola, y el puente perdería a esa
// persona en silencio. Se normaliza o se manda null: null es «no sé», que es
// verdad; inventar una talla no lo es.
const TALLAS_VALIDAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
function tallaNormalizada(t) {
  const v = String(t == null ? '' : t).trim().toUpperCase().replace(/\s+/g, '');
  return TALLAS_VALIDAS.includes(v) ? v : null;
}

// [GENERO-2] El género del viajero, en la forma que guarda la base (CHECK H/M
// en viajeros_evento, requisiciones y clientes). Acepta la letra o la palabra;
// cualquier otra cosa → null (el llamador decide si eso es «falta» o «inválido»).
// Es el insumo de las Compartidas del rooming (regla firmada 30-oct: H con H, M con M).
function generoNormalizado(g) {
  const v = String(g == null ? '' : g).trim().toLowerCase();
  if (v === 'h' || v === 'hombre' || v === 'masculino') return 'H';
  if (v === 'm' || v === 'mujer' || v === 'femenino') return 'M';
  return null;
}

module.exports = { correoFormatoValido, puntosRaros, problemaCorreo, tldClaramenteMalo, llaveCorreo, esCorreoUsable, tallaNormalizada, TALLAS_VALIDAS, generoNormalizado };
